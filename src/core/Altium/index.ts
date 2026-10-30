import { arcPoints, emptyBoard, nestRings, netsOf, settleInner, type BoardData, type BoardPad, type Footprint, type PadForm, type Side, type Stroke, type Zone } from '../Board'
import type { Point } from '../Geometry'

// .PcbDoc BINÁRIO DO ALTIUM: OLE COMPOUND FILE COM UM ARMAZENAMENTO POR TIPO (Header = CONTAGEM, Data = REGISTROS); TEXTO "|CHAVE=VALOR|" OU BINÁRIO
// EM 1/10000 mil COM Y PARA CIMA, ÂNGULOS ANTI-HORÁRIOS (SPEC 09 §7)

// ---------- COMPOUND FILE (MS-CFB, VERSÃO 3, SETORES DE 512 BYTES) ----------

const SECTOR    = 512
const MINI      = 64
const CUTOFF    = 4096
const END       = 0xFFFFFFFE
const FREE      = 0xFFFFFFFF
const FAT_MARK  = 0xFFFFFFFD
const NO_STREAM = 0xFFFFFFFF
const SIGNATURE = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]

// TODOS OS STREAMS PELO CAMINHO COMPLETO ("Tracks6/Data")
export const readCompound = (bytes: Uint8Array) => {
    const view   = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const u32    = (offset: number) => view.getUint32(offset, true)

    if (!SIGNATURE.every((value, i) => bytes[i] === value))
        throw new Error('não é um Compound File (assinatura D0CF11E0)')

    const size   = 1 << view.getUint16(30, true)
    const mini   = 1 << view.getUint16(32, true)
    const sector = (n: number) => (n + 1) * size
    const fatIds = Array.from({ length: 109 }, (_, i) => u32(76 + 4 * i)).filter(id => id < FAT_MARK)

    for (let next = u32(68), guard = 0; next < FAT_MARK && guard < 1e6; guard++) {
        for (let i = 0; i < size / 4 - 1; i++)
            fatIds.push(u32(sector(next) + 4 * i))

        next = u32(sector(next) + size - 4)
    }

    const fat     = fatIds.filter(id => id < FAT_MARK).flatMap(id => Array.from({ length: size / 4 }, (_, i) => u32(sector(id) + 4 * i)))
    const chain   = (start: number, table: number[]) => {
        const ids: number[] = []

        for (let id = start; id < FAT_MARK && ids.length <= table.length; id = table[id])
            ids.push(id)

        return ids
    }
    const join    = (ids: number[], unit: number, base: (id: number) => number, source: Uint8Array) => {
        const out = new Uint8Array(ids.length * unit)
        ids.forEach((id, i) => out.set(source.subarray(base(id), base(id) + unit), i * unit))
        return out
    }
    const regular = (start: number) => join(chain(start, fat), size, sector, bytes)
    const dir     = regular(u32(48))
    const dview   = new DataView(dir.buffer)
    const entries = Array.from({ length: dir.length / 128 }, (_, i) => {
        const o   = i * 128
        const len = dview.getUint16(o + 64, true)
        return { name: String.fromCharCode(...Array.from({ length: Math.max(0, len / 2 - 1) }, (_, k) => dview.getUint16(o + 2 * k, true))), type: dir[o + 66], left: dview.getUint32(o + 68, true), right: dview.getUint32(o + 72, true), child: dview.getUint32(o + 76, true), start: dview.getUint32(o + 116, true), size: dview.getUint32(o + 120, true) }
    })
    const miniFat = u32(60) < FAT_MARK ? Array.from(new Uint32Array(regular(u32(60)).slice().buffer)) : []
    const stream  = entries[0] ? regular(entries[0].start) : new Uint8Array()
    const files   = new Map<string, Uint8Array>()
    const visit   = (index: number, prefix: string, depth: number) => {
        const entry = entries[index]

        if (!entry || index === NO_STREAM || depth > 64)
            return

        visit(entry.left, prefix, depth + 1)

        if (entry.type === 2)
            files.set(prefix + entry.name, (entry.size < CUTOFF ? join(chain(entry.start, miniFat), mini, id => id * mini, stream) : regular(entry.start)).subarray(0, entry.size))

        if (entry.type === 1)
            visit(entry.child, `${prefix}${entry.name}/`, depth + 1)

        visit(entry.right, prefix, depth + 1)
    }

    visit(entries[0]?.child ?? NO_STREAM, '', 0)
    return files
}

const compareNames = (a: string, b: string) => a.length - b.length || (a.toUpperCase() < b.toUpperCase() ? -1 : a.toUpperCase() > b.toUpperCase() ? 1 : 0)

