import {
  CodeBackoff,
  changeUnlockCode,
  disableDeviceLock,
  enableDeviceLock,
  getCodeShape,
  isDeviceLocked,
  type KeyStore,
  MemoryKeyStore,
  unlockDeviceKeyStore,
  verifyUnlockCode,
} from '@arxhub/plugin-keystore'
import { describe, expect, it, vi } from 'vitest'
import { t } from '../i18n/messages'
import { IDENTITY_MNEMONIC_KEY } from '../identity'
import { formatCountdown, pairScreen, SecurityTask, type SecurityTaskDeps, type SecurityTaskKind } from '../security/security-task'

const PHRASE = 'orbit velvet canyon mercy lunar harbor thrive pencil glacier noble sketch amber'
const CODE = '314159'
const OTHER = '271828'

// A real lock over an in-memory store: the task is only as honest as the operations it calls, so the
// tests drive the same verifier the unlock gate does.
async function lockedStore(code = CODE): Promise<KeyStore> {
  const inner = new MemoryKeyStore()
  const locked = await enableDeviceLock(inner, code)
  await locked.set(IDENTITY_MNEMONIC_KEY, PHRASE)
  return inner
}

async function realDeps(inner: KeyStore): Promise<SecurityTaskDeps> {
  const locked = await isDeviceLocked(inner)
  return {
    locked,
    codeShape: await getCodeShape(inner),
    backoff: new CodeBackoff(),
    verify: (code) => verifyUnlockCode(inner, code),
    readPhrase: async () => (locked ? PHRASE : inner.get(IDENTITY_MNEMONIC_KEY)),
    changeCode: async (current, next) => void (await changeUnlockCode(inner, current, next)),
    enableLock: async (code) => void (await enableDeviceLock(inner, code)),
    disableLock: async (current) => void (await disableDeviceLock(inner, current)),
  }
}

function fakeDeps(overrides: Partial<SecurityTaskDeps> = {}): SecurityTaskDeps {
  return {
    locked: true,
    codeShape: 'digits-6',
    backoff: new CodeBackoff(),
    verify: vi.fn(async (code: string) => code === CODE),
    readPhrase: vi.fn(async () => PHRASE),
    changeCode: vi.fn(async () => {}),
    enableLock: vi.fn(async () => {}),
    disableLock: vi.fn(async () => {}),
    ...overrides,
  }
}

async function enter(task: SecurityTask, code: string) {
  task.input(code)
  return task.submit()
}

