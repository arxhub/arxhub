import { isAppError, validation } from '@arxhub/errors'
import Elysia, { status } from 'elysia'
import { retryAfterOf } from './errors'
import type { PairingRelay } from './relay'
import { claimBody, createInvitationBody, hostNonceBody, PAIR_TOKEN_HEADER, pairingRefParams, payloadBody, revealBody } from './wire'

type Headers = Record<string, string | number | string[]>

// Every status the relay refuses with. Named as literals so each lands in the route's response type as
// an error entry — a bare `number` would fold the error body into the success type the client infers.
const REFUSALS = [400, 403, 404, 409, 429] as const
type Refusal = (typeof REFUSALS)[number]
const isRefusal = (code: number): code is Refusal => (REFUSALS as readonly number[]).includes(code)

// A relay refusal becomes its own status with the error body; anything else is a server fault and is
// rethrown so the gateway logs a genuine 500.
function refuse(error: unknown, headers: Headers) {
  if (!isAppError(error)) throw error
  const code = error.body.statusCode
  if (!isRefusal(code)) throw error
  const retryAfter = retryAfterOf(error)
  if (retryAfter != null) headers['retry-after'] = String(retryAfter)
  return status(code, error.render())
}

const noContent = () => new Response(null, { status: 204 })

// Relative routes; the gateway mounts them at /api/pair. Host routes (`/invitations/*`) pass the normal
// signature guard, so only the vault's own key can open or read an invitation. Joiner routes
// (`/join/*`) are the guard's anonymous prefix — the joining device has no identity yet — and are held
// in check by the relay instead: a one-time claim, a token for every later step, and rate limits.
// Do NOT annotate the return type: the inferred route tree is the client contract.
export function pairingRoutes(relay: PairingRelay) {
  return (
    new Elysia({ name: 'protection-pairing' })
      // Elysia answers a schema failure with 422; the protocol calls a malformed request a 400, the same
      // ValidationError the relay raises for bytes that decode to the wrong length.
      .onError(({ code }) => {
        if (code !== 'VALIDATION' && code !== 'PARSE') return
        return status(400, validation('Malformed pairing request').render())
      })
      .post(
        '/invitations',
        ({ body, set }) => {
          try {
            return status(201, relay.create(body.hostKey))
          } catch (error) {
            return refuse(error, set.headers)
          }
        },
        { body: createInvitationBody },
      )
      .get(
        '/invitations/:id',
        ({ params, set }) => {
          try {
            return relay.hostView(params.id)
          } catch (error) {
            return refuse(error, set.headers)
          }
        },
        { params: pairingRefParams },
      )
      .post(
        '/invitations/:id/nonce',
        ({ params, body, set }) => {
          try {
            relay.hostNonce(params.id, body.hostNonce)
            return noContent()
          } catch (error) {
            return refuse(error, set.headers)
          }
        },
        { params: pairingRefParams, body: hostNonceBody },
      )
      .post(
        '/invitations/:id/payload',
        ({ params, body, set }) => {
          try {
            relay.deliver(params.id, body.ciphertext)
            return noContent()
          } catch (error) {
            return refuse(error, set.headers)
          }
        },
        { params: pairingRefParams, body: payloadBody },
      )
      .delete(
        '/invitations/:id',
        ({ params, set }) => {
          try {
            relay.hostCancel(params.id)
            return noContent()
          } catch (error) {
            return refuse(error, set.headers)
          }
        },
        { params: pairingRefParams },
      )
      // `:id` here is either the invitation id (from a QR) or the typed code; the relay tells them apart.
      .post(
        '/join/:id',
        ({ params, body, set }) => {
          try {
            return relay.claim(params.id, body)
          } catch (error) {
            return refuse(error, set.headers)
          }
        },
        { params: pairingRefParams, body: claimBody },
      )
      .get(
        '/join/:id',
        ({ params, request, set }) => {
          try {
            return relay.joinerView(params.id, request.headers.get(PAIR_TOKEN_HEADER))
          } catch (error) {
            return refuse(error, set.headers)
          }
        },
        { params: pairingRefParams },
      )
      .post(
        '/join/:id/reveal',
        ({ params, body, request, set }) => {
          try {
            relay.reveal(params.id, request.headers.get(PAIR_TOKEN_HEADER), body.joinerNonce)
            return noContent()
          } catch (error) {
            return refuse(error, set.headers)
          }
        },
        { params: pairingRefParams, body: revealBody },
      )
      .post(
        '/join/:id/ack',
        ({ params, request, set }) => {
          try {
            relay.ack(params.id, request.headers.get(PAIR_TOKEN_HEADER))
            return noContent()
          } catch (error) {
            return refuse(error, set.headers)
          }
        },
        { params: pairingRefParams },
      )
      .delete(
        '/join/:id',
        ({ params, request, set }) => {
          try {
            relay.joinerCancel(params.id, request.headers.get(PAIR_TOKEN_HEADER))
            return noContent()
          } catch (error) {
            return refuse(error, set.headers)
          }
        },
        { params: pairingRefParams },
      )
  )
}

export type PairingApp = ReturnType<typeof pairingRoutes>