// COMPOUND FILE COM OS STREAMS DADOS ("Pasta/Stream"); PEQUENOS NO MINI STREAM; IRMÃOS EM ÁRVORE BINÁRIA BALANCEADA, TODOS PRETOS
// ponytail: só a tabela DIFAT do cabeçalho (até 109 setores de FAT, ~7 MB); arquivos maiores pediriam setores DIFAT
export const writeCompound = (files: Map<string, Uint8Array>) => {
    type Entry = { name: string, type: number, children: Entry[], data: Uint8Array | null, start: number, left: number, right: number, child: number, id: number }
    const root: Entry = { name: 'Root Entry', type: 5, children: [], data: null, start: END, left: NO_STREAM, right: NO_STREAM, child: NO_STREAM, id: 0 }

    files.forEach((data, path) => {
        const parts = path.split('/')
        let parent  = root

        parts.forEach((name, i) => {
            const last  = i === parts.length - 1
            let found   = parent.children.find(item => item.name === name)

            if (!found) {
                found = { name, type: last ? 2 : 1, children: [], data: last ? data : null, start: END, left: NO_STREAM, right: NO_STREAM, child: NO_STREAM, id: 0 }
                parent.children.push(found)
            }

            parent = found
        })
    })

    const all: Entry[] = []
    const number = (entry: Entry) => {
        entry.id = all.length
        all.push(entry)
        entry.children.forEach(number)
    }
    const tree = (items: Entry[]): number => {
        if (!items.length)
            return NO_STREAM

        const middle = Math.floor(items.length / 2)
        items[middle].left  = tree(items.slice(0, middle))
        items[middle].right = tree(items.slice(middle + 1))
        return items[middle].id
    }

    number(root)
    all.forEach(entry => entry.child = tree(entry.children.sort((a, b) => compareNames(a.name, b.name))))

    const small  = all.filter(entry => entry.data && entry.data.length < CUTOFF && entry.data.length > 0)
    const large  = all.filter(entry => entry.data && entry.data.length >= CUTOFF)
    const miniFat: number[] = []
    const miniParts: Uint8Array[] = []

    small.forEach(entry => {
        const data  = entry.data as Uint8Array
        const count = Math.ceil(data.length / MINI)
        entry.start = miniFat.length
        Array.from({ length: count }, (_, i) => miniFat.push(i === count - 1 ? END : miniFat.length + 1))
        const padded = new Uint8Array(count * MINI)
        padded.set(data)
        miniParts.push(padded)
    })

    const miniStream = concat(miniParts)
    const sectors: Uint8Array[] = []
    const fat: number[] = []
    const place = (data: Uint8Array) => {
        if (!data.length)
            return END

        const first = sectors.length
        const count = Math.ceil(data.length / SECTOR)

        for (let i = 0; i < count; i++) {
            const block = new Uint8Array(SECTOR)
            block.set(data.subarray(i * SECTOR, (i + 1) * SECTOR))
            sectors.push(block)
            fat.push(i === count - 1 ? END : sectors.length)
        }

        return first
    }

    large.forEach(entry => entry.start = place(entry.data as Uint8Array))
    root.start = place(miniStream)
    const miniFatStart = place(u32Array(miniFat, FREE, SECTOR / 4))
    const directory    = new Uint8Array(Math.ceil(all.length / 4) * 4 * 128)
    const dview        = new DataView(directory.buffer)

    all.forEach(entry => {
        const o = entry.id * 128
        Array.from(entry.name.slice(0, 31)).forEach((char, i) => dview.setUint16(o + 2 * i, char.charCodeAt(0), true))
        dview.setUint16(o + 64, (Math.min(entry.name.length, 31) + 1) * 2, true)
        directory[o + 66] = entry.type
        directory[o + 67] = 1
        dview.setUint32(o + 68, entry.left, true)
        dview.setUint32(o + 72, entry.right, true)
        dview.setUint32(o + 76, entry.child, true)
        dview.setUint32(o + 116, entry.type === 1 ? 0 : entry.data?.length === 0 ? END : entry.start, true)
        dview.setUint32(o + 120, entry === root ? miniStream.length : entry.data?.length ?? 0, true)
    })

    for (let i = all.length; i < directory.length / 128; i++) {
        dview.setUint32(i * 128 + 68, NO_STREAM, true)
        dview.setUint32(i * 128 + 72, NO_STREAM, true)
        dview.setUint32(i * 128 + 76, NO_STREAM, true)
    }

    const dirStart = place(directory)
    let fatCount   = Math.ceil((sectors.length + 1) / (SECTOR / 4))

    while (Math.ceil((sectors.length + fatCount) / (SECTOR / 4)) > fatCount)
        fatCount++

    if (fatCount > 109)
        throw new Error('arquivo grande demais para o cabeçalho DIFAT')

    const fatStart = sectors.length
    Array.from({ length: fatCount }, () => fat.push(FAT_MARK))
    const fatBytes = u32Array(fat, FREE, fatCount * SECTOR / 4)
    Array.from({ length: fatCount }, (_, i) => sectors.push(fatBytes.subarray(i * SECTOR, (i + 1) * SECTOR)))

    const header = new Uint8Array(SECTOR)
    const hview  = new DataView(header.buffer)
    header.set(SIGNATURE)
    hview.setUint16(24, 0x3E, true)
    hview.setUint16(26, 3, true)
    hview.setUint16(28, 0xFFFE, true)
    hview.setUint16(30, 9, true)
    hview.setUint16(32, 6, true)
    hview.setUint32(44, fatCount, true)
    hview.setUint32(48, dirStart, true)
    hview.setUint32(56, CUTOFF, true)
    hview.setUint32(60, miniFat.length ? miniFatStart : END, true)
    hview.setUint32(64, Math.ceil(miniFat.length / (SECTOR / 4)), true)
    hview.setUint32(68, END, true)

    for (let i = 0; i < 109; i++)
        hview.setUint32(76 + 4 * i, i < fatCount ? fatStart + i : FREE, true)

    return concat([header, ...sectors])
}

const concat = (parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    parts.reduce((offset, part) => (out.set(part, offset), offset + part.length), 0)
    return out
}

const u32Array = (values: number[], fill: number, multiple: number) => {
    const count = values.length ? Math.ceil(values.length / multiple) * multiple : 0
    const out   = new Uint32Array(count).fill(fill)
    out.set(values)
    return new Uint8Array(out.buffer)
}

// ---------- REGISTROS ----------

const UNIT       = 10000    // UNIDADES DO ARQUIVO POR mil
const NONE       = 0xFFFF
const TOP        = 1
const BOTTOM     = 32
const MULTI      = 74
const OVERLAY    = { top: 33, bottom: 34 }
const decoder    = new TextDecoder('latin1')

const textRecords = (data: Uint8Array | undefined) => {
    const records: Record<string, string>[] = []
    const view = data ? new DataView(data.buffer, data.byteOffset, data.byteLength) : null

    for (let o = 0; view && o + 4 <= view.byteLength;) {
        const length = view.getUint32(o, true)
        const fields = decoder.decode((data as Uint8Array).subarray(o + 4, o + 4 + length)).replace(/\0+$/, '').split('|').filter(Boolean)
        records.push(Object.fromEntries(fields.map(field => [field.slice(0, field.indexOf('=')).toUpperCase(), field.slice(field.indexOf('=') + 1)])))
        o += 4 + length
    }

    return records
}

