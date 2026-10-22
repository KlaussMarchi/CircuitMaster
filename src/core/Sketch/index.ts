import { strFromU8, strToU8, unzipSync, zipSync, type UnzipFileInfo } from 'fflate'
import { childNamed, childrenNamed, childrenOf, parseXml, tagOf, textOf, type XmlElement } from '../Xml'
import { VIEWS, type ViewName } from '../Layer'
import type { Matrix, Point } from '../Geometry'
import { PROBES_KEY, type Doc } from '../Document'
import { t } from '../Text'

export type Connect        = { modelIndex: string, connectorId: string, layer: string }
export type Leg            = { points: Point[], beziers: (number[] | null)[] }
export type ConnectorState = { id: string, layer: string, x: number, y: number, leg: Leg | null, connects: Connect[], groundFillSeed: boolean }
export type Geometry       = { x: number, y: number, z: number, transform: Matrix | null, line: [number, number, number, number] | null, wireFlags: number, size: Point | null }
export type WireExtras     = { mils: number, color: string, opacity: number, banded: boolean, bezier: number[] | null }
export type Label          = { visible: boolean, x: number, y: number, z: number, xOffset: number, yOffset: number, color: string, size: number, keys: string[] }
export type InstanceView   = { layer: string, locked: boolean, bottom: boolean, geometry: Geometry, wire: WireExtras | null, connectors: ConnectorState[], label: Label | null, hidden: string[] }

export type Instance = {
    moduleIdRef: string
    modelIndex: string
    path: string
    title: string
    text: string
    properties: Record<string, string>
    localConnectors: Record<string, string>
    views: Partial<Record<ViewName, InstanceView>>
}

export type Sketch = {
    fritzingVersion: string
    projectProperties: Record<string, string>
    settings: Partial<Record<ViewName, Record<string, string>>>
    instances: Instance[]
}

export type BundleFile = { name: string, text: string }
export type Bundle     = { sketch: Sketch | null, parts: BundleFile[], svgs: BundleFile[], others: string[], bin: Bin | null }

const INSTANCE_ATTRIBUTES = new Set(['moduleIdRef', 'modelIndex', 'originalModelIndex', 'path'])
const TRANSFORM_KEYS      = ['m11', 'm12', 'm21', 'm22', 'm31', 'm32']
const LABEL_SIZE          = 5    // PT

const number = (element: XmlElement | undefined, name: string, fallback = 0) => {
    const value = Number(element?.getAttribute(name) ?? '')
    return element?.hasAttribute(name) && Number.isFinite(value) ? value : fallback
}

const readBezier = (element: XmlElement | undefined) => {
    const points = [childNamed(element, 'cp0'), childNamed(element, 'cp1')]
    return points.every(Boolean) ? points.flatMap(point => [number(point, 'x'), number(point, 'y')]) : null
}

const readGeometry = (element: XmlElement | undefined): Geometry => {
    const transform = childNamed(element, 'transform')
    const hasLine   = element?.hasAttribute('x1') ?? false
    return {
        x: number(element, 'x'),
        y: number(element, 'y'),
        z: number(element, 'z', -1),
        transform: transform ? TRANSFORM_KEYS.map(key => number(transform, key)) as Matrix : null,
        line: hasLine ? [number(element, 'x1'), number(element, 'y1'), number(element, 'x2'), number(element, 'y2')] : null,
        wireFlags: number(element, 'wireFlags'),
        size: element?.hasAttribute('width') ? [number(element, 'width'), number(element, 'height')] : null
    }
}

const readLeg = (element: XmlElement | undefined): Leg | null => {
    const children = childrenOf(element)
    const points   = children.filter(child => tagOf(child) === 'point').map((point): Point => [number(point, 'x'), number(point, 'y')])
    const beziers  = children.filter(child => tagOf(child) === 'bezier').map(readBezier)
    return points.length > 1 ? { points, beziers } : null
}

