import { strFromU8, unzipSync } from 'fflate'
import { arcPoints } from '../Board'

// LEITURA DE GERBER RS-274X (COM ATRIBUTOS X2) E EXCELLON PARA O VISUALIZADOR: CADA ARQUIVO VIRA UMA CAMADA DE ELEMENTOS SVG EM mil COM Y PARA BAIXO (SPEC 09 §8)

export type LayerKind = 'copperTop' | 'copperBottom' | 'copperInner' | 'maskTop' | 'maskBottom' | 'silkTop' | 'silkBottom' | 'pasteTop' | 'pasteBottom' | 'outline' | 'drill' | 'other'
export type GerberLayer = { name: string, kind: LayerKind, svg: string, box: [number, number, number, number], count: number, problems: string[] }

type Aperture = { flash: (x: number, y: number) => string, width: number }

const MIL_PER = { in: 1000, mm: 1000 / 25.4 }
const CLEAR   = 'var(--gerber-clear)'    // POLARIDADE CLARA APAGA COM A COR DE FUNDO DO VISUALIZADOR
const DARK    = 'currentColor'          // A COR DA CAMADA VEM DO GRUPO NA TELA

const fixed = (value: number) => Number(value.toFixed(3))

// EXPRESSÃO DE MACRO: NÚMEROS, $n, + - x X / E PARÊNTESES (x É MULTIPLICAÇÃO NO GERBER)
const evaluate = (text: string, vars: Map<number, number>): number => {
    const tokens = text.replace(/\s+/g, '').match(/\$\d+|\d*\.?\d+(?:[eE][-+]?\d+)?|[-+xX/()]/g) ?? []
    let at       = 0
    const atom   = (): number => {
        const token = tokens[at++]

        if (token === '(') {
            const value = sum()
            at++
            return value
        }

        if (token === '-')
            return -atom()

        if (token === '+')
            return atom()

        return token?.startsWith('$') ? vars.get(Number(token.slice(1))) ?? 0 : Number(token ?? 0)
    }
    const product = (): number => {
        let value = atom()

        while (tokens[at] && /^[xX/]$/.test(tokens[at]))
            value = tokens[at++] === '/' ? value / atom() : value * atom()

        return value
    }
    const sum = (): number => {
        let value = product()

        while (tokens[at] === '+' || tokens[at] === '-')
            value = tokens[at++] === '+' ? value + product() : value - product()

        return value
    }
    return sum()
}

const rotateAround = (points: number[], degrees: number) => {
    const [c, s] = [Math.cos(degrees * Math.PI / 180), Math.sin(degrees * Math.PI / 180)]
    return Array.from({ length: points.length / 2 }, (_, i) => [points[2 * i] * c - points[2 * i + 1] * s, points[2 * i] * s + points[2 * i + 1] * c]).flat()
}

const polygonSvg = (points: number[], x: number, y: number, fill: string) => `<path d="M${Array.from({ length: points.length / 2 }, (_, i) => `${fixed(x + points[2 * i])} ${fixed(-(y + points[2 * i + 1]))}`).join('L')}Z" fill="${fill}"/>`

const regularPolygon = (diameter: number, vertices: number, rotation: number) => rotateAround(Array.from({ length: vertices }, (_, i) => [diameter / 2 * Math.cos(2 * Math.PI * i / vertices), diameter / 2 * Math.sin(2 * Math.PI * i / vertices)]).flat(), rotation)

const obround = (w: number, h: number) => {
    const r = Math.min(w, h) / 2
    return w >= h ? [...arcPoints(w / 2 - r, 0, r, -90, 180), ...arcPoints(r - w / 2, 0, r, 90, 180)] : [...arcPoints(0, h / 2 - r, r, 0, 180), ...arcPoints(0, r - h / 2, r, 180, 180)]
}