// REGISTROS BINÁRIOS: TIPO (1 BYTE) E subs SUB-REGISTROS COM TAMANHO uint32
const binaryRecords = (data: Uint8Array | undefined, subs: number) => {
    const records: DataView[][] = []

    for (let o = 0; data && o < data.length;) {
        const parts: DataView[] = []
        o++

        for (let s = 0; s < subs && o + 4 <= data.length; s++) {
            const length = new DataView(data.buffer, data.byteOffset + o, 4).getUint32(0, true)
            parts.push(new DataView(data.buffer, data.byteOffset + o + 4, Math.min(length, data.length - o - 4)))
            o += 4 + length
        }

        records.push(parts)
    }

    return records
}

const length = (value: string | undefined) => {
    const text   = (value ?? '').trim()
    const number = parseFloat(text)
    return !Number.isFinite(number) ? 0 : text.endsWith('mm') ? number * 1000 / 25.4 : text.endsWith('in') ? number * 1000 : number
}

const at = (view: DataView, offset: number) => offset + 4 <= view.byteLength ? view.getInt32(offset, true) / UNIT : 0
const u16 = (view: DataView, offset: number) => offset + 2 <= view.byteLength ? view.getUint16(offset, true) : NONE
const u8 = (view: DataView, offset: number) => offset < view.byteLength ? view.getUint8(offset) : 0
const u32 = (view: DataView, offset: number) => offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0
const f64 = (view: DataView, offset: number) => offset + 8 <= view.byteLength ? view.getFloat64(offset, true) : 0

const sideOf = (layer: number): Side | null => layer === TOP ? 'top' : layer === BOTTOM ? 'bottom' : null
const silkOf = (layer: number): Side | null => layer === OVERLAY.top ? 'top' : layer === OVERLAY.bottom ? 'bottom' : null

// CAMADA MECÂNICA (57–72) DE DOCUMENTAÇÃO PELO NOME DADO NA PLACA; SEM NOME PRÓPRIO, A CONVENÇÃO DO ASSISTENTE IPC DO ALTIUM (MECÂNICA 13 = CORPO 3D, 15 = COURTYARD)
// ponytail: O SIGNIFICADO DAS CAMADAS MECÂNICAS É LIVRE NO ALTIUM; NOMES FORA DESTES PADRÕES (COTAS, NOTAS, FORMATO DA PLACA) FICAM DE FORA. MELHORIA: LER O MECHKIND DO AD20+
const MECHANICAL = [57, 72]
const MECH_OUT   = { fab: 69, courtyard: 71 }    // MECÂNICA 13 E 15 NA EXPORTAÇÃO
const docsOf = (board: Record<string, string>) => (layer: number): ['courtyard' | 'fab', Side] | null => {
    if (layer < MECHANICAL[0] || layer > MECHANICAL[1])
        return null

    const name = board[`LAYER${layer}NAME`] ?? ''
    const side = /bot/i.test(name) ? 'bottom' : 'top'
    const kind = /courtyard|placement/i.test(name) || /^mechanical ?15$/i.test(name) ? 'courtyard' : /assembl|3d|body|fab|component/i.test(name) || /^mechanical ?13$/i.test(name) ? 'fab' : null
    return kind && [kind, side]
}

// REGIÃO (Regions6): CAMADA 0, FLAGS2 2 (2 = KEEPOUT), NET 3, POLÍGONO 5, FUROS 14 (uint16), PROPRIEDADES EM 18 (uint32 + TEXTO, KIND=0 É COBRE), DEPOIS
// O CONTORNO (uint32 + PARES DE double) E CADA FURO (uint32 + PARES DE double), EM 1/10.000 mil COM Y PARA CIMA
const regionOf = (record: DataView) => {
    const size  = u32(record, 18)
    const kind  = /\|KIND=(\d+)/.exec('|' + decoder.decode(new Uint8Array(record.buffer, record.byteOffset + 22, Math.min(size, Math.max(0, record.byteLength - 22)))))?.[1] ?? '0'
    const rings: number[][] = []
    let o       = 22 + size

    for (let ring = 0; ring <= u16(record, 14) && o + 4 <= record.byteLength; ring++) {
        const count = u32(record, o)
        rings.push(Array.from({ length: 2 * count }, (_, i) => (i % 2 ? -1 : 1) * f64(record, o + 4 + 8 * i) / UNIT))
        o += 4 + 16 * count
    }

    return { kind, rings: rings.filter(ring => ring.length >= 6) }
}

// ARCO DO ARQUIVO (Y PARA CIMA, ÂNGULOS ANTI-HORÁRIOS DE start A end) EM PONTOS COM Y PARA BAIXO
const arcOf = (cx: number, cy: number, r: number, start: number, end: number) => {
    const sweep = ((end - start) % 360 + 360) % 360 || 360
    return arcPoints(cx, cy, r, start, sweep).map((value, i) => i % 2 ? -value : value)
}

// CONTORNO DO Board6: VÉRTICES VXn/VYn; KINDn=1 FAZ ARCO (CXn, CYn, Rn, SAn→EAn) ATÉ O VÉRTICE SEGUINTE, NO SENTIDO DA PONTA QUE COINCIDE COM O VÉRTICE
const outlineOf = (record: Record<string, string>) => {
    const points: number[] = []

    for (let i = 0; record[`VX${i}`] !== undefined; i++) {
        const [x, y] = [length(record[`VX${i}`]), length(record[`VY${i}`])]

        if (record[`KIND${i}`] !== '1') {
            points.push(x, -y)
            continue
        }

        const [cx, cy, r]  = [length(record[`CX${i}`]), length(record[`CY${i}`]), length(record[`R${i}`])]
        const [sa, ea]     = [Number(record[`SA${i}`]), Number(record[`EA${i}`])]
        const startPoint   = [cx + r * Math.cos(sa * Math.PI / 180), cy + r * Math.sin(sa * Math.PI / 180)]
        const forward      = Math.hypot(startPoint[0] - x, startPoint[1] - y) < r * 0.01 + 1
        const arc          = arcOf(cx, cy, r, sa, ea)
        points.push(...(forward ? arc : Array.from({ length: arc.length / 2 }, (_, k) => arc.slice(arc.length - 2 * k - 2, arc.length - 2 * k)).flat()))
    }

    return points.length >= 6 ? [points] : []
}

