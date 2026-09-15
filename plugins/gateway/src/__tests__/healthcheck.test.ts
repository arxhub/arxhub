import { describe, expect, it } from 'vitest'
import { healthcheckRoute } from '../server/routes/healthcheck'

describe('healthcheckRoute', () => {
  it('answers with the running version and nothing else', async () => {
    const res = await healthcheckRoute({ version: '1.2.3' }).handle(new Request('http://localhost/healthcheck'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    // FR-43: a liveness probe says the instance is up and which build it is — never what the store holds
    // or where sync stands. The exact key set is the assertion, so a field added later has to come here.
    expect(await res.json()).toEqual({ status: 'ok', version: '1.2.3' })
  })

  it('is a GET only', async () => {
    const res = await healthcheckRoute({ version: '1.2.3' }).handle(new Request('http://localhost/healthcheck', { method: 'POST' }))
    expect(res.status).toBe(404)
  })
})