// PRIMITIVAS DE MACRO (1 CÍRCULO, 4 CONTORNO, 5 POLÍGONO, 7 TÉRMICO COMO ANEL, 20 LINHA, 21 RETÂNGULO CENTRADO) EM POLÍGONOS RELATIVOS AO PONTO DO FLASH
const macroShapes = (body: string[], params: number[], scale: number) => {
    const vars   = new Map(params.map((value, i) => [i + 1, value]))
    const shapes: { points: number[], dark: boolean }[] = []

    for (const statement of body) {
        if (statement.startsWith('0'))
            continue

        const assign = statement.match(/^\$(\d+)=(.+)$/)

        if (assign) {
            vars.set(Number(assign[1]), evaluate(assign[2], vars))
            continue
        }

        const values = statement.split(',').map(value => evaluate(value, vars))
        const [code, exposure] = values
        const s      = (value: number) => value * scale
        const dark   = exposure !== 0
        const last   = values[values.length - 1]

        if (code === 1)
            shapes.push({ points: rotateAround(arcPoints(s(values[3]), s(values[4]), s(values[2]) / 2, 0, 360), values[5] ?? 0), dark })
        else if (code === 20) {
            const [w, x1, y1, x2, y2] = values.slice(2).map(s)
            const [dx, dy] = [x2 - x1, y2 - y1]
            const length   = Math.hypot(dx, dy) || 1
            const [nx, ny] = [-dy / length * w / 2, dx / length * w / 2]
            shapes.push({ points: rotateAround([x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny], last), dark })
        } else if (code === 21) {
            const [w, h, cx, cy] = values.slice(2).map(s)
            shapes.push({ points: rotateAround([cx - w / 2, cy - h / 2, cx + w / 2, cy - h / 2, cx + w / 2, cy + h / 2, cx - w / 2, cy + h / 2], last), dark })
        } else if (code === 4) {
            const n = values[2]
            shapes.push({ points: rotateAround(values.slice(3, 5 + 2 * n).map(s), values[5 + 2 * n] ?? 0), dark })
        } else if (code === 5)
            shapes.push({ points: rotateAround(regularPolygon(s(values[5]), values[2], 0).map((value, i) => value + (i % 2 ? s(values[4]) : s(values[3]))), values[6] ?? 0), dark })
        else if (code === 7) {
            const [cx, cy, outer] = values.slice(1, 4).map(s)
            shapes.push({ points: arcPoints(cx, cy, outer / 2, 0, 360), dark: true })
            shapes.push({ points: arcPoints(cx, cy, s(values[4]) / 2, 0, 360), dark: false })
        }
    }

    return shapes
}

const KINDS: [RegExp, LayerKind][] = [
    [/Copper,L1,|\.(gtl|cmp|top)$|f[._-]cu/i, 'copperTop'], [/Copper,L\d+,Bot|\.(gbl|sol|bot)$|b[._-]cu/i, 'copperBottom'], [/Copper,L\d+,Inr|\.g\d+$|in\d[._-]cu/i, 'copperInner'],
    [/Soldermask,Top|\.(gts|stc)$|f[._-]mask/i, 'maskTop'], [/Soldermask,Bot|\.(gbs|sts)$|b[._-]mask/i, 'maskBottom'], [/Legend,Top|\.(gto|plc)$|f[._-]silk/i, 'silkTop'], [/Legend,Bot|\.(gbo|pls)$|b[._-]silk/i, 'silkBottom'],
    [/Paste,Top|\.(gtp|crc)$|f[._-]paste/i, 'pasteTop'], [/Paste,Bot|\.(gbp|crs)$|b[._-]paste/i, 'pasteBottom'], [/Profile|\.(gm\d*|gko|gml|dim)$|edge[._-]cuts|contour|outline/i, 'outline'], [/\.(drl|xln|exc|drd|txt)$|drill/i, 'drill']
]

export const layerKind = (name: string, functionAttribute = '') => KINDS.find(([pattern]) => pattern.test(functionAttribute) || pattern.test(name))?.[1] ?? 'other'

const grow = (box: [number, number, number, number], x: number, y: number, r = 0): [number, number, number, number] => [Math.min(box[0], x - r), Math.min(box[1], -y - r), Math.max(box[2], x + r), Math.max(box[3], -y + r)]