const readConnector = (element: XmlElement): ConnectorState => {
    const geometry = childNamed(element, 'geometry')
    const connects = childrenNamed(childNamed(element, 'connects'), 'connect').map(connect => ({
        modelIndex: connect.getAttribute('modelIndex') ?? '',
        connectorId: connect.getAttribute('connectorId') ?? '',
        layer: connect.getAttribute('layer') ?? ''
    }))
    return { id: element.getAttribute('connectorId') ?? '', layer: element.getAttribute('layer') ?? '', x: number(geometry, 'x'), y: number(geometry, 'y'), leg: readLeg(childNamed(element, 'leg')), connects, groundFillSeed: element.getAttribute('groundFillSeed') === 'true' }
}

const readLabel = (element: XmlElement | undefined): Label | null => element ? {
    visible: element.getAttribute('visible') === 'true',
    x: number(element, 'x'),
    y: number(element, 'y'),
    z: number(element, 'z'),
    xOffset: number(element, 'xOffset'),
    yOffset: number(element, 'yOffset'),
    color: element.getAttribute('textColor') ?? '#000000',
    size: number(element, 'fontSize', LABEL_SIZE),
    keys: childrenNamed(element, 'displayKey').map(key => key.getAttribute('key') ?? '')
} : null

const readInstanceView = (element: XmlElement): InstanceView => {
    const extras = childNamed(element, 'wireExtras')
    const wire   = extras ? { mils: number(extras, 'mils'), color: extras.getAttribute('color') ?? '#000000', opacity: number(extras, 'opacity', 1), banded: extras.getAttribute('banded') === '1', bezier: readBezier(childNamed(extras, 'bezier')) } : null
    return {
        layer: element.getAttribute('layer') ?? '',
        locked: element.getAttribute('locked') === 'true',
        bottom: element.getAttribute('bottom') === 'true',
        geometry: readGeometry(childNamed(element, 'geometry')),
        wire,
        connectors: childrenNamed(childNamed(element, 'connectors'), 'connector').map(readConnector),
        label: readLabel(childNamed(element, 'titleGeometry')),
        hidden: childrenNamed(element, 'layerHidden').map(layer => layer.getAttribute('layer') ?? '')
    }
}

const readInstance = (element: XmlElement): Instance => {
    const attributes = Array.from({ length: element.attributes.length }, (_, i) => element.attributes[i]).filter(attribute => !INSTANCE_ATTRIBUTES.has(attribute.name))
    const properties = childrenNamed(element, 'property').filter(property => property.getAttribute('value'))
    const local      = childrenNamed(childNamed(element, 'localConnectors'), 'localConnector')
    const views      = childrenOf(childNamed(element, 'views')).filter(view => (VIEWS as readonly string[]).includes(tagOf(view)))
    return {
        moduleIdRef: element.getAttribute('moduleIdRef') ?? '',
        modelIndex: element.getAttribute('modelIndex') ?? '',
        path: element.getAttribute('path') ?? '',
        title: textOf(childNamed(element, 'title')),
        text: textOf(childNamed(element, 'text')),
        properties: Object.fromEntries([...attributes.map(attribute => [attribute.name, attribute.value]), ...properties.map(property => [property.getAttribute('name') ?? '', property.getAttribute('value') ?? ''])]),
        localConnectors: Object.fromEntries(local.map(connector => [connector.getAttribute('id') ?? '', connector.getAttribute('name') ?? ''])),
        views: Object.fromEntries(views.map(view => [tagOf(view), readInstanceView(view)]))
    }
}

export const readSketch = (text: string): Sketch | null => {
    const root = parseXml(text)

    if (!root || tagOf(root) !== 'module' || !childNamed(root, 'instances'))
        return null

    const settings = childrenNamed(childNamed(root, 'views'), 'view').map(view => [view.getAttribute('name') ?? '', Object.fromEntries(Array.from({ length: view.attributes.length }, (_, i) => [view.attributes[i].name, view.attributes[i].value]))])
    return {
        fritzingVersion: root.getAttribute('fritzingVersion') ?? '',
        projectProperties: Object.fromEntries(childrenOf(childNamed(root, 'project_properties')).map(property => [tagOf(property), property.getAttribute('value') ?? ''])),
        settings: Object.fromEntries(settings),
        instances: childrenNamed(childNamed(root, 'instances'), 'instance').map(readInstance)
    }
}