const OCTAGON = (w: number, h: number) => {
    const c = Math.min(w, h) / 4
    return [-w / 2 + c, -h / 2, w / 2 - c, -h / 2, w / 2, -h / 2 + c, w / 2, h / 2 - c, w / 2 - c, h / 2, -w / 2 + c, h / 2, -w / 2, h / 2 - c, -w / 2, -h / 2 + c]
}

// PLACA NEUTRA DO .PcbDoc: CONTORNO DO Board6, COMPONENTES COM SEUS PADS (PAD SOLTO VIRA FOOTPRINT PRÓPRIO), TRILHAS E ARCOS DE COBRE EXTERNO, VIAS E SERIGRAFIA;
// REGIÕES, FILLS E POLÍGONOS HACHURADOS DE COBRE COMO ÁREAS, CAMADAS MECÂNICAS DE DOCUMENTAÇÃO DOS COMPONENTES; O COBRE DAS MidLayer E AS VIAS CEGAS VÃO PARA inner
// (A PILHA É A LISTA LAYERnNEXT QUE SAI DA TopLayer)
// ponytail: InternalPlane (PLANO NEGATIVO COM DIVISÕES) NÃO É LIDO. MELHORIA: GUARDAR O PLANO COMO ÁREA DA CAMADA MENOS AS DIVISÕES E FOLGAS
export const readAltium = (bytes: Uint8Array): BoardData => {
    const files      = readCompound(bytes)
    const board      = emptyBoard()
    const boardInfo  = textRecords(files.get('Board6/Data'))[0] ?? {}
    const nets       = textRecords(files.get('Nets6/Data')).map(record => record.NAME ?? '')
    const components = textRecords(files.get('Components6/Data'))
    const netName    = (index: number) => index === NONE ? '' : nets[index] ?? ''
    const labels     = new Map<string, string>()

    // TEXTO DO COMPONENTE: BYTE 40 = COMENTÁRIO (VALOR), BYTE 41 = DESIGNADOR; O TEXTO VEM COMO STRING PASCAL NO SEGUNDO SUB-REGISTRO
    for (const [info, content] of binaryRecords(files.get('Texts6/Data'), 2)) {
        const component = u16(info, 7)
        const kind      = u8(info, 41) ? 'ref' : u8(info, 40) ? 'value' : ''

        if (component !== NONE && kind && content)
            labels.set(`${kind}|${component}`, decoder.decode(new Uint8Array(content.buffer, content.byteOffset + 1, Math.min(u8(content, 0), content.byteLength - 1))))
    }

    const footprints = components.map((record, i): Footprint => ({ ref: labels.get(`ref|${i}`) || record.SOURCEDESIGNATOR || `U${i + 1}`, value: labels.get(`value|${i}`) ?? '', name: record.PATTERN ?? '', x: length(record.X), y: -length(record.Y), rotation: -Number(record.ROTATION ?? 0), side: record.LAYER === 'TOP' ? 'top' : 'bottom', pads: [], silk: [], courtyard: [], fab: [] }))
    const loose: Footprint[] = []
    const docOf      = docsOf(boardInfo)
    const hatches    = new Map<string, Zone>()
    // TRAÇO DE PREENCHIMENTO HACHURADO: UMA ÁREA POR POLÍGONO E FACE
    const addHatch   = (polygon: number, side: Side, net: string, stroke: Stroke) => {
        const key = `${polygon}|${side}`

        if (!hatches.has(key))
            board.zones.push(hatches.set(key, { side, net, fill: [], hatch: [], pour: null }).get(key) as Zone)

        hatches.get(key)?.hatch.push(stroke)
    }

    board.outline = outlineOf(boardInfo)
    const mid    = (layer: number) => layer > TOP && layer < BOTTOM
    const stack: number[] = []

    // A LISTA PASSA TAMBÉM PELOS PLANOS (39–54), QUE FICAM FORA; PARA NA BottomLayer
    for (let layer = Number(boardInfo.LAYER1NEXT), hops = 0; layer > 0 && layer !== BOTTOM && hops < 82; layer = Number(boardInfo[`LAYER${layer}NEXT`]), hops++)
        if (mid(layer))
            stack.push(layer)

    for (const [nameView, , , , geometry] of binaryRecords(files.get('Pads6/Data'), 6)) {
        if (!geometry)
            continue

        const layer     = u8(geometry, 0)
        const component = u16(geometry, 7)
        const [x, y]    = [at(geometry, 13), -at(geometry, 17)]
        const bottom    = layer === BOTTOM
        const [w, h]    = [at(geometry, bottom ? 37 : 21), at(geometry, bottom ? 41 : 25)]
        const shape     = u8(geometry, bottom ? 51 : 49)
        const drill     = at(geometry, 45)
        const form: PadForm = shape === 1 ? Math.abs(w - h) < 0.01 ? 'circle' : 'oval' : shape === 3 ? 'polygon' : 'rect'
        const rotation  = -f64(geometry, 52)
        const name      = decoder.decode(new Uint8Array(nameView.buffer, nameView.byteOffset + 1, Math.min(u8(nameView, 0), nameView.byteLength - 1)))
        const polygon   = form === 'polygon' ? OCTAGON(w, h).reduce((out, value, i, list) => i % 2 ? out : [...out, ...rotateTo([value, list[i + 1]], rotation)], [] as number[]) : null
        const pad: BoardPad = { name, x, y, width: w, height: h, rotation, form, polygon, drill, plated: u8(geometry, 60) !== 0 || drill === 0, side: layer === MULTI || drill > 0 ? 'both' : bottom ? 'bottom' : 'top', net: netName(u16(geometry, 3)) }
        const host      = footprints[component]

        if (host)
            host.pads.push(pad)
        else
            loose.push({ ref: `P${loose.length + 1}`, value: '', name: 'PAD', x, y, rotation: 0, side: 'top', pads: [pad], silk: [] })
    }

    const addStroke = (component: number, stroke: Stroke) => (footprints[component]?.silk ?? board.silk).push(stroke)
    const addDoc    = (component: number, layer: number, points: number[], width: number) => {
        const doc = docOf(layer)

        if (doc)
            footprints[component]?.[doc[0]]?.push({ side: doc[1], points, closed: false, width, fill: false })
    }

    for (const [record] of binaryRecords(files.get('Tracks6/Data'), 1)) {
        const [layer, keepout] = [u8(record, 0), u8(record, 2) === 2]
        const [a, b]: Point[]  = [[at(record, 13), -at(record, 17)], [at(record, 21), -at(record, 25)]]
        const width            = at(record, 29)
        const [copper, silk]   = [sideOf(layer), silkOf(layer)]

        if (keepout)
            continue

        if (copper && u16(record, 5) !== NONE) {    // TRILHA DO PREENCHIMENTO HACHURADO DE UM POLÍGONO
            addHatch(u16(record, 5), copper, netName(u16(record, 3)), { side: copper, points: [...a, ...b], closed: false, width, fill: false })
            continue
        }

        if (copper)
            board.tracks.push({ side: copper, a, b, width, net: netName(u16(record, 3)) })
        else if (silk)
            addStroke(u16(record, 7), { side: silk, points: [...a, ...b], closed: false, width, fill: false })
        else if (docOf(layer))
            addDoc(u16(record, 7), layer, [...a, ...b], width)
        else if (mid(layer))
            board.inner.tracks.push({ layer, a, b, width, net: netName(u16(record, 3)) })
    }

    for (const [record] of binaryRecords(files.get('Arcs6/Data'), 1)) {
        const layer          = u8(record, 0)
        const points         = arcOf(at(record, 13), at(record, 17), at(record, 21), f64(record, 25), f64(record, 33))
        const width          = at(record, 41)
        const [copper, silk] = [sideOf(layer), silkOf(layer)]

        if (u8(record, 2) === 2)
            continue

        if (copper && u16(record, 5) !== NONE) {
            addHatch(u16(record, 5), copper, netName(u16(record, 3)), { side: copper, points, closed: false, width, fill: false })
            continue
        }

        if (copper || mid(layer))
            for (let i = 2; i < points.length; i += 2) {
                const track = { a: [points[i - 2], points[i - 1]] as Point, b: [points[i], points[i + 1]] as Point, width, net: netName(u16(record, 3)) }
                copper ? board.tracks.push({ ...track, side: copper }) : board.inner.tracks.push({ ...track, layer })
            }
        else if (silk)
            addStroke(u16(record, 7), { side: silk, points, closed: false, width, fill: false })
        else if (docOf(layer))
            addDoc(u16(record, 7), layer, points, width)
    }

    // CAMADAS DE INÍCIO E FIM EM 29/30 (ZERO EM ARQUIVO ANTIGO = PASSANTE)
    for (const [record] of binaryRecords(files.get('Vias6/Data'), 1))
        board.inner.vias.push({ x: at(record, 13), y: -at(record, 17), diameter: at(record, 21), drill: at(record, 25), net: netName(u16(record, 3)), from: u8(record, 29) || TOP, to: u8(record, 30) || BOTTOM })

    // REGIÕES DE COBRE (O PREENCHIMENTO SÓLIDO DOS POLÍGONOS E AS REGIÕES SOLTAS); RECORTES E OUTRAS KINDs NÃO SÃO COBRE
    for (const [record] of binaryRecords(files.get('Regions6/Data'), 1)) {
        const layer = u8(record, 0)
        const side  = sideOf(layer)
        const found = (side || mid(layer)) && u8(record, 2) !== 2 ? regionOf(record) : null
        const zone  = { net: netName(u16(record, 3)), fill: found?.rings ?? [], pour: null }

        if (found?.kind === '0')
            side ? board.zones.push({ ...zone, side, hatch: [] }) : board.inner.zones.push({ ...zone, layer })
    }

    // FILL: RETÂNGULO DE COBRE (CANTOS EM 13/17 E 21/25, GIRO EM 29) EM VOLTA DO CENTRO
    for (const [record] of binaryRecords(files.get('Fills6/Data'), 1)) {
        const layer            = u8(record, 0)
        const side             = sideOf(layer)
        const [x0, y0, x1, y1] = [at(record, 13), -at(record, 17), at(record, 21), -at(record, 25)]
        const [cx, cy]         = [(x0 + x1) / 2, (y0 + y1) / 2]
        const corners          = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].flatMap(([x, y]) => rotateTo([x - cx, y - cy], -f64(record, 29)).map((value, i) => value + (i ? cy : cx)))
        const zone             = { net: netName(u16(record, 3)), fill: [corners], pour: null }

        if (u8(record, 2) !== 2 && side)
            board.zones.push({ ...zone, side, hatch: [] })
        else if (u8(record, 2) !== 2 && mid(layer))
            board.inner.zones.push({ ...zone, layer })
    }

    board.footprints = [...footprints.filter(footprint => footprint.pads.length || footprint.silk.length), ...loose]
    return settleInner(board, TOP, BOTTOM, stack)
}

