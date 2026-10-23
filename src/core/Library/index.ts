import { readPart, type Part } from '../Part'
import { SvgFile } from '../SvgFile'
import { getPins, type PinGeometry } from '../Pins'
import { VIEWS, type ViewName } from '../Layer'
import type { Bundle, BundleFile, Instance } from '../Sketch'
import { generateFzp, generateSvg, needsParametric, setParametric, getNetLabel, holeSvg, isResizableBoard, netLabelSvg, padSvg, resizeBoardSvg, resizeHolesSvg, sizeSvg, stripboardSvg } from '../Generator'
import { MIL_PER_INCH } from '../Units'
import { Font, type Fonts } from '../Font'

export type PartLocation = { root: string, path: string }

export type Source = {
    locate: (moduleIds: string[]) => Promise<Record<string, PartLocation>>
    read: (root: string, path: string) => Promise<string | null>
    has: (root: string, path: string) => boolean
}

const ROOTS   = ['parts', 'app']
const FOLDERS = ['core', 'obsolete', 'contrib', 'user']

type Loaded = { part: Part, svgs: Partial<Record<ViewName, SvgFile>>, complete: boolean }

// PASTA DO SVG INSTALADO: A RAIZ DA PEÇA PRIMEIRO, DEPOIS AS OUTRAS (SPEC 01 §1.1)
export const findSvg = (has: Source['has'], root: string, image: string) => [root, ...ROOTS.filter(other => other !== root)].flatMap(top => FOLDERS.map(folder => [top, `svg/${folder}/${image}`] as const)).find(([top, path]) => has(top, path))

// CATÁLOGO DAS PEÇAS EM USO: DEFINIÇÃO, SVG DE CADA VISTA E PINOS POR CAMADA
export class Library {
    source: Source
    parts = new Map<string, Part>()
    svgs = new Map<string, Partial<Record<ViewName, SvgFile>>>()
    pins = new Map<string, Map<string, PinGeometry>>()
    bundled = new Map<string, Part>()
    bundleParts = new Map<string, BundleFile>()
    bundleSvgs: BundleFile[] = []
    variants = new Map<string, SvgFile>()
    variantIds = new Map<string, string>()
    locations = new Map<string, PartLocation>()
    fonts: Fonts = new Map()
    revision = 0

    constructor(source: Source) {
        this.source = source
    }

    addFont(key: string, bytes: Uint8Array) {
        const font = new Font(bytes)
        font.update()
        this.fonts.set(key, font)
    }

    addBundle(bundle: Bundle) {
        bundle.parts.forEach(file => {
            const part = readPart(file.text)

            if (!part)
                return

            if (this.parts.has(part.moduleId) && this.parts.get(part.moduleId) === this.bundled.get(part.moduleId))
                return    // JÁ CARREGADA DE UM PACOTE (REABRIR O .fzz): A PRIMEIRA FICA, SENÃO O SALVAR DEIXA A PEÇA FORA DO ARQUIVO

            this.bundled.set(part.moduleId, part)
            this.bundleParts.set(part.moduleId, file)
        })

        this.bundleSvgs = [...this.bundleSvgs, ...bundle.svgs]
        return bundle.parts.flatMap(file => readPart(file.text)?.moduleId ?? [])
    }

    // PEÇA PRÓPRIA REGRAVADA PELO EDITOR: SAI O QUE FOI LIDO DELA E DO PACOTE ANTIGO, PARA O PACOTE NOVO VALER (Save DO EDITOR SOBRE A PEÇA DO USUÁRIO)
    forget(moduleId: string) {
        const images = Object.values(this.bundled.get(moduleId)?.views ?? {}).flatMap(view => this.findBundled(view?.image ?? '') ?? [])
        this.bundleSvgs = this.bundleSvgs.filter(file => !images.includes(file))
        ;[this.parts, this.svgs, this.bundled, this.bundleParts, this.locations].forEach(table => table.delete(moduleId))
        ;[...this.pins.keys()].filter(key => key.startsWith(`${moduleId}|`)).forEach(key => this.pins.delete(key))
        this.revision++
    }

    async load(moduleIds: string[]) {
        const missing  = [...new Set(moduleIds)].filter(id => !this.parts.has(id))
        const located  = missing.length ? await this.source.locate(missing) : {}
        const loaded   = await Promise.all(missing.map(id => this.loadOne(id, located[id])))

        loaded.forEach(item => {
            if (!item)
                return

            this.parts.set(item.part.moduleId, item.part)
            this.svgs.set(item.part.moduleId, item.svgs)
        })

        this.revision += loaded.some(Boolean) ? 1 : 0
        return loaded.filter(Boolean).length
    }

