import type { Doc } from '../Document'
import type { Library } from '../Library'
import type { Artwork } from '../Cam'
import { Pdf } from '../Pdf'
import { getTag, t } from '../Text'

type Row = { label: string, value: string, mn: string, mpn: string, title: string, properties: string }

const ELECTRICAL = ['resistance', 'capacitance', 'inductance', 'voltage', 'current', 'power']
const DESCRIBED  = [...ELECTRICAL, 'mpn', 'mn']
const EXCLUDED   = ['wire', 'note', 'logo', 'ruler', 'symbol', 'copperFill', 'board', 'resizableBoard', 'breadboard']
const THROUGH    = /DIP|DIL|ZIP|SIP|PFM|TO-?(3|5|18|39|46|52|66|72|92|126|202|218|220|247|251|252|263|264)\b/i

const csv = (fields: string[]) => fields.map(field => /[",\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field).join(',')

const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

// LINHAS DE MONTAGEM: UMA POR INSTÂNCIA DE PEÇA REAL, COM VALOR ELÉTRICO E PROPRIEDADES DO INSPETOR (SPEC 03 §5.2)
export const getBomRows = (doc: Doc, library: Library): Row[] => Object.values(doc.instances).flatMap(instance => {
    const part = library.getPart(instance.moduleIdRef)

    if (!part || EXCLUDED.includes(part.kind))
        return []

    const merged = { ...part.properties, ...instance.properties }
    const value  = ELECTRICAL.map(key => merged[key]).filter(Boolean).join(' ')
    return [{ label: instance.title, value, mn: merged.mn ?? '', mpn: merged.mpn ?? '', title: part.title, properties: Object.entries(merged).filter(([key, item]) => key !== 'family' && item).map(([key, item]) => `${key} ${item}`).join('; ') }]
}).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))

// LISTA DE COMPRAS: AGRUPA PELO VALOR, mn, mpn, TÍTULO E PROPRIEDADES, COM QUANTIDADE (SPEC 03 §5.2)
export const getShopping = (rows: Row[]) => [...rows.reduce((groups, row) => {
    const key   = [row.value, row.mn, row.mpn, row.title, row.properties].join('|')
    const group = groups.get(key) ?? { ...row, labels: [] as string[] }
    group.labels.push(row.label)
    return groups.set(key, group)
}, new Map<string, Row & { labels: string[] }>()).values()]

export const exportBomCsv = (doc: Doc, library: Library) => [csv([t('Rótulo'), t('Valor'), 'MN', 'MPN', t('Peça'), t('Propriedades')]), ...getBomRows(doc, library).map(row => csv([row.label, row.value, row.mn, row.mpn, row.title, row.properties]))].join('\n') + '\n'

