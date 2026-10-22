import { childNamed, childrenNamed, childrenOf, parseXml, serializeXml, tagOf, textOf, walk, type XmlElement } from '../Xml'
import type { BundleFile } from '../Sketch'

export type DraftView      = 'breadboardView' | 'schematicView' | 'pcbView' | 'iconView'
export type DraftPin       = { layer: string, svgId: string, terminalId: string }
export type DraftConnector = { id: string, name: string, description: string, type: string, pins: Partial<Record<DraftView, DraftPin[]>> }
export type HistoryEntry   = { date: string, author: string, mode: string, description: string }

export const DRAFT_VIEWS: DraftView[] = ['breadboardView', 'schematicView', 'pcbView', 'iconView']
export const DRAFT_FIELDS = ['title', 'author', 'description', 'label', 'url', 'version', 'date'] as const
export const HISTORY_MODES = ['optional', 'recommended', 'required']

const FOLDERS: Record<DraftView, string> = { breadboardView: 'breadboard', schematicView: 'schematic', pcbView: 'pcb', iconView: 'icon' }
const PICK      = 'data-pe'    // ÍNDICE DE CADA ELEMENTO DO SVG NA CÓPIA DE TRABALHO: O CLIQUE NA TELA ACHA O ELEMENTO POR ELE
const COPPER    = ['copper0', 'copper1']
const GEOMETRY  = ['cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'd', 'points', 'x1', 'y1', 'x2', 'y2', 'transform']
const DANGEROUS = new Set(['script', 'foreignObject', 'iframe', 'object', 'embed'])
const SVG_NS    = 'http://www.w3.org/2000/svg'
const NUMBER    = /\d+/
const ISO_DATE  = /^\d{4}-\d{2}-\d{2}$/
const ANCHORS   = ['date', 'author', 'title', 'version']    // O HISTÓRICO ENTRA DEPOIS DO PRIMEIRO DESTES QUE EXISTIR
const ALIASES: Record<string, string> = { silent: 'required', forced: 'recommended', ask: 'optional' }

const attributesOf = (element: XmlElement) => Array.from({ length: element.attributes.length }, (_, i) => element.attributes[i])

const numberOf = (text: string) => Number(text.match(NUMBER)?.[0] ?? -1)

const documentOf = (node: XmlElement) => node.ownerDocument as NonNullable<XmlElement['ownerDocument']>

const dateOf = (entry: HistoryEntry) => ISO_DATE.test(entry.date) && !Number.isNaN(Date.parse(entry.date)) ? Date.parse(entry.date) : -Infinity

const sortHistory = (history: HistoryEntry[]) => [...history].sort((a, b) => dateOf(a) - dateOf(b) || 0)

export const canonicalMode = (mode: string) => ALIASES[mode] ?? (HISTORY_MODES.includes(mode) ? mode : 'optional')

// VERSÃO SEGUINTE: VAZIA VIRA 1, O NÚMERO DO FIM SOBE UM (1.9 → 1.10), SEM NÚMERO NO FIM FICA (SPEC 01 §8A.7)
export const bumpVersion = (current: string) => {
    const value = current.trim()
    const tail  = value.match(/^(.*?)(\d+)$/)
    return !value ? '1' :
           tail   ? `${tail[1]}${Number(tail[2]) + 1}` : value
}

// SVG DE ARQUIVO SEM O QUE EXECUTA: script, foreignObject E PARECIDOS, ATRIBUTOS on* E LINKS javascript: (SPEC 01 §8A.4)
export const cleanSvg = (root: XmlElement) => {
    const doomed: XmlElement[] = []

    walk(root, element => {
        if (DANGEROUS.has(tagOf(element)))
            return void doomed.push(element)

        attributesOf(element).filter(attribute => /^on/i.test(attribute.name) || (/href$/i.test(attribute.name) && /^\s*javascript:/i.test(attribute.value))).forEach(attribute => element.removeAttribute(attribute.name))
    })

    doomed.forEach(element => element.parentNode?.removeChild(element))
    return root
}

// CÓPIA DE TRABALHO DE UMA PEÇA NO EDITOR: O .fzp E O SVG DE CADA VISTA, COM AS EDIÇÕES DA SPEC 01 §8A
export class PartDraft {
    fzpText: string
    svgTexts: Partial<Record<DraftView, string>>
    fzp: XmlElement | null = null
    svgs: Partial<Record<DraftView, XmlElement>> = {}

    constructor(fzpText: string, svgTexts: Partial<Record<DraftView, string>>) {
        this.fzpText  = fzpText
        this.svgTexts = svgTexts
    }

    update() {
        this.fzp  = parseXml(this.fzpText)
        this.svgs = {}
        Object.entries(this.svgTexts).forEach(([view, text]) => this.setSvg(view as DraftView, text ?? ''))
    }

    setSvg(view: DraftView, text: string) {
        const root = parseXml(text)

        if (!root || tagOf(root) !== 'svg')
            return false

        let index = 0
        walk(cleanSvg(root), element => element.setAttribute(PICK, String(index++)))
        this.svgs[view] = root
        return true
    }

    get root() {
        if (!this.fzp)
            throw new Error('PartDraft sem update()')

        return this.fzp
    }

    child(parent: XmlElement, tag: string) {
        const found = childNamed(parent, tag)

        if (found)
            return found

        const made = documentOf(parent).createElement(tag)
        parent.appendChild(made)
        return made
    }

    getField(name: typeof DRAFT_FIELDS[number]) {
        return textOf(childNamed(this.root, name)).trim()
    }

    setField(name: typeof DRAFT_FIELDS[number], value: string) {
        this.child(this.root, name).textContent = value
    }

    getTags() {
        return childrenNamed(childNamed(this.root, 'tags'), 'tag').map(textOf).map(tag => tag.trim()).filter(Boolean)
    }

    setTags(tags: string[]) {
        const parent = this.child(this.root, 'tags')
        childrenOf(parent).forEach(element => parent.removeChild(element))
        tags.map(tag => tag.trim()).filter(Boolean).forEach(tag => {
            const element = documentOf(parent).createElement('tag')
            element.textContent = tag
            parent.appendChild(element)
        })
    }

    // REVISÕES DA MAIS ANTIGA À MAIS NOVA; PEÇA SEM <history> GANHA UMA ENTRADA COM SEUS <date> E <author> (SPEC 01 §8A.7)
    getHistory(): HistoryEntry[] {
        const listed = childrenNamed(this.root, 'history').map(element => ({ date: element.getAttribute('date') ?? '', author: element.getAttribute('author') ?? '', mode: element.getAttribute('mode') || 'optional', description: textOf(element).trim() }))
        const legacy = this.getField('date') || this.getField('author') ? [{ date: this.getField('date'), author: this.getField('author'), mode: 'optional', description: '' }] : []
        return sortHistory(listed.length ? listed : legacy)
    }

    setHistory(history: HistoryEntry[]) {
        const root   = this.root
        const sorted = sortHistory(history)
        const newest = sorted[sorted.length - 1]
        let after    = ANCHORS.map(tag => childNamed(root, tag)).find(element => element) ?? null
        childrenNamed(root, 'history').forEach(element => root.removeChild(element))

        sorted.forEach(entry => {
            const element = documentOf(root).createElement('history')
            Object.entries({ date: entry.date, author: entry.author, mode: entry.mode || 'optional' }).forEach(([name, value]) => element.setAttribute(name, value))

            if (entry.description)
                element.textContent = entry.description

            root.insertBefore(element, after ? after.nextSibling : root.firstChild)
            after = element
        })

        if (newest) {
            this.setField('author', newest.author)
            this.setField('date', newest.date)
        }
    }

    // ENTRADA QUE O REGISTRO AO GRAVAR ABRE: A DE HOJE, SE EXISTE, SENÃO UMA NOVA COM O AUTOR DA PEÇA
    getSeed(today: string): HistoryEntry {
        return this.getHistory().filter(entry => entry.date === today).pop() ?? { date: today, author: this.getField('author'), mode: 'optional', description: '' }
    }

    // REVISÃO REGISTRADA AO GRAVAR: TOMA O LUGAR DA ENTRADA DE HOJE, SE EXISTE; bump SOBE A VERSÃO MESMO SEM ENTRADA (SPEC 01 §8A.7)
    record(entry: HistoryEntry | null, bump: boolean, today: string) {
        const history = this.getHistory()
        const row     = history.map(item => item.date).lastIndexOf(today)

        if (entry)
            this.setHistory(row >= 0 ? history.map((item, i) => i === row ? entry : item) : [...history, entry])

        if (bump)
            this.setField('version', bumpVersion(this.getField('version')))
    }

    getProperties(): [string, string][] {
        return childrenNamed(childNamed(this.root, 'properties'), 'property').map(element => [element.getAttribute('name') ?? '', textOf(element)])
    }

    // TABELA NOVA DE PROPRIEDADES: AS QUE JÁ EXISTIAM GUARDAM OS OUTROS ATRIBUTOS (showInLabel…)
    setProperties(entries: [string, string][]) {
        const parent = this.child(this.root, 'properties')
        const old    = new Map(childrenNamed(parent, 'property').map(element => [(element.getAttribute('name') ?? '').toLowerCase(), element]))
        childrenOf(parent).forEach(element => parent.removeChild(element))

        entries.filter(([name]) => name.trim()).forEach(([name, value]) => {
            const element = old.get(name.trim().toLowerCase()) ?? documentOf(parent).createElement('property')
            element.setAttribute('name', name.trim())
            element.textContent = value
            parent.appendChild(element)
        })
    }

    // variant AUSENTE OU JÁ USADA NA FAMÍLIA VIRA "variant N" COM O MENOR N LIVRE (SPEC 01 §8A.5)
    ensureVariant(taken: string[]) {
        const entries = this.getProperties()
        const current = entries.find(([name]) => name.toLowerCase() === 'variant')?.[1] ?? ''
        const used    = new Set(taken.map(value => value.trim().toLowerCase()))

        if (current && !used.has(current.trim().toLowerCase()))
            return current

        const fresh = `variant ${Array.from({ length: used.size + 1 }, (_, i) => i + 1).find(n => !used.has(`variant ${n}`))}`
        this.setProperties(current ? entries.map(([name, value]): [string, string] => [name, name.toLowerCase() === 'variant' ? fresh : value]) : [...entries, ['variant', fresh]])
        return fresh
    }

    connectorElements() {
        return childrenNamed(childNamed(this.root, 'connectors'), 'connector')
    }

    getConnectors(): DraftConnector[] {
        return this.connectorElements().map(element => ({
            id: element.getAttribute('id') ?? '',
            name: element.getAttribute('name') ?? '',
            description: textOf(childNamed(element, 'description')).trim(),
            type: element.getAttribute('type') ?? 'male',
            pins: Object.fromEntries(DRAFT_VIEWS.map(view => [view, childrenNamed(childNamed(childNamed(element, 'views'), view), 'p').map(p => ({ layer: p.getAttribute('layer') ?? '', svgId: p.getAttribute('svgId') ?? '', terminalId: p.getAttribute('terminalId') ?? '' }))]))
        }))
    }

    setConnector(id: string, patch: Partial<Pick<DraftConnector, 'name' | 'description' | 'type'>>) {
        const element = this.connectorElements().find(item => item.getAttribute('id') === id)

        if (!element)
            return

        if (patch.name !== undefined)
            element.setAttribute('name', patch.name)

        if (patch.type !== undefined)
            element.setAttribute('type', patch.type)

        if (patch.description !== undefined)
            this.child(element, 'description').textContent = patch.description
    }

    // CAMADAS DO <p> DE UM CONECTOR NOVO NA VISTA: A PRIMEIRA CAMADA DA VISTA; NA PCB, CADA CAMADA DE COBRE DA PEÇA
    layersOf(view: DraftView) {
        const layers = childrenNamed(childNamed(childNamed(childNamed(this.root, 'views'), view), 'layers'), 'layer').map(layer => layer.getAttribute('layerId') ?? '').filter(Boolean)
        const copper = layers.filter(layer => COPPER.includes(layer))
        return view === 'pcbView' && copper.length ? copper : layers.slice(0, 1)
    }

    // NOVOS CONECTORES COM O PRÓXIMO NÚMERO LIVRE, CLONANDO O PRIMEIRO; MENOS CONECTORES APAGA OS DE MAIOR NÚMERO E OS IDS DELES NOS SVG (SPEC 01 §8A.3)
    setCount(count: number) {
        const parent   = this.child(this.root, 'connectors')
        const elements = this.connectorElements()

        if (count < elements.length)
            return elements.sort((a, b) => numberOf(a.getAttribute('id') ?? '') - numberOf(b.getAttribute('id') ?? '')).slice(count).forEach(element => {
                const id = element.getAttribute('id') ?? ''
                DRAFT_VIEWS.forEach(view => this.unassign(view, id))
                parent.removeChild(element)
            })

        let next = Math.max(-1, ...elements.flatMap(element => [numberOf(element.getAttribute('id') ?? ''), numberOf(element.getAttribute('name') ?? '')]))

        for (let i = elements.length; i < count; i++) {
            const id      = `connector${++next}`
            const element = elements[0] ? elements[0].cloneNode(true) as XmlElement : documentOf(parent).createElement('connector')
            const views   = this.child(element, 'views')
            element.setAttribute('id', id)
            element.setAttribute('name', `pin ${next}`)
            element.setAttribute('type', element.getAttribute('type') || 'male')
            this.child(element, 'description').textContent = `pin ${next}`

            DRAFT_VIEWS.filter(view => view !== 'iconView' && this.svgs[view]).forEach(view => {
                const holder = this.child(views, view)
                const pins   = childrenNamed(holder, 'p')

                if (!pins.length)
                    this.layersOf(view).forEach(layer => holder.appendChild(this.newPin(holder, layer, `${id}pin`)))

                childrenNamed(holder, 'p').forEach(p => {
                    p.removeAttribute('terminalId')
                    p.removeAttribute('legId')
                    p.setAttribute('svgId', `${id}pin`)
                })
            })

            parent.appendChild(element)
        }
    }

    newPin(holder: XmlElement, layer: string, svgId: string) {
        const p = documentOf(holder).createElement('p')
        p.setAttribute('layer', layer)
        p.setAttribute('svgId', svgId)
        return p
    }

    pinsOf(view: DraftView, id: string) {
        const element = this.connectorElements().find(item => item.getAttribute('id') === id)
        return element ? childrenNamed(childNamed(childNamed(element, 'views'), view), 'p') : []
    }

    elementsWithId(view: DraftView, id: string) {
        const found: XmlElement[] = []
        const root  = this.svgs[view]

        if (root && id)
            walk(root, element => element.getAttribute('id') === id && found.push(element))

        return found
    }

    getElement(view: DraftView, index: string) {
        let found: XmlElement | null = null
        const root = this.svgs[view]

        if (root)
            walk(root, element => found = found ?? (element.getAttribute(PICK) === index ? element : null))

        return found as XmlElement | null
    }

    // CONECTOR CUJO ELEMENTO (OU TERMINAL) É ESTE NA VISTA
    findConnector(view: DraftView, index: string) {
        const id = this.getElement(view, index)?.getAttribute('id')
        return id ? this.getConnectors().find(connector => connector.pins[view]?.some(pin => pin.svgId === id || pin.terminalId === id))?.id ?? null : null
    }

    unassign(view: DraftView, connectorId: string) {
        this.pinsOf(view, connectorId).forEach(p => {
            this.elementsWithId(view, p.getAttribute('svgId') ?? '').forEach(element => element.removeAttribute('id'))
            this.elementsWithId(view, p.getAttribute('terminalId') ?? '').forEach(element => element.parentNode?.removeChild(element))
            p.removeAttribute('terminalId')
        })
    }

    // ELEMENTO GÊMEO NA OUTRA CAMADA DE COBRE: MESMA TAG E MESMA GEOMETRIA (OS SVG DE PCB REPETEM O PAD EM copper0 E copper1)
    twinOf(view: DraftView, element: XmlElement) {
        const layer = (node: XmlElement | null): string | null => !node || node.nodeType !== 1 ? null : COPPER.includes(node.getAttribute('id') ?? '') ? node.getAttribute('id') : layer(node.parentNode as XmlElement)
        const own   = layer(element)
        const shape = (node: XmlElement) => GEOMETRY.map(name => node.getAttribute(name) ?? '').join('|')
        let twin: XmlElement | null = null

        if (view !== 'pcbView' || !own || !this.svgs[view])
            return null

        walk(this.svgs[view] as XmlElement, node => twin = twin ?? (node !== element && tagOf(node) === tagOf(element) && shape(node) === shape(element) && layer(node) !== null && layer(node) !== own ? node : null))
        return twin as XmlElement | null
    }

    // O ELEMENTO CLICADO PASSA A SER O DO CONECTOR NA VISTA (E O GÊMEO NA OUTRA CAMADA DE COBRE); SEM <p> NA VISTA, ELE É CRIADO (SPEC 01 §8A.4)
    assign(view: DraftView, connectorId: string, index: string) {
        const element   = this.getElement(view, index)
        const connector = this.connectorElements().find(item => item.getAttribute('id') === connectorId)

        if (!element || !connector)
            return

        const holder = this.child(this.child(connector, 'views'), view)

        if (!childrenNamed(holder, 'p').length)
            this.layersOf(view).forEach(layer => holder.appendChild(this.newPin(holder, layer, `${connectorId}pin`)))

        const svgId = this.pinsOf(view, connectorId)[0]?.getAttribute('svgId') || `${connectorId}pin`
        this.unassign(view, connectorId)
        this.pinsOf(view, connectorId).forEach(p => p.setAttribute('svgId', svgId))
        ;[element, this.twinOf(view, element)].forEach(node => node?.setAttribute('id', svgId))
    }

    // PONTO TERMINAL: NULO = CENTRO (SEM terminalId); SENÃO UM RETÂNGULO INVISÍVEL [x, y, largura, altura] NAS COORDENADAS DO PAI DO ELEMENTO, LOGO DEPOIS DELE (SPEC 01 §8A.4)
    setTerminal(view: DraftView, connectorId: string, rect: [number, number, number, number] | null) {
        const pins  = this.pinsOf(view, connectorId)
        const svgId = pins[0]?.getAttribute('svgId') ?? ''
        const id    = `${svgId.replace(/(pin|pad)$/, '')}terminal`

        pins.forEach(p => this.elementsWithId(view, p.getAttribute('terminalId') ?? '').forEach(element => element.parentNode?.removeChild(element)))
        pins.forEach(p => rect ? p.setAttribute('terminalId', id) : p.removeAttribute('terminalId'))

        if (!rect || !svgId)
            return

        this.elementsWithId(view, svgId).forEach(element => {
            const marker = documentOf(element).createElementNS(element.namespaceURI ?? SVG_NS, 'rect')
            const values = { id, x: rect[0], y: rect[1], width: rect[2], height: rect[3], fill: 'none', stroke: 'none', 'stroke-width': 0 }
            Object.entries(values).forEach(([name, value]) => marker.setAttribute(name, String(value)))
            element.parentNode?.insertBefore(marker, element.nextSibling)
        })
    }

    // ÍNDICE DE CADA ELEMENTO ATRIBUÍDO NA VISTA → CONECTOR, E OS CONECTORES SEM ELEMENTO NELA
    getAssignments(view: DraftView) {
        const assigned = new Map<string, string>()
        const missing: string[] = []

        this.getConnectors().forEach(connector => {
            const elements = (connector.pins[view] ?? []).flatMap(pin => this.elementsWithId(view, pin.svgId))
            elements.forEach(element => assigned.set(element.getAttribute(PICK) ?? '', connector.id))

            if (!elements.length && view !== 'iconView')
                missing.push(connector.id)
        })

        return { assigned, missing }
    }

    getSvgText(view: DraftView, picking = false) {
        const root = this.svgs[view]

        if (!root)
            return ''

        const copy = root.cloneNode(true) as XmlElement

        if (!picking)
            walk(copy, element => element.removeAttribute(PICK))

        return serializeXml(copy)
    }

    // PEÇA NOVA: moduleId, IMAGEM DE CADA VISTA EM <vista>/<moduleId>_<vista>.svg E OS ARQUIVOS DO .fzpz (SPEC 01 §6.2, §8A.5)
    export(moduleId: string): BundleFile[] {
        const root  = this.root.cloneNode(true) as XmlElement
        const views = childNamed(root, 'views')
        const svgs  = DRAFT_VIEWS.filter(view => this.svgs[view]).map(view => [view, `${FOLDERS[view]}/${moduleId}_${FOLDERS[view]}.svg`] as const)
        root.setAttribute('moduleId', moduleId)

        svgs.forEach(([view, image]) => {
            const layers = childNamed(childNamed(views, view), 'layers')
            layers?.setAttribute('image', image)
        })

        return [{ name: `part.${moduleId}.fzp`, text: `<?xml version='1.0' encoding='UTF-8'?>\n${serializeXml(root)}\n` }, ...svgs.map(([view, image]) => ({ name: `svg.${image.replaceAll('/', '.')}`, text: `<?xml version='1.0' encoding='UTF-8'?>\n${this.getSvgText(view)}\n` }))]
    }
}