    async loadOne(moduleId: string, location: PartLocation | undefined) {
        const text      = location ? await this.source.read(location.root, location.path) : generateFzp(moduleId)

        if (location)
            this.locations.set(moduleId, location)

        const part      = text ? readPart(text, location?.root === 'app') : null

        if (part && Object.values(part.views).some(view => needsParametric(view?.image ?? '')))
            setParametric(await import('../Parametric'))

        const installed = part ? await this.loadSvgs(part, svg => this.readInstalled(location?.root ?? 'parts', svg)) : null
        const bundled   = this.bundled.get(moduleId)

        if (installed && (installed.complete || !bundled))
            return installed

        return bundled ? this.loadSvgs(bundled, svg => Promise.resolve(this.readBundled(svg))) : installed
    }

    async loadSvgs(part: Part, read: (image: string) => Promise<string | null>): Promise<Loaded> {
        const views = VIEWS.filter(view => part.views[view]?.image)
        const texts = await Promise.all(views.map(view => read(part.views[view]?.image ?? '')))
        const svgs  = Object.fromEntries(views.flatMap((view, i) => {
            const text = texts[i]

            if (!text)
                return []

            const svg = new SvgFile(text)
            svg.update()
            return svg.root ? [[view, svg]] : []
        }))
        return { part, svgs, complete: views.every(view => svgs[view]) }
    }

    readInstalled(root: string, image: string) {
        const found = findSvg(this.source.has, root, image)
        return found ? this.source.read(found[0], found[1]) : Promise.resolve(generateSvg(image))
    }

    findBundled(image: string) {
        const exact = `svg.${image.replaceAll('/', '.')}`
        const tail  = image.slice(image.indexOf('/') + 1)
        return this.bundleSvgs.find(file => file.name === exact) ?? this.bundleSvgs.find(file => file.name.includes(tail))
    }

    readBundled(image: string) {
        return this.findBundled(image)?.text ?? generateSvg(image)
    }

    // .fzp DA PEÇA EM USO COMO TEXTO: O DO PACOTE SE A PEÇA VEIO DELE, O INSTALADO OU O GERADO (EDITOR DE PEÇAS, SPEC 01 §8A.1)
    async getFzpText(moduleId: string) {
        const location = this.locations.get(moduleId)

        if (this.bundleParts.has(moduleId) && this.parts.get(moduleId) === this.bundled.get(moduleId))
            return this.bundleParts.get(moduleId)?.text ?? null

        return location ? this.source.read(location.root, location.path) : generateFzp(moduleId)
    }

    // SVG DE QUALQUER VISTA DA PEÇA, ÍCONE INCLUSIVE, PELA MESMA ORIGEM DO .fzp
    async getImageText(moduleId: string, view: ViewName) {
        const part     = this.parts.get(moduleId)
        const image    = part?.views[view]?.image ?? ''
        const location = this.locations.get(moduleId)

        if (!part || !image)
            return null

        if (part === this.bundled.get(moduleId))
            return this.readBundled(image)

        return this.readInstalled(location?.root ?? 'parts', image)
    }

    // ARQUIVOS DE PACOTE DAS PEÇAS QUE VIERAM DE .fzz/.fzpz E ESTÃO EM USO, PARA REEMPACOTAR NO .fzz (SPEC 01 §6.1)
    getBundleFiles(moduleIds: string[]) {
        const used = [...new Set(moduleIds)].filter(moduleId => this.bundleParts.has(moduleId) && this.parts.get(moduleId) === this.bundled.get(moduleId))
        const svgs = used.flatMap(moduleId => Object.values(this.bundled.get(moduleId)?.views ?? {}).flatMap(view => this.findBundled(view?.image ?? '') ?? []))
        return [...new Set([...used.flatMap(moduleId => this.bundleParts.get(moduleId) ?? []), ...svgs])]
    }

    getPart(moduleId: string) {
        return this.parts.get(moduleId)
    }

    getSvg(moduleId: string, view: ViewName) {
        return this.svgs.get(moduleId)?.[view]
    }

