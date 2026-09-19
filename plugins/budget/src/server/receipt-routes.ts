import { AUTH_HEADERS } from '@arxhub/crypto'
import { illegalState, internalServer, isAppError, unauthorized } from '@arxhub/errors'
import Elysia, { status, t } from 'elysia'
import { parseFiscalQr } from '../fiscal'
import type { FnsReceiptClient } from './fns-client'

export function receiptRoutes(client: Pick<FnsReceiptClient, 'lookup'> | null) {
  return new Elysia().post(
    '/receipt',
    async ({ body, request }) => {
      const user = request.headers.get(AUTH_HEADERS.publicKey)
      if (!user) {
        const error = unauthorized('Connect with your ArxHub identity to download a receipt.')
        return status(error.body.statusCode, error.render())
      }
      if (!client) {
        const error = illegalState(
          'FNS receipt download is not configured on this ArxHub server. You can still save the QR or import receipt JSON.',
        )
        return status(error.body.statusCode, error.render())
      }
      try {
        return await client.lookup(parseFiscalQr(body.qr), user, { signal: request.signal, position: body.position })
      } catch (error) {
        if (isAppError(error)) return status(error.body.statusCode, error.render())
        const unavailable = internalServer(error, 'Could not download this receipt from FNS. Retry later or import the receipt JSON.')
        return status(unavailable.body.statusCode, unavailable.render())
      }
    },
    {
      body: t.Object({
        qr: t.String({ minLength: 1, maxLength: 4096 }),
        position: t.Object({ latitude: t.Number({ minimum: -90, maximum: 90 }), longitude: t.Number({ minimum: -180, maximum: 180 }) }),
      }),
    },
  )
}

export type BudgetReceiptRoutes = ReturnType<typeof receiptRoutes>
