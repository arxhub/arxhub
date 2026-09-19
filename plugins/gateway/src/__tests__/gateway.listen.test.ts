import type { Logger } from '@arxhub/core'
import { AppError } from '@arxhub/errors'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockListen } = vi.hoisted(() => ({
  mockListen: vi.fn(),
}))

vi.mock('elysia', () => {
  class Elysia {
    use = vi.fn().mockReturnThis()
    listen = mockListen
  }
  return { default: Elysia, Elysia }
})

vi.mock('@elysiajs/node', () => ({ node: () => ({}) }))

import { Gateway } from '../server/gateway'

function nodeHandle(listening: boolean) {
  return { node: { server: { listening } } }
}

function testLogger(): Logger {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  }
  logger.child.mockReturnValue(logger)
  return logger as unknown as Logger
}

describe('Gateway.listen', () => {
  beforeEach(() => {
    mockListen.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('binds with reusePort disabled — the srvx default would swallow ENOTSUP on macOS', async () => {
    mockListen.mockImplementation((_opts, cb) => {
      cb(nodeHandle(true))
    })
    const log = testLogger()
    const gateway = new Gateway(log)

    await gateway.listen(4242)

    expect(mockListen).toHaveBeenCalledWith({ port: 4242, reusePort: false }, expect.any(Function))
    expect(gateway.port).toBe(4242)
    expect(log.info).toHaveBeenCalledWith('Listening on port: 4242')
  })

  it('throws when the listen callback returns a handle that is not listening', async () => {
    mockListen.mockImplementation((_opts, cb) => {
      cb(nodeHandle(false))
    })
    const log = testLogger()
    const gateway = new Gateway(log)

    await expect(gateway.listen(3000)).rejects.toMatchObject({
      body: { code: 'GatewayBindFailed', message: 'Could not bind port 3000' },
    })
    expect(log.error).toHaveBeenCalledWith('Could not bind port 3000 — the server did not come up')
    expect(gateway.port).toBeNull()
    expect(log.info).not.toHaveBeenCalledWith(expect.stringContaining('Listening'))
  })

  it('throws when no handle arrives before the wait window — slow bind must not look like success', async () => {
    vi.useFakeTimers()
    mockListen.mockImplementation(() => {})
    const log = testLogger()
    const gateway = new Gateway(log)

    const pending = gateway.listen(3001)
    const assertion = expect(pending).rejects.toMatchObject({
      body: { code: 'GatewayBindFailed', message: 'Could not bind port 3001' },
    })
    await vi.advanceTimersByTimeAsync(500)
    await assertion
    expect(gateway.port).toBeNull()
  })

  it('throws when srvx reports listening false even though the callback fired', async () => {
    mockListen.mockImplementation((_opts, cb) => {
      cb({ node: { server: { listening: false } } })
    })
    const log = testLogger()
    const gateway = new Gateway(log)

    await expect(gateway.listen(3002)).rejects.toThrow(AppError)
    expect(log.info).not.toHaveBeenCalledWith(expect.stringMatching(/^Listening on port:/))
  })
})