// UM ARQUIVO RS-274X: FORMATO E UNIDADE, ABERTURAS E MACROS, TRAÇOS (G01/G02/G03 COM G75), FLASHES, REGIÕES G36/G37 E POLARIDADE LPD/LPC; STEP-AND-REPEAT E BLOCOS DE ABERTURA FICAM DE FORA
export const readGerber = (name: string, text: string): GerberLayer => {
    const color     = DARK
    const apertures = new Map<string, Aperture>()
    const macros    = new Map<string, string[]>()
    const out: string[] = []
    const problems  = new Set<string>()
    let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
    let format      = { x: 6, y: 6, trailing: false }
    let scale       = MIL_PER.in
    let [x, y]      = [0, 0]
    let mode        = 'G01'
    let current: Aperture | null = null
    let dark        = true
    let region: number[][] | null = null
    let fileFunction = ''
    const fill      = () => dark ? color : CLEAR
    const coordinate = (value: string | undefined, digits: number, previous: number) => {
        if (value === undefined)
            return previous

        if (value.includes('.'))
            return Number(value) * scale

        const negative = value.startsWith('-')
        const raw      = value.replace(/^[-+]/, '')
        const padded   = format.trailing ? raw.padEnd(digits + 6, '0').slice(0, raw.length > digits ? raw.length : digits + 6) : raw
        const number   = format.trailing ? Number(padded.slice(0, padded.length - digits) + '.' + padded.slice(padded.length - digits)) : Number(raw) / 10 ** digits
        return (negative ? -number : number) * scale
    }
    const commands  = text.replace(/\r?\n/g, '').match(/%[^%]*%|[^%*]+\*/g) ?? []

    for (const command of commands) {
        if (command.startsWith('%')) {
            const blocks = command.slice(1, -1).split('*').filter(Boolean)
            const head   = blocks[0] ?? ''

            if (head.startsWith('FS')) {
                const match = head.match(/X(\d)(\d)Y(\d)(\d)/)
                format      = { x: Number(match?.[2] ?? 6), y: Number(match?.[4] ?? 6), trailing: head[2] === 'T' }
            } else if (head.startsWith('MO')) {
                scale = head.includes('MM') ? MIL_PER.mm : MIL_PER.in
            } else if (head.startsWith('AM')) {
                macros.set(head.slice(2), blocks.slice(1))
            } else if (head.startsWith('AD')) {
                const match = head.match(/^ADD(\d+)([^,]+),?(.*)$/)

                if (!match)
                    continue

                const [, code, kind, rest] = match
                const values = rest ? rest.split('X').map(Number) : []
                const s      = values.map(value => value * scale)
                const aperture: Aperture = kind === 'C' ? { width: s[0], flash: (px, py) => `<circle cx="${fixed(px)}" cy="${fixed(-py)}" r="${fixed(s[0] / 2)}" fill="${fill()}"/>` } :
                                           kind === 'R' ? { width: Math.min(s[0], s[1]), flash: (px, py) => `<rect x="${fixed(px - s[0] / 2)}" y="${fixed(-py - s[1] / 2)}" width="${fixed(s[0])}" height="${fixed(s[1])}" fill="${fill()}"/>` } :
                                           kind === 'O' ? { width: Math.min(s[0], s[1]), flash: (px, py) => polygonSvg(obround(s[0], s[1]), px, py, fill()) } :
                                           kind === 'P' ? { width: s[0], flash: (px, py) => polygonSvg(regularPolygon(s[0], values[1], values[2] ?? 0), px, py, fill()) } :
                                           { width: 0, flash: (px, py) => macroShapes(macros.get(kind) ?? [], values, scale).map(shape => polygonSvg(shape.points, px, py, shape.dark === dark ? color : CLEAR)).join('') }

                if (!['C', 'R', 'O', 'P'].includes(kind) && !macros.has(kind))
                    problems.add(`abertura ${kind} sem macro`)

                apertures.set(`D${Number(code)}`, aperture)
            } else if (head.startsWith('LP')) {
                dark = head[2] !== 'C'
            } else if (head.startsWith('TF.FileFunction')) {
                fileFunction = head
            } else if (head.startsWith('SR') && head !== 'SR' || head.startsWith('AB')) {
                problems.add('step-and-repeat e blocos de abertura não são desenhados')
            }

            continue
        }

        const word = command.slice(0, -1).trim()

        if (/^G0?4/.test(word) || !word)
            continue

        const g = word.match(/G0?([123])(?!\d)/)

        if (g)
            mode = `G0${g[1]}`

        if (/G36/.test(word))
            region = []

        if (/G37/.test(word)) {
            region?.filter(contour => contour.length >= 6).forEach(contour => out.push(polygonSvg(contour, 0, 0, fill())))
            region = null
            continue
        }

        const select = word.match(/(?:^|G54)D(\d{2,})$/)

        if (select && Number(select[1]) >= 10) {
            current = apertures.get(`D${Number(select[1])}`) ?? null
            continue
        }

        const values = Object.fromEntries([...word.matchAll(/([XYIJ])([-+]?[\d.]+)/g)].map(match => [match[1], match[2]]))
        const op     = word.match(/D0?([123])$/)?.[1] ?? (Object.keys(values).length ? '1' : '')
        const [nx, ny] = [coordinate(values.X, format.x, x), coordinate(values.Y, format.y, y)]

        if (op === '2') {
            if (region)
                region.push([nx, ny])
        } else if (op === '3') {
            if (current)
                out.push(current.flash(nx, ny))

            box = grow(box, nx, ny, current?.width ?? 0)
        } else if (op === '1') {
            const path = mode === 'G01' ? [x, y, nx, ny] : (() => {
                const [cx, cy] = [x + coordinate(values.I ?? '0', format.x, 0), y + coordinate(values.J ?? '0', format.y, 0)]
                const start    = Math.atan2(y - cy, x - cx) * 180 / Math.PI
                const end      = Math.atan2(ny - cy, nx - cx) * 180 / Math.PI
                const sweep    = mode === 'G03' ? ((end - start) % 360 + 360) % 360 || 360 : -(((start - end) % 360 + 360) % 360 || 360)
                return arcPoints(cx, cy, Math.hypot(x - cx, y - cy), start, sweep)
            })()

            if (region) {
                if (!region.length)
                    region.push([x, y])

                region[region.length - 1].push(...path.slice(2))
            } else if (current) {
                out.push(`<path d="M${Array.from({ length: path.length / 2 }, (_, i) => `${fixed(path[2 * i])} ${fixed(-path[2 * i + 1])}`).join('L')}" fill="none" stroke="${fill()}" stroke-width="${fixed(current.width)}" stroke-linecap="round" stroke-linejoin="round"/>`)
            }

            for (let i = 0; i < path.length; i += 2)
                box = grow(box, path[i], path[i + 1], (current?.width ?? 0) / 2)
        }

        ;[x, y] = [nx, ny]
    }

    return { name, kind: layerKind(name, fileFunction), svg: out.join(''), box, count: out.length, problems: [...problems] }
}