const rotateTo = ([x, y]: Point, degrees: number): Point => {
    const [c, s] = [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180)]
    return [x * c - y * s, x * s + y * c]
}

// ---------- ESCRITA ----------

const encoder = new TextEncoder()

// NÚMERO NO FORMATO DE PONTO FLUTUANTE DO DELPHI QUE O ALTIUM GRAVA: " 1.80000000000000E+0002"
export const delphiFloat = (value: number) => {
    if (value === 0)
        return ' 0.00000000000000E+0000'

    const [mantissa, exponent] = Math.abs(value).toExponential(14).split('e')
    const power = Number(exponent)
    return `${value < 0 ? '-' : ' '}${mantissa}E${power < 0 ? '-' : '+'}${String(Math.abs(power)).padStart(4, '0')}`
}

const milText = (value: number) => `${Number(value.toFixed(4))}mil`

const textData = (records: Record<string, string>[]) => concat(records.map(record => {
    const body  = encoder.encode(`|${Object.entries(record).map(([key, value]) => `${key}=${value}`).join('|')}\0`)
    const out   = new Uint8Array(4 + body.length)
    new DataView(out.buffer).setUint32(0, body.length, true)
    out.set(body, 4)
    return out
}))

// REGISTRO BINÁRIO: TIPO E SUB-REGISTROS PREENCHIDOS POR fill (CADA UM COM SEU TAMANHO)
const binaryRecord = (type: number, subs: [number, (view: DataView, bytes: Uint8Array) => void][]) => concat([Uint8Array.of(type), ...subs.map(([size, fill]) => {
    const out  = new Uint8Array(4 + size)
    const view = new DataView(out.buffer)
    view.setUint32(0, size, true)
    fill(new DataView(out.buffer, 4), out.subarray(4))
    return out
})])