    // VARIANTE GERADA PELAS PROPRIEDADES LOCAIS DA INSTÂNCIA (NET LABEL, PLACA REDIMENSIONÁVEL, PLANO DE COBRE, LOGO, FURO/VIA, hole size); VAZIO QUANDO A PEÇA USA O SVG DO ACERVO (SPEC 01 §5.7, §8.9–§8.11)
    getVariant(instance: Instance | undefined, view: ViewName) {
        const part    = this.parts.get(instance?.moduleIdRef ?? '')
        const merged  = { ...part?.properties, ...instance?.properties }
        const options = part && instance && view === 'schematicView' ? getNetLabel(part.moduleId, part.version, merged) : null
        const board   = part && instance && view === 'pcbView' && isResizableBoard(part.moduleId) && Number(merged.width) > 0 && Number(merged.height) > 0
        const fill    = part?.kind === 'copperFill' && view === 'pcbView' ? instance?.properties.svg ?? '' : ''
        const logo    = part?.kind === 'logo' || part?.moduleId.endsWith('BoardLogoImageModuleID') ? instance?.properties.shape ?? '' : ''
        const base    = part ? this.getSvg(part.moduleId, view) : undefined
        const drilled = part && view === 'pcbView' && (part.kind === 'via' || part.kind === 'hole')
        const padded  = part && view === 'pcbView' && (part.kind === 'blocker' || /^(Copper0)?PadModuleID$/.test(part.moduleId))
        const layer   = part?.views.pcbView?.layers.find(name => name.startsWith('copper')) ?? 'copper1'
        const holes   = part?.kind === 'part' && view === 'pcbView' && base && instance?.properties['hole size'] && instance.properties['hole size'] !== part.properties['hole size']
        const strips  = part && view === 'breadboardView' && /Stripboard2?ModuleID$/.test(part.moduleId)

        const key = !part                ? '' :
                    options              ? `${part.moduleId}|${options.label}|${options.left}|${options.style}|${options.divisor}` :
                    board && base        ? `${part.moduleId}|${merged.width}|${merged.height}` :
                    fill                 ? fill :
                    logo                 ? `${merged.width}|${merged.height}|${logo}` :
                    drilled              ? `${part.kind}|${merged['hole size']}|${part.views.pcbView?.layers.join(',')}` :
                    padded               ? `${part.moduleId}|${merged.width}|${merged.height}|${merged.connect}` :
                    holes                ? `${part.moduleId}|holes|${merged['hole size']}` :
                    strips               ? `${part.moduleId}|strips|${merged.layout}|${merged.buses}` : ''

        if (!key)
            return ''

        if (!this.variantIds.has(key)) {
            const pin    = part?.kind === 'via' ? 'connector0pin' : 'nonconn0'
            const layers = part?.views.pcbView?.layers.filter(layer => layer.startsWith('copper')) ?? []
            const scale  = base ? base.viewBox[2] / base.inches / MIL_PER_INCH : 1
            const [w, h] = [Number(merged.width), Number(merged.height)]
            const text   = strips  ? stripboardSvg(part.moduleId, merged) ?? '' :
                           options ? netLabelSvg(options) :
                           board   ? resizeBoardSvg(base?.text ?? '', w, h) :
                           fill    ? fill :
                           logo    ? sizeSvg(logo, w, h) :
                           drilled ? holeSvg(merged['hole size'], pin, layers) ?? '' :
                           padded  ? padSvg(layer, part?.kind === 'blocker', w, h, merged.connect ?? 'center') : resizeHolesSvg(base?.text ?? '', merged['hole size'] ?? '', scale)
            const svg    = new SvgFile(text)
            svg.update()

            const id = svg.root ? `v${this.variants.size}` : ''
            this.variantIds.set(key, id)

            if (id)
                this.variants.set(id, svg)
        }

        return this.variantIds.get(key) ?? ''
    }

    getInstanceSvg(instance: Instance | undefined, view: ViewName) {
        const variant = this.getVariant(instance, view)
        return variant ? this.variants.get(variant) : this.getSvg(instance?.moduleIdRef ?? '', view)
    }

    getLayerPins(moduleId: string, view: ViewName, layer: string, variant = '') {
        const key  = `${moduleId}|${variant}|${view}|${layer}`
        const part = this.parts.get(moduleId)
        const svg  = variant ? this.variants.get(variant) : this.getSvg(moduleId, view)

        if (!this.pins.has(key) && part && svg)
            this.pins.set(key, getPins(part, svg, view, layer))

        return this.pins.get(key) ?? new Map<string, PinGeometry>()
    }

    getPins(moduleId: string, view: ViewName, preferred: string, variant = '') {
        const layers = this.parts.get(moduleId)?.views[view]?.layers ?? []
        const order  = [preferred, ...layers.filter(layer => layer !== preferred)].filter(layer => layers.includes(layer))
        const merged = new Map<string, PinGeometry>()

        order.forEach(layer => this.getLayerPins(moduleId, view, layer, variant).forEach((pin, id) => merged.has(id) || merged.set(id, pin)))
        return merged
    }
}