// EXCELLON: FERRAMENTAS DO CABEÇALHO (T1C0.8), UNIDADE E ZEROS (INCH/METRIC, LZ/TZ), FUROS X/Y E RASGOS G85
export const readExcellon = (name: string, text: string): GerberLayer => {
    const color  = DARK
    const tools  = new Map<string, number>()
    const out: string[] = []
    let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
    let scale    = MIL_PER.in
    let decimals = 4
    let leading  = true
    let tool     = 0
    let [x, y]   = [0, 0]
    const value  = (text: string | undefined, previous: number) => {
        if (text === undefined)
            return previous

        if (text.includes('.'))
            return Number(text) * scale

        const negative = text.startsWith('-')
        const raw      = text.replace(/^[-+]/, '')
        const integer  = scale === MIL_PER.in ? 2 : 3
        const number   = leading ? Number(raw) / 10 ** decimals : Number(raw.padEnd(integer + decimals, '0')) / 10 ** decimals
        return (negative ? -number : number) * scale
    }

    for (const line of text.split(/\r?\n/).map(item => item.trim()).filter(Boolean)) {
        if (/^(INCH|METRIC)/.test(line)) {
            scale    = line.startsWith('METRIC') ? MIL_PER.mm : MIL_PER.in
            decimals = line.startsWith('METRIC') ? 3 : 4
            leading  = !line.includes('LZ') || line.includes('TZ')
            const format = line.match(/0+\.(0+)/)

            if (format)
                decimals = format[1].length

            continue
        }

        const definition = line.match(/^T(\d+)(?:F\d+)?(?:S\d+)?C([\d.]+)/)

        if (definition) {
            tools.set(String(Number(definition[1])), Number(definition[2]) * scale)
            continue
        }

        const select = line.match(/^T(\d+)$/)

        if (select) {
            tool = tools.get(String(Number(select[1]))) ?? 0
            continue
        }

        const slot = line.match(/X([-\d.]+)?Y([-\d.]+)?G85X([-\d.]+)?Y([-\d.]+)?/)
        const hit  = line.match(/^(?:G0?5)?X([-\d.]+)?Y?([-\d.]+)?$|^Y([-\d.]+)$/)

        if (slot) {
            const [x1, y1] = [value(slot[1], x), value(slot[2], y)]
            const [x2, y2] = [value(slot[3], x1), value(slot[4], y1)]
            out.push(`<path d="M${fixed(x1)} ${fixed(-y1)}L${fixed(x2)} ${fixed(-y2)}" stroke="${color}" stroke-width="${fixed(tool)}" stroke-linecap="round" fill="none"/>`)
            ;[x, y] = [x2, y2]
            box = grow(grow(box, x1, y1, tool / 2), x2, y2, tool / 2)
        } else if (hit && line.match(/X|Y/)) {
            const [hx, hy] = [line.match(/X([-+\d.]+)/)?.[1], line.match(/Y([-+\d.]+)/)?.[1]]
            ;[x, y] = [value(hx, x), value(hy, y)]
            out.push(`<circle cx="${fixed(x)}" cy="${fixed(-y)}" r="${fixed(tool / 2)}" fill="${color}"/>`)
            box = grow(box, x, y, tool / 2)
        }
    }

    return { name, kind: 'drill', svg: out.join(''), box, count: out.length, problems: [] }
}