const MAX_FILES = 20000                // ARQUIVOS NUM PACOTE; UM PROJETO DO FRITZING TEM DEZENAS
const MAX_BYTES = 256 * 1024 * 1024    // TOTAL DESCOMPACTADO PELO TAMANHO DECLARADO, QUE O FFLATE NÃO ULTRAPASSA

// PACOTE QUE DESCOMPACTARIA ALÉM DOS LIMITES: ZIP-BOMBA OU ARQUIVO QUE NÃO É PROJETO; O ARQUIVO ABERTO É FRONTEIRA DE CONFIANÇA
export class OversizedBundle extends Error {}

export const readBundle = (bytes: Uint8Array): Bundle => {
    const sizes  = { files: 0, bytes: 0 }
    const filter = (file: UnzipFileInfo) => {
        sizes.files += 1
        sizes.bytes += file.originalSize

        if (sizes.files > MAX_FILES || sizes.bytes > MAX_BYTES)
            throw new OversizedBundle(t('o pacote passa de {0} arquivos ou de {1} MB descompactados e foi recusado', MAX_FILES, MAX_BYTES / 1024 ** 2))

        return true
    }
    const files  = unzipSync(bytes, { filter })
    const names  = Object.keys(files)
    const text   = (name: string) => strFromU8(files[name])
    const sketch = names.find(name => name.endsWith('.fz'))
    const bin    = names.find(name => name.endsWith('.fzb'))
    const pick   = (prefix: string, suffix: string) => names.filter(name => name.startsWith(prefix) && name.endsWith(suffix)).map(name => ({ name, text: text(name) }))
    return {
        sketch: sketch ? readSketch(text(sketch)) : null,
        parts: pick('part.', '.fzp'),
        svgs: pick('svg.', '.svg'),
        others: names.filter(name => name !== sketch && !name.startsWith('part.') && !name.startsWith('svg.')),
        bin: bin ? readBin(text(bin)) : null
    }
}

// ARQUIVO ESCOLHIDO PELA PESSOA: ILEGÍVEL VIRA NULO, PACOTE GRANDE DEMAIS VIRA A CAUSA
export const readFile = (name: string, bytes: Uint8Array): Bundle | string | null => {
    const lower = name.toLowerCase()

    try {
        return lower.endsWith('.fz') ? { sketch: readSketch(strFromU8(bytes)), parts: [], svgs: [], others: [], bin: null } : lower.endsWith('.fzb') ? { sketch: null, parts: [], svgs: [], others: [], bin: readBin(strFromU8(bytes)) } : readBundle(bytes)
    } catch (error) {
        if (error instanceof OversizedBundle)
            return error.message

        if (error instanceof Error)
            return null

        throw error
    }
}

export type BinEntry = { moduleIdRef: string, section: string }
export type Bin      = { title: string, icon: string, entries: BinEntry[] }

const SPACER = '__spacer__'

export const readBin = (text: string): Bin | null => {
    const root = parseXml(text)

    if (!root || tagOf(root) !== 'module')
        return null

    let section = ''
    const entries: BinEntry[] = []

    for (const instance of childrenNamed(childNamed(root, 'instances'), 'instance')) {
        const moduleIdRef = instance.getAttribute('moduleIdRef') ?? ''

        if (moduleIdRef === SPACER) {
            section = instance.getAttribute('path') ?? ''
            continue
        }

        entries.push({ moduleIdRef, section })
    }

    return { title: textOf(childNamed(root, 'title')), icon: root.getAttribute('icon') ?? '', entries }
}

const DEFAULT_VERSION      = '1.0.8'
const ATTRIBUTE_PROPERTIES = new Set(['flippedSMD'])

type Value = string | number | boolean | null | undefined

const escapeXml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const escapeAttribute = (text: string) => escapeXml(text).replaceAll('\n', '&#10;').replaceAll('\r', '&#13;').replaceAll('\t', '&#9;')