export const exportBomHtml = (doc: Doc, library: Library, name: string) => {
    const rows     = getBomRows(doc, library)
    const shopping = getShopping(rows)
    const table    = (head: string[], body: string[][]) => `<table><thead><tr>${head.map(cell => `<th>${escapeHtml(t(cell))}</th>`).join('')}</tr></thead><tbody>${body.map(line => `<tr>${line.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    const style    = 'body{font-family:sans-serif;margin:24px;color:#222}table{border-collapse:collapse;margin:12px 0 28px}th,td{border:1px solid #ccc;padding:4px 8px;font-size:13px;text-align:left}th{background:#eef5ee}'
    return `<!doctype html><html lang="${getTag()}"><head><meta charset="utf-8"><title>${t('Lista de materiais')} — ${escapeHtml(name)}</title><style>${style}</style></head><body><h1>${t('Lista de materiais')}</h1><p>${escapeHtml(name)} · ${t('{0} peças', rows.length)}</p><h2>${t('Lista de montagem')}</h2>${table(['Rótulo', 'Peça', 'Valor', 'MN', 'MPN', 'Propriedades'], rows.map(row => [row.label, row.title, row.value, row.mn, row.mpn, row.properties]))}<h2>${t('Lista de compras')}</h2>${table(['Qtd.', 'Peça', 'Valor', 'Rótulos', 'Propriedades'], shopping.map(group => [String(group.labels.length), group.title, group.value, group.labels.join(', '), group.properties]))}</body></html>\n`
}

const PAGE: [number, number] = [595.28, 841.89]    // A4 EM PONTOS
const MARGIN   = 36
const ROW      = 13
const CELL     = 9
const ADVANCE  = 0.52    // LARGURA MÉDIA DA HELVETICA EM em, PARA CORTAR O TEXTO NA COLUNA

const ASSEMBLY: [string, number][] = [['Rótulo', 60], ['Peça', 150], ['Valor', 90], ['MN', 55], ['MPN', 60], ['Propriedades', 108]]
const SHOPPING: [string, number][] = [['Qtd.', 30], ['Peça', 160], ['Valor', 100], ['Rótulos', 110], ['Propriedades', 123]]

const fit = (text: string, width: number) => text.length * CELL * ADVANCE <= width - 4 ? text : `${text.slice(0, Math.max(1, Math.floor((width - 4) / (CELL * ADVANCE)) - 1))}…`

// LISTA DE MATERIAIS EM PDF A4: CABEÇALHO, LISTA DE MONTAGEM E LISTA DE COMPRAS EM TABELAS COM QUEBRA DE PÁGINA (SPEC 03 §5.2)
export const exportBomPdf = (doc: Doc, library: Library, name: string) => {
    const rows     = getBomRows(doc, library)
    const shopping = getShopping(rows)
    const pdf      = new Pdf()
    let y = MARGIN

    const newPage = () => {
        pdf.addPage(...PAGE)
        y = MARGIN
    }

    const table = (title: string, columns: [string, number][], lines: string[][]) => {
        const cells = (values: string[], bold: boolean) => {
            let x = MARGIN

            columns.forEach(([, width], i) => {
                pdf.text(x + 2, y, CELL, fit(values[i] ?? '', width), bold)
                x += width
            })

            pdf.line(MARGIN, y + 4, PAGE[0] - MARGIN, y + 4, bold ? 0.75 : 0.25, bold ? '#000000' : '#cccccc')
            y += ROW
        }

        const header = () => cells(columns.map(([label]) => t(label)), true)

        y += ROW
        pdf.text(MARGIN, y, 13, title, true)
        y += ROW + 4
        header()

        lines.forEach(line => {
            if (y > PAGE[1] - MARGIN) {
                newPage()
                header()
            }

            cells(line, false)
        })
    }

    newPage()
    pdf.text(MARGIN, y + 12, 18, t('Lista de materiais'), true)
    pdf.text(MARGIN, y + 30, 10, `${name} · ${t('{0} peças', rows.length)} · ${new Date().toLocaleDateString(getTag())}`)
    y += 36
    table(t('Lista de montagem'), ASSEMBLY, rows.map(row => [row.label, row.title, row.value, row.mn, row.mpn, row.properties]))
    table(t('Lista de compras'), SHOPPING, shopping.map(group => [String(group.labels.length), group.title, group.value, group.labels.join(', '), group.properties]))
    return pdf.export()
}

const mountOf = (packaging: string) => {
    if (!packaging)
        return 'MANUAL'

    if (packaging.includes('THT'))
        return 'THT'

    if (packaging.includes('SMD') || /LEADLESS/i.test(packaging))
        return 'SMT'

    return THROUGH.test(packaging) ? 'THT' : 'SMT'
}

// LISTA PICK-AND-PLACE EM mil, ORIGEM NO CANTO INFERIOR ESQUERDO DA PLACA, ROTAÇÃO MATEMÁTICA (SPEC 03 §5.1)
export const exportPickAndPlace = (artwork: Artwork, library: Library, project: string) => {
    const header = ['# Pick And Place List', '# eMail=', '#', `# Project=${project}`, `# Date=${new Date().toISOString()}`, '# CreatedBy=CircuitMaster', '#', '# Coordinates in mils, always center of component', '# Origin 0/0=Lower left corner of PCB. Rotation in degree (0-360, math. pos.)', 'RefDes,Description,Package,X,Y,Rotation,Side,Mount', `Description: ${DESCRIBED.join(';')};`]
    const rows   = artwork.placed.map(placed => {
        const part      = library.getPart(placed.instance.moduleIdRef)
        const merged    = { ...part?.properties, ...placed.instance.properties }
        const packaging = merged.package ?? ''
        return { ref: placed.instance.title, description: DESCRIBED.map(key => `${(merged[key] ?? '').replaceAll(',', '_')};`).join(''), packaging, x: placed.x, y: placed.y, rotation: placed.rotation, side: placed.face === 'top' ? 'Top' : 'Bottom', mount: mountOf(packaging) }
    }).sort((a, b) => a.side.localeCompare(b.side) || a.mount.localeCompare(b.mount) || a.x + a.y - (b.x + b.y) || a.ref.localeCompare(b.ref))

    return [...header, ...rows.map(row => `${row.ref},"${row.description}","${row.packaging}",${row.x.toFixed(2)},${row.y.toFixed(2)},${row.rotation.toFixed(1)},${row.side},${row.mount}`)].join('\n') + '\n'
}