describe('SecurityTask — asking for the code again', () => {
  it.each<SecurityTaskKind>(['phrase', 'pair', 'change-code', 'remove-lock'])('starts %s at the code on a locked device', (kind) => {
    const task = new SecurityTask(kind, fakeDeps())
    expect(task.step.value).toBe('reentry')
    expect(task.codeLength).toBe(6)
  })

  it('asks every time: a second task starts at the code again', async () => {
    const deps = fakeDeps()
    const first = new SecurityTask('phrase', deps)
    await enter(first, CODE)
    expect(first.step.value).toBe('phrase')
    first.dispose()
    expect(new SecurityTask('phrase', deps).step.value).toBe('reentry')
  })

  it('refuses a wrong code out loud, clears the entry and reads nothing', async () => {
    const deps = fakeDeps()
    const task = new SecurityTask('phrase', deps)
    await enter(task, '000000')
    expect(task.step.value).toBe('reentry')
    expect(task.error.value).toBe(t('task.wrongCode'))
    expect(task.code.value).toBe('')
    expect(task.refusals.value).toBe(1)
    expect(task.phrase.value).toBeNull()
    expect(deps.readPhrase).not.toHaveBeenCalled()

    task.input('3')
    expect(task.error.value).toBeNull()
  })

  it('shows the phrase only after the right code, and drops it when hidden or disposed', async () => {
    const task = new SecurityTask('phrase', fakeDeps())
    await enter(task, CODE)
    expect(task.step.value).toBe('phrase')
    expect(task.words).toHaveLength(12)
    task.hidePhrase()
    expect(task.phrase.value).toBeNull()
    expect(task.words).toEqual([])
  })

  it('hands the phrase to the pairing step', async () => {
    const task = new SecurityTask('pair', fakeDeps())
    await enter(task, CODE)
    expect(task.step.value).toBe('pair')
    expect(task.phrase.value).toBe(PHRASE)
    task.dispose()
    expect(task.phrase.value).toBeNull()
  })

  it('stays put and says so when there is no phrase to show', async () => {
    const task = new SecurityTask('phrase', fakeDeps({ readPhrase: async () => null }))
    await enter(task, CODE)
    expect(task.step.value).toBe('reentry')
    expect(task.error.value).toBe(t('task.noPhrase'))
  })

  it('takes a legacy code at any length, with a confirm key rather than the sixth digit', async () => {
    const task = new SecurityTask('phrase', fakeDeps({ codeShape: 'legacy', verify: async (code) => code === '12345678' }))
    expect(task.codeLength).toBeNull()
    await enter(task, '12345678')
    expect(task.step.value).toBe('phrase')
  })

  it('a device with no lock confirms instead of asking for a code it does not have', async () => {
    const deps = fakeDeps({ locked: false })
    const task = new SecurityTask('pair', deps)
    expect(task.step.value).toBe('confirm')
    await task.confirm()
    expect(task.step.value).toBe('pair')
    expect(deps.verify).not.toHaveBeenCalled()
  })

  it('pauses after three wrong codes and asks nothing of the verifier until the pause is over', async () => {
    let now = 1_000_000
    const backoff = new CodeBackoff({ now: () => now })
    const deps = fakeDeps({ backoff })
    const task = new SecurityTask('phrase', deps)
    for (let i = 0; i < 3; i++) await enter(task, '000000')
    expect(task.paused.value).toBe(true)
    expect(task.shownError.value).toBe('Wrong code — try again in 1s')

    await enter(task, CODE)
    expect(deps.verify).toHaveBeenCalledTimes(3)
    expect(task.step.value).toBe('reentry')

    now += 1000
    backoff.tick()
    expect(task.paused.value).toBe(false)
    await enter(task, CODE)
    expect(task.step.value).toBe('phrase')
    expect(backoff.failures.value).toBe(0)
  })

  it('keeps counting across tasks, so reopening one does not start the count again', async () => {
    const backoff = new CodeBackoff()
    const deps = fakeDeps({ backoff })
    const first = new SecurityTask('phrase', deps)
    for (let i = 0; i < 2; i++) await enter(first, '000000')
    first.dispose()
    const second = new SecurityTask('pair', deps)
    await enter(second, '000000')
    expect(second.paused.value).toBe(true)
    backoff.succeed()
  })

  it('ignores a submit while the code is being checked', async () => {
    let release: (ok: boolean) => void = () => {}
    const verify = vi.fn(() => new Promise<boolean>((resolve) => (release = resolve)))
    const task = new SecurityTask('phrase', fakeDeps({ verify }))
    task.input(CODE)
    const first = task.submit()
    expect(task.busy.value).toBe(true)
    await task.submit()
    release(true)
    await first
    expect(verify).toHaveBeenCalledTimes(1)
    expect(task.step.value).toBe('phrase')
  })
})