const element = (tag: string, attributes: Record<string, Value>, children = '') => {
    const text = Object.entries(attributes).filter(([, value]) => value !== null && value !== undefined && value !== false).map(([name, value]) => ` ${name}="${escapeAttribute(String(value))}"`).join('')
    return children ? `<${tag}${text}>${children}</${tag}>` : `<${tag}${text}/>`
}

const matrixXml = (m: Matrix) => element('transform', { m11: m[0], m12: m[1], m13: 0, m21: m[2], m22: m[3], m23: 0, m31: m[4], m32: m[5], m33: 1 })

const bezierXml = (bezier: number[] | null) => element('bezier', {}, bezier ? element('cp0', { x: bezier[0], y: bezier[1] }) + element('cp1', { x: bezier[2], y: bezier[3] }) : '')

const geometryXml = ({ x, y, z, transform, line, wireFlags, size }: Geometry) => element('geometry', { z, x, y, ...size ? { width: size[0], height: size[1] } : {}, ...line ? { x1: line[0], y1: line[1], x2: line[2], y2: line[3] } : {}, wireFlags: line || wireFlags ? wireFlags : null }, transform ? matrixXml(transform) : '')

const wireXml = (wire: WireExtras) => element('wireExtras', { mils: wire.mils, color: wire.color, opacity: wire.opacity, banded: wire.banded ? 1 : 0 }, wire.bezier ? bezierXml(wire.bezier) : '')

const legXml = (leg: Leg) => element('leg', {}, leg.points.map((point, i) => element('point', { x: point[0], y: point[1] }) + bezierXml(leg.beziers[i] ?? null)).join(''))

const labelXml = (label: Label) => element('titleGeometry', { visible: String(label.visible), x: label.x, y: label.y, z: label.z, xOffset: label.xOffset, yOffset: label.yOffset, textColor: label.color, fontSize: label.size }, label.keys.map(key => element('displayKey', { key })).join(''))

// UMA VISTA DA INSTÂNCIA COM TODAS AS ARESTAS DO GRAFO QUE A TOCAM, RESOLVENDO A CAMADA DO ALVO NA VISTA (SPEC 02 §7.3)
const viewXml = (doc: Doc, instance: Instance, view: ViewName, state: InstanceView, partners: Map<string, string[]>) => {
    const prefix   = `${instance.modelIndex}/`
    const linked   = [...partners.keys()].filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length))
    const ids      = [...new Set([...linked, ...state.connectors.filter(connector => connector.leg || connector.groundFillSeed).map(connector => connector.id)])]
    const targetOf = (key: string) => {
        const slash = key.indexOf('/')
        return { modelIndex: key.slice(0, slash), connectorId: key.slice(slash + 1) }
    }

    const connectors = ids.map(id => {
        const current  = state.connectors.find(connector => connector.id === id)
        const connects = (partners.get(`${prefix}${id}`) ?? []).map(targetOf).filter(target => doc.instances[target.modelIndex]?.views[view]).map(target => element('connect', { connectorId: target.connectorId, modelIndex: target.modelIndex, layer: doc.instances[target.modelIndex]?.views[view]?.layer ?? '' })).join('')
        const children = element('geometry', { x: current?.x ?? 0, y: current?.y ?? 0 }) + (current?.leg ? legXml(current.leg) : '') + (connects ? element('connects', {}, connects) : '')
        return element('connector', { connectorId: id, layer: current?.layer || state.layer, groundFillSeed: current?.groundFillSeed ? 'true' : null }, children)
    }).join('')

    const children = geometryXml(state.geometry) + (state.wire ? wireXml(state.wire) : '') + (state.label ? labelXml(state.label) : '') + state.hidden.map(layer => element('layerHidden', { layer })).join('') + (connectors ? element('connectors', {}, connectors) : '')
    return element(view, { layer: state.layer, locked: state.locked ? 'true' : null, bottom: state.bottom ? 'true' : null }, children)
}