const putPoint = (view: DataView, offset: number, x: number, y: number) => {
    view.setInt32(offset, Math.round(x * UNIT), true)
    view.setInt32(offset + 4, Math.round(-y * UNIT), true)
}

// CABEÇALHO COMUM DE TRILHA, ARCO, VIA E PAD: CAMADA, FLAGS (DESTRAVADO), NET, POLÍGONO E COMPONENTE (0xFFFF = NENHUM)
const putCommon = (view: DataView, layer: number, net: number, component: number) => {
    view.setUint8(0, layer)
    view.setUint8(1, 0x0C)
    view.setUint16(3, net, true)
    view.setUint16(5, NONE, true)
    view.setUint16(7, component, true)
    view.setUint32(9, FREE, true)
}

const SHAPES: Record<PadForm, number> = { circle: 1, oval: 1, rect: 2, polygon: 2 }

const headerOf = (count: number) => {
    const out = new Uint8Array(4)
    new DataView(out.buffer).setUint32(0, count, true)
    return out
}

const pascal = (text: string) => concat([Uint8Array.of(text.length), encoder.encode(text)])

const lengthPrefixed = (text: string) => {
    const body = pascal(text)
    const out  = new Uint8Array(4 + body.length)
    new DataView(out.buffer).setUint32(0, text.length, true)
    out.set(body, 4)
    return out
}

const COMMON = { SELECTION: 'FALSE', LAYER: 'TOP', LOCKED: 'FALSE', POLYGONOUTLINE: 'FALSE', USERROUTED: 'TRUE', KEEPOUT: 'FALSE', UNIONINDEX: '0', PRIMITIVELOCK: 'FALSE' }

// PILHA NAS CHAVES V9 (IDs DE 32 BITS: COBRE 0x01000001/0x0100FFFF E AS MidLayer EM 0x01000002…, NÚCLEOS 0x01040001…, SERIGRAFIA E MÁSCARA 0x0103xxxx) E NAS ANTIGAS LAYERn;
// COM CAMADAS INTERNAS, UM NÚCLEO ENTRE CADA PAR DE COBRES, DIVIDINDO A ESPESSURA DE 62,992 mil
// ponytail: A PILHA COM MidLayer NUNCA FOI ABERTA NO ALTIUM (O DE DUAS CAMADAS TAMBÉM NÃO); CONFERIR NELE ANTES DE CONFIAR
const DIELECTRIC = (i: number, height: number): [string, number, Record<string, string>] => [`Dielectric${i + 1}`, 17039361 + i, { DIELTYPE: '1', DIELCONST: '4.800', DIELHEIGHT: `${Number(height.toFixed(3))}mil`, DIELMATERIAL: 'FR-4' }]
const layerIds = (inner: number): [string, number, Record<string, string>][] => [
    ['TopOverlay', 16973830, {}],
    ['TopSolder', 16973834, { DIELTYPE: '3', DIELCONST: '3.500', DIELHEIGHT: '0.4mil', DIELMATERIAL: 'Solder Resist' }],
    ['TopLayer', 16777217, { COPTHICK: '1.4mil', COMPONENTPLACEMENT: '1' }],
    DIELECTRIC(0, 62.992 / (inner + 1)),
    ...Array.from({ length: inner }, (_, i) => [[`MidLayer${i + 1}`, 16777218 + i, { COPTHICK: '1.4mil' }], DIELECTRIC(i + 1, 62.992 / (inner + 1))] as [string, number, Record<string, string>][]).flat(),
    ['BottomLayer', 16842751, { COPTHICK: '1.4mil', COMPONENTPLACEMENT: '2' }],
    ['BottomSolder', 16973835, { DIELTYPE: '3', DIELCONST: '3.500', DIELHEIGHT: '0.4mil', DIELMATERIAL: 'Solder Resist' }],
    ['BottomOverlay', 16973831, {}]
]

// AS 82 CAMADAS V6 PELO NOME; A PILHA É A LISTA ENCADEADA PREV/NEXT SÓ DO COBRE, 1 → 2… (MidLayer) → 32, COM 0 NAS PONTAS; SERIGRAFIA, PASTA E MÁSCARA
// APONTAM PARA A SUA FACE SEM ENTRAR NA LISTA, COMO NOS ARQUIVOS ATUAIS DO ALTIUM (O KICAD CONTA O COBRE SEGUINDO A LISTA: UM ELO 32 → 34 VIRAVA MAIS UMA CAMADA)
const V6_NAMES = ['TopLayer', ...Array.from({ length: 30 }, (_, i) => `MidLayer${i + 1}`), 'BottomLayer', 'TopOverlay', 'BottomOverlay', 'TopPaste', 'BottomPaste', 'TopSolder', 'BottomSolder', ...Array.from({ length: 16 }, (_, i) => `InternalPlane${i + 1}`), 'DrillGuide', 'KeepOutLayer', ...Array.from({ length: 16 }, (_, i) => `Mechanical${i + 1}`), 'DrillDrawing', 'MultiLayer', 'ConnectLayer', 'BackGroundLayer', 'DRCErrorLayer', 'HighlightLayer', 'GridColor1', 'GridColor10', 'PadHoleLayer', 'ViaHoleLayer']

