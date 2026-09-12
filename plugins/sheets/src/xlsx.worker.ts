import type { Workbook } from './workbook'
import { exportXlsx, importXlsx } from './xlsx'
export type XlsxRequest = { kind: 'import'; bytes: ArrayBuffer } | { kind: 'export'; book: Workbook }
self.onmessage = async (event: MessageEvent<XlsxRequest>) => {
  try {
    const request = event.data
    if (request.kind === 'import') self.postMessage({ book: await importXlsx(request.bytes) })
    else {
      const bytes = await exportXlsx(request.book)
      self.postMessage({ bytes }, { transfer: [bytes] })
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'XLSX conversion failed' })
  }
}