describe('SecurityTask — changing the code', () => {
  it('goes current → new → repeat, each on six digits, then applies', async () => {
    const deps = fakeDeps()
    const task = new SecurityTask('change-code', deps)
    await enter(task, CODE)
    expect(task.step.value).toBe('new-code')
    expect(task.codeLength).toBe(6)
    await enter(task, OTHER)
    expect(task.step.value).toBe('repeat-code')
    expect(await enter(task, OTHER)).toBe('applied')
    expect(deps.changeCode).toHaveBeenCalledWith(CODE, OTHER)
  })

  it('a new code that is not six digits goes nowhere', async () => {
    const task = new SecurityTask('change-code', fakeDeps())
    await enter(task, CODE)
    await enter(task, '12345')
    expect(task.step.value).toBe('new-code')
    await enter(task, '1234567')
    expect(task.step.value).toBe('new-code')
  })

  it('a repeat that differs starts the new code over and says why', async () => {
    const deps = fakeDeps()
    const task = new SecurityTask('change-code', deps)
    await enter(task, CODE)
    await enter(task, OTHER)
    await enter(task, '111111')
    expect(task.step.value).toBe('new-code')
    expect(task.error.value).toBe(t('task.codesDiffer'))
    expect(deps.changeCode).not.toHaveBeenCalled()
  })

  it('"Different code" goes back from the repeat without an error', async () => {
    const task = new SecurityTask('change-code', fakeDeps())
    await enter(task, CODE)
    await enter(task, OTHER)
    task.differentCode()
    expect(task.step.value).toBe('new-code')
    expect(task.error.value).toBeNull()
  })

  it('a failed write goes back to the repeat and rethrows', async () => {
    const task = new SecurityTask('change-code', fakeDeps({ changeCode: async () => Promise.reject(new Error('disk')) }))
    await enter(task, CODE)
    await enter(task, OTHER)
    await expect(enter(task, OTHER)).rejects.toThrow('disk')
    expect(task.step.value).toBe('repeat-code')
    expect(task.busy.value).toBe(false)
  })

  it('changes a real lock: the old code stops working and the new one opens the store', async () => {
    const inner = await lockedStore()
    const task = new SecurityTask('change-code', await realDeps(inner))
    await enter(task, CODE)
    await enter(task, OTHER)
    expect(await enter(task, OTHER)).toBe('applied')
    expect(await verifyUnlockCode(inner, CODE)).toBe(false)
    const opened = await unlockDeviceKeyStore(inner, OTHER)
    expect(await opened.get(IDENTITY_MNEMONIC_KEY)).toBe(PHRASE)
    expect(await getCodeShape(inner)).toBe('digits-6')
  })

  it('moves a legacy lock onto the six-digit rule: free-length current, six-digit new', async () => {
    const inner = await lockedStore()
    // A lock set before the rule carries no shape marker.
    await inner.delete('__vault_code_shape__')
    expect(await getCodeShape(inner)).toBe('legacy')

    const task = new SecurityTask('change-code', await realDeps(inner))
    expect(task.codeLength).toBeNull()
    await enter(task, CODE)
    expect(task.codeLength).toBe(6)
    await enter(task, OTHER)
    await enter(task, OTHER)
    expect(await getCodeShape(inner)).toBe('digits-6')
  })
})

describe('SecurityTask — the lock itself', () => {
  it('locks an unlocked device with a new code and its repeat', async () => {
    const inner = new MemoryKeyStore()
    await inner.set(IDENTITY_MNEMONIC_KEY, PHRASE)
    const task = new SecurityTask('lock', await realDeps(inner))
    expect(task.step.value).toBe('new-code')
    await enter(task, CODE)
    expect(await enter(task, CODE)).toBe('applied')
    expect(await isDeviceLocked(inner)).toBe(true)
    expect(await inner.get(IDENTITY_MNEMONIC_KEY)).not.toBe(PHRASE)
  })

  it('removes the lock only after the current code', async () => {
    const inner = await lockedStore()
    const task = new SecurityTask('remove-lock', await realDeps(inner))
    await enter(task, OTHER)
    expect(await isDeviceLocked(inner)).toBe(true)
    expect(await enter(task, CODE)).toBe('applied')
    expect(await isDeviceLocked(inner)).toBe(false)
    expect(await inner.get(IDENTITY_MNEMONIC_KEY)).toBe(PHRASE)
  })
})

describe('formatCountdown', () => {
  it.each([
    [300, '5:00'],
    [292, '4:52'],
    [9, '0:09'],
    [0, '0:00'],
    [-3, '0:00'],
    [59.9, '0:59'],
  ])('%s seconds read %s', (seconds, text) => {
    expect(formatCountdown(seconds)).toBe(text)
  })
})

describe('pairScreen', () => {
  it.each([
    ['idle', 'preparing'],
    ['creating', 'preparing'],
    ['waiting', 'invite'],
    ['connecting', 'invite'],
    ['compare', 'compare'],
    ['sending', 'compare'],
    ['done', 'done'],
    ['expired', 'expired'],
    ['cancelled', 'failed'],
    ['failed', 'failed'],
  ] as const)('%s draws %s', (phase, screen) => {
    expect(pairScreen(phase)).toBe(screen)
  })
})
