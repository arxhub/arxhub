import Elysia, { type AnyElysia } from 'elysia'

// FR-43 bounds the body: it says the instance is up and which build answered (FR-210), and nothing
// about what the store holds or where sync stands — the auth guard always exempts GET/HEAD here.
export function healthcheckRoute({ version }: { version: string }): AnyElysia {
  return new Elysia().get('/healthcheck', () => ({ status: 'ok', version }))
}