const stackOf = (inner: number) => {
    const order = [0, 1, ...Array.from({ length: inner }, (_, i) => i + 2), 32, 0]
    const chain = new Map([...order.slice(1, -1).map((layer, i): [number, number[]] => [layer, [order[i], order[i + 2]]]), ...[33, 35, 37].map((layer): [number, number[]] => [layer, [0, 1]]), ...[34, 36, 38].map((layer): [number, number[]] => [layer, [32, 0]])])
    return {
        ...Object.fromEntries(layerIds(inner).flatMap(([name, id, extra], i) => [[`V9_STACK_LAYER${i}_NAME`, name], [`V9_STACK_LAYER${i}_LAYERID`, String(id)], [`V9_STACK_LAYER${i}_USEDBYPRIMS`, 'TRUE'], ...Object.entries(extra).map(([key, value]) => [`V9_STACK_LAYER${i}_${key}`, value])])),
        ...Object.fromEntries(V6_NAMES.flatMap((name, i) => {
            const [prev, next] = chain.get(i + 1) ?? [0, 0]
            return [[`LAYER${i + 1}NAME`, name], [`LAYER${i + 1}PREV`, String(prev)], [`LAYER${i + 1}NEXT`, String(next)], [`LAYER${i + 1}MECHENABLED`, Object.values(MECH_OUT).includes(i + 1) ? 'TRUE' : 'FALSE'], [`LAYER${i + 1}COPTHICK`, '1.4mil'], [`LAYER${i + 1}DIELTYPE`, i === 0 ? '1' : '0'], [`LAYER${i + 1}DIELCONST`, '4.800'], [`LAYER${i + 1}DIELHEIGHT`, i === 0 ? '62.992mil' : '12.6mil'], [`LAYER${i + 1}DIELMATERIAL`, 'FR-4']]
        }))
    }
}

// REGIÃO SÓLIDA DE COBRE (KIND=0) COM FUROS: CONTORNO E CADA FURO COMO LISTA DE VÉRTICES EM double (O FORMATO QUE O LEITOR DE Regions6 LÊ)
const regionRecord = (rings: number[][], layer: number, net: number) => {
    const props = encoder.encode(`|V7_LAYER=${layer === TOP ? 'TOP' : layer === BOTTOM ? 'BOTTOM' : `MID${layer - 1}`}|NAME= |KIND=0|SUBPOLYINDEX=-1|UNIONINDEX=0|ARCRESOLUTION=0.5mil|ISSHAPEBASED=FALSE|CAVITYHEIGHT=0mil\0`)
    const size  = 22 + props.length + rings.reduce((sum, ring) => sum + 4 + 8 * ring.length, 0)
    return binaryRecord(11, [[size, (view, bytes) => {
        putCommon(view, layer, net, NONE)
        view.setUint16(14, rings.length - 1, true)
        view.setUint32(18, props.length, true)
        bytes.set(props, 22)
        let o = 22 + props.length

        for (const ring of rings) {
            view.setUint32(o, ring.length / 2, true)
            ring.forEach((value, i) => view.setFloat64(o + 4 + 8 * i, (i % 2 ? -value : value) * UNIT, true))
            o += 4 + 8 * ring.length
        }
    }]])
}