const instanceXml = (doc: Doc, instance: Instance, partners: Map<string, string[]>) => {
    const properties = Object.entries(instance.properties).filter(([name, value]) => value !== '' && !ATTRIBUTE_PROPERTIES.has(name)).map(([name, value]) => element('property', { name, value })).join('')
    const locals     = Object.entries(instance.localConnectors).map(([id, name]) => element('localConnector', { id, name })).join('')
    const views      = VIEWS.flatMap(view => instance.views[view] ? [viewXml(doc, instance, view, instance.views[view] as InstanceView, partners)] : []).join('')
    const children   = properties + element('title', {}, escapeXml(instance.title)) + (instance.text ? element('text', {}, escapeXml(instance.text)) : '') + (locals ? element('localConnectors', {}, locals) : '') + element('views', {}, views)
    return element('instance', { moduleIdRef: instance.moduleIdRef, modelIndex: instance.modelIndex, path: instance.path, flippedSMD: instance.properties.flippedSMD }, children)
}

// DOCUMENTO NO FORMATO .fz: PROPRIEDADES DO PROJETO, AJUSTES DAS VISTAS E INSTÂNCIAS COM AS CONEXÕES DAS TRÊS VISTAS (SPEC 01 §5)
export const exportSketch = (doc: Doc) => {
    const partners = new Map<string, string[]>()

    doc.edges.forEach(([a, b]) => {
        partners.set(a, [...partners.get(a) ?? [], b])
        partners.set(b, [...partners.get(b) ?? [], a])
    })

    const probes     = doc.probes.length ? { [PROBES_KEY]: JSON.stringify(doc.probes) } : {}
    const properties = Object.entries({ ...doc.projectProperties, ...probes }).map(([key, value]) => element(key, { value })).join('')
    const views      = Object.entries(doc.settings).map(([name, attributes]) => element('view', { ...attributes, name })).join('')
    const instances  = Object.values(doc.instances).map(instance => instanceXml(doc, instance, partners)).join('\n')
    const body       = element('project_properties', {}, properties) + (views ? element('views', {}, views) : '') + element('instances', {}, `\n${instances}\n`)
    return `<?xml version="1.0" encoding="UTF-8"?>\n${element('module', { fritzingVersion: doc.fritzingVersion || DEFAULT_VERSION }, `\n${body}\n`)}\n`
}

// BIN .fzb: UM .fz REDUZIDO COM UMA INSTÂNCIA POR PEÇA NA ORDEM DE EXIBIÇÃO, SÓ COM A VISTA DE ÍCONE (SPEC 01 §6.3)
export const exportBin = (title: string, moduleIds: string[]) => {
    const icon      = element('views', {}, element('iconView', { layer: 'icon' }, element('geometry', { z: -1, x: -1, y: -1 })))
    const instances = moduleIds.map((moduleIdRef, i) => element('instance', { moduleIdRef, modelIndex: i + 1, path: '' }, icon)).join('\n')
    return `<?xml version="1.0" encoding="UTF-8"?>\n${element('module', { fritzingVersion: DEFAULT_VERSION, icon: `${title}.png` }, `\n${element('title', {}, escapeXml(title))}\n${element('instances', {}, `\n${instances}\n`)}\n`)}\n`
}

// PACOTE .fzbz: O .fzb E AS PEÇAS NÃO CORE QUE ELE LISTA (SPEC 01 §6.3)
export const exportBinBundle = (title: string, moduleIds: string[], files: BundleFile[]) => zipSync(Object.fromEntries([[`${title}.fzb`, strToU8(exportBin(title, moduleIds))], ...files.map(file => [file.name, strToU8(file.text)] as const)]))

// PACOTE .fzz: O .fz E AS PEÇAS QUE VIERAM DE PACOTES (part.* E svg.*), QUE O FRITZING NÃO TEM INSTALADAS (SPEC 01 §6.1)
export const exportBundle = (doc: Doc, name: string, files: BundleFile[]) => zipSync(Object.fromEntries([[`${name}.fz`, strToU8(exportSketch(doc))], ...files.map(file => [file.name, strToU8(file.text)] as const)]))