// ARQUIVO DE FABRICAÇÃO PELO CONTEÚDO: EXCELLON TEM M48 OU T1C NO COMEÇO; GERBER TEM %FS OU D01/D02/D03
export const isExcellon = (text: string) => /^\s*(?:;[^\n]*\n\s*)*M48/.test(text) || /^T\d+C[\d.]+/m.test(text.slice(0, 2000))
export const isGerber = (text: string) => /%FS[LT]/.test(text.slice(0, 4000)) || /D0?[123]\*/.test(text.slice(0, 4000))

const FABRICATION = /\.(gbr|ger|pho|art|gtl|gbl|gts|gbs|gto|gbo|gtp|gbp|gm\d*|gko|gml|g\d+|drl|xln|exc|drd|txt|cmp|sol|stc|sts|plc|pls|crc|crs|dim)$/i    // .txt SÓ ENTRA SE O CONTEÚDO FOR EXCELLON OU GERBER
const ORDER: LayerKind[] = ['outline', 'copperBottom', 'maskBottom', 'pasteBottom', 'silkBottom', 'copperInner', 'copperTop', 'maskTop', 'pasteTop', 'silkTop', 'drill', 'other']

// ARQUIVOS DE FABRICAÇÃO DE UM .zip (OU UM ARQUIVO SOLTO COM EXTENSÃO DE GERBER/FURAÇÃO), RECONHECIDOS PELO CONTEÚDO, NA ORDEM DE BAIXO PARA CIMA; NULO SE NÃO HÁ NENHUM
export const readFabrication = (name: string, bytes: Uint8Array): GerberLayer[] | null => {
    const files: [string, Uint8Array][] = name.toLowerCase().endsWith('.zip') ? Object.entries(unzipSync(bytes)).filter(([file]) => !file.endsWith('/')) : FABRICATION.test(name) ? [[name, bytes]] : []
    const layers = files.flatMap(([file, data]) => {
        const text = strFromU8(data)
        return isExcellon(text) ? [readExcellon(file, text)] : isGerber(text) ? [readGerber(file, text)] : []
    })
    return layers.length ? layers.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind)) : null
}
