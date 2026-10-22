import { exportBundle, type BundleFile } from '../../core/Sketch'
import type { Doc } from '../../core/Document'
import { serve } from '../Serve'

export type SaveRequest = { doc: Doc, name: string, files: BundleFile[] }

// O .fzz MONTADO FORA DA THREAD DA INTERFACE: PARA 1.000 PEÇAS SÃO CENTENAS DE MILISSEGUNDOS DE TEXTO E ZIP
serve<SaveRequest>(({ doc, name, files }) => exportBundle(doc, name, files), (bytes: Uint8Array) => [bytes.buffer])
