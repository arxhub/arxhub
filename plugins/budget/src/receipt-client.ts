import { apiBaseUrl } from '@arxhub/core'
import { type RequestSigner, signingMiddleware } from '@arxhub/crypto'
import { illegalState } from '@arxhub/errors'
import { createTypedHttp } from '@arxhub/http'
import { fiscalQr, type ImportedReceipt, parseReceiptJson, type ReceiptLookupOptions } from './fiscal'
import { BUDGET_NAMESPACE } from './manifest'
import type { FiscalReceipt } from './model'
import type { BudgetReceiptRoutes } from './server/receipt-routes'

export async function downloadReceipt(
  serverUrl: string,
  signer: RequestSigner,
  receipt: FiscalReceipt,
  options: ReceiptLookupOptions = {},
): Promise<ImportedReceipt> {
  if (!options.position) throw illegalState('Enable location to request receipt details from FNS, or import the receipt JSON.')
  const signal = AbortSignal.any([AbortSignal.timeout(60000), ...(options.signal ? [options.signal] : [])])
  const http = createTypedHttp<BudgetReceiptRoutes>({
    baseUrl: apiBaseUrl(serverUrl, BUDGET_NAMESPACE),
    middlewares: [signingMiddleware(signer)],
    fetch: (input, init) => globalThis.fetch(input, { ...init, signal }),
  })
  try {
    const value = await http.post('/receipt', { qr: fiscalQr(receipt), position: options.position })
    return parseReceiptJson(value, receipt)
  } catch (error) {
    // Gateway errors may be JSON or text depending on its adapter; neither carries provider secrets.
    if (
      error &&
      typeof error === 'object' &&
      'json' in error &&
      error.json &&
      typeof error.json === 'object' &&
      'message' in error.json &&
      typeof error.json.message === 'string'
    )
      throw illegalState(error.json.message)
    if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
      throw illegalState('Receipt download is unavailable on this server. Update it or set the receipt server URL in Budget settings.')
    }
    throw error
  }
}