// .PcbDoc COM AS CAMADAS DE COBRE DA PLACA (AS INTERNAS COMO MidLayer, VIAS CEGAS COM O INÍCIO E O FIM): Board6 (CONTORNO E PILHA), Nets6, Components6, Pads6, Tracks6 (COM fab NA MECÂNICA 13 E courtyard NA 15), Vias6, Regions6 (AS ÁREAS DE COBRE
// JÁ PREENCHIDAS, COMO REGIÕES SÓLIDAS) E Arcs6/Texts6/Fills6/Polygons6 VAZIOS, CADA UM COM O Header DA CONTAGEM
// ponytail: A ÁREA VAI COMO REGIÃO SÓLIDA, NÃO COMO POLÍGONO REDESPEJÁVEL DO ALTIUM (Polygons6 + regiões ligadas). MELHORIA: GRAVAR O Polygons6 COM O CONTORNO DA ÁREA
export const writeAltium = (board: BoardData) => {
    const names      = netsOf(board)
    const netIndex   = new Map(names.map((name, i) => [name, i]))
    const netOf      = (name: string) => name ? netIndex.get(name) ?? NONE : NONE
    const copper     = (layer: number) => layer === 0 ? TOP : layer === board.copper - 1 ? BOTTOM : layer + 1    // CAMADA DA PLACA NEUTRA → TopLayer, MidLayerN, BottomLayer
    const outline    = board.outline[0] ?? []
    const vertices   = Object.fromEntries(Array.from({ length: outline.length / 2 }, (_, i) => [[`KIND${i}`, '0'], [`VX${i}`, milText(outline[2 * i])], [`VY${i}`, milText(-outline[2 * i + 1])], [`CX${i}`, '0mil'], [`CY${i}`, '0mil'], [`SA${i}`, delphiFloat(0)], [`EA${i}`, delphiFloat(0)], [`R${i}`, '0mil']]).flat())
    const boardInfo  = { ...COMMON, KIND: 'Protel_Advanced_PCB', VERSION: '6.0', ORIGINX: '0mil', ORIGINY: '0mil', LAYERSETSCOUNT: '1', ...stackOf(board.copper - 2), ...vertices }
    const netRecords = names.map(name => ({ ...COMMON, NAME: name, VISIBLE: 'TRUE', COLOR: '65535' }))
    const parts      = board.footprints.map(footprint => ({ ...COMMON, LAYER: footprint.side === 'bottom' ? 'BOTTOM' : 'TOP', X: milText(footprint.x), Y: milText(-footprint.y), PATTERN: footprint.name || 'IMPORTED', NAMEON: 'TRUE', COMMENTON: 'FALSE', GROUPNUM: '0', COUNT: '0', ROTATION: delphiFloat(((-footprint.rotation % 360) + 360) % 360), HEIGHT: '0mil', COMMENT: footprint.value, SOURCEDESIGNATOR: footprint.ref, SOURCEFOOTPRINTLIBRARY: '', SOURCEDESCRIPTION: footprint.value }))
    const pads       = board.footprints.flatMap((footprint, component) => footprint.pads.map(pad => {
        const layer = pad.drill > 0 || pad.side === 'both' ? MULTI : pad.side === 'bottom' ? BOTTOM : TOP
        return binaryRecord(2, [
            [1 + pad.name.length, (_, bytes) => bytes.set(pascal(pad.name))],
            [1, () => {}],
            [5, (_, bytes) => bytes.set(encoder.encode('\u0004|&|0'))],
            [1, () => {}],
            [194, view => {
                putCommon(view, layer, netOf(pad.net), component)
                putPoint(view, 13, pad.x, pad.y)
                ;[21, 29, 37].forEach(offset => putPoint(view, offset, pad.width, -pad.height))
                view.setInt32(45, Math.round(pad.drill * UNIT), true)
                ;[49, 50, 51].forEach(offset => view.setUint8(offset, SHAPES[pad.form]))
                view.setFloat64(52, ((-pad.rotation % 360) + 360) % 360, true)
                view.setUint8(60, pad.plated ? 1 : 0)
            }],
            [0, () => {}]
        ])
    }))
    const tracks     = [...board.tracks.map(track => ({ ...track, layer: track.side === 'top' ? 0 : board.copper - 1 })), ...board.inner.tracks].map(track => binaryRecord(4, [[49, view => {
        putCommon(view, copper(track.layer), netOf(track.net), NONE)
        putPoint(view, 13, ...track.a)
        putPoint(view, 21, ...track.b)
        view.setInt32(29, Math.round(track.width * UNIT), true)
    }]]))
    // ponytail: SERIGRAFIA PREENCHIDA (TEXTO E LOGOS DESENHADOS) FICA DE FORA — EM TRILHAS SERIAM MILHARES DE CONTORNOS; O DESIGNADOR VAI NO COMPONENTE. MELHORIA: GRAVAR COMO Regions6
    const silk       = [...board.silk.map(stroke => [stroke, NONE] as const), ...board.footprints.flatMap((footprint, component) => footprint.silk.map(stroke => [stroke, component] as const))].filter(([stroke]) => !stroke.fill).flatMap(([stroke, component]) => {
        const points = stroke.closed ? [...stroke.points, stroke.points[0], stroke.points[1]] : stroke.points
        return Array.from({ length: points.length / 2 - 1 }, (_, i) => binaryRecord(4, [[49, view => {
            putCommon(view, OVERLAY[stroke.side], NONE, component)
            putPoint(view, 13, points[2 * i], points[2 * i + 1])
            putPoint(view, 21, points[2 * i + 2], points[2 * i + 3])
            view.setInt32(29, Math.round(Math.max(stroke.width, 1) * UNIT), true)
        }]]))
    })
    const docs       = board.footprints.flatMap((footprint, component) => (['fab', 'courtyard'] as const).flatMap(kind => (footprint[kind] ?? []).flatMap(stroke => {
        const points = stroke.closed ? [...stroke.points, stroke.points[0], stroke.points[1]] : stroke.points
        return Array.from({ length: points.length / 2 - 1 }, (_, i) => binaryRecord(4, [[49, view => {
            putCommon(view, MECH_OUT[kind], NONE, component)
            putPoint(view, 13, points[2 * i], points[2 * i + 1])
            putPoint(view, 21, points[2 * i + 2], points[2 * i + 3])
            view.setInt32(29, Math.round(Math.max(stroke.width, 1) * UNIT), true)
        }]]))
    })))
    // ÁREA INTERNA SEM PREENCHIMENTO (POLÍGONO DO EAGLE, ZONA DO KICAD SEM filled_polygon) VAI COM O CONTORNO CHEIO
    const regions    = [...board.zones.map(zone => ({ ...zone, layer: zone.side === 'top' ? 0 : board.copper - 1 })), ...board.inner.zones.map(zone => ({ ...zone, fill: zone.fill.length ? zone.fill : zone.pour ? [zone.pour.outline] : [] }))].flatMap(zone => nestRings(zone.fill).map(rings => regionRecord(rings, copper(zone.layer), netOf(zone.net))))
    const vias       = [...board.vias.map(via => ({ ...via, from: 0, to: board.copper - 1 })), ...board.inner.vias].map(via => binaryRecord(3, [[321, view => {
        putCommon(view, MULTI, netOf(via.net), NONE)
        view.setUint16(7, 0, true)
        view.setUint32(5, FREE, true)
        view.setUint32(9, FREE, true)
        putPoint(view, 13, via.x, via.y)
        view.setInt32(21, Math.round(via.diameter * UNIT), true)
        view.setInt32(25, Math.round(via.drill * UNIT), true)
        view.setUint8(29, copper(via.from))
        view.setUint8(30, copper(via.to))

        for (let i = 0; i < 32; i++)
            view.setInt32(75 + 4 * i, Math.round(via.diameter * UNIT), true)
    }]]))
    const fileHeader = concat([headerOf(19), ...Array.from('PCB 5.0 Bi', char => Uint8Array.of(char.charCodeAt(0), 0))])
    const six        = concat([lengthPrefixed('PCB 6.0 Binary File'), new Uint8Array(new Float64Array([5.01]).buffer), lengthPrefixed('{C1BC1A2E-6B61-4A4B-9A43-436972634D61}')])
    const streams    = new Map<string, Uint8Array>([['FileHeader', fileHeader], ['FileHeaderSix', six]])
    const add        = (name: string, data: Uint8Array, count: number) => {
        streams.set(`${name}/Header`, headerOf(count))
        streams.set(`${name}/Data`, data)
    }

    add('Board6', textData([boardInfo]), 1)
    add('Nets6', textData(netRecords), netRecords.length)
    add('Components6', textData(parts), parts.length)
    add('Pads6', concat(pads), pads.length)
    add('Tracks6', concat([...tracks, ...silk, ...docs]), tracks.length + silk.length + docs.length)
    add('Vias6', concat(vias), vias.length)
    add('Regions6', concat(regions), regions.length)
    ;['Arcs6', 'Texts6', 'Fills6', 'ShapeBasedRegions6', 'Polygons6', 'Classes6', 'Rules6', 'Dimensions6', 'ComponentBodies6'].forEach(name => add(name, new Uint8Array(), 0))
    return writeCompound(streams)
}
