import { generateMnemonic, type PairingPayload, validateMnemonic } from '@arxhub/crypto'
import type { AppError } from '@arxhub/errors'
import { enableDeviceLock, type KeyStore, MemoryKeyStore } from '@arxhub/plugin-keystore'
import { describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'
import { EntryFlow, type EntryFlowResult, type EntryJoiner, type EntryJoinerFactory, type EntryServer } from '../entry/entry-flow'
import { EntryRecordStore } from '../entry/entry-record'
import type { ServerInspector, ServerStatus } from '../entry/server-check'
import { IDENTITY_MNEMONIC_KEY } from '../identity'
import type { PairingJoinerPhase } from '../pairing/pairing-client'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
}

const FOUND_EMPTY: ServerStatus = { kind: 'found', summary: { empty: true } }

function setup(options: { store?: KeyStore; locked?: boolean; server?: EntryServer; inspect?: ServerInspector } = {}) {
  const records = new EntryRecordStore(memoryStorage())
  const results: EntryFlowResult[] = []
  const inspect = vi.fn<ServerInspector>(options.inspect ?? (() => Promise.resolve(FOUND_EMPTY)))
  const flow = new EntryFlow({
    records,
    store: options.store ?? new MemoryKeyStore(),
    locked: options.locked ?? false,
    server: options.server ?? 'ask',
    inspect,
    // Deterministic draws, so the questions are the same on every run.
    random: (() => {
      let seed = 7
      return () => {
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
      }
    })(),
    onDone: (result) => results.push(result),
  })
  return { flow, records, results, inspect }
}

// The store a code step would hand over. A plain memory store stands in for the locked view where a
// test is about the order of screens rather than what lands at rest.
async function throughCode(flow: EntryFlow, store: KeyStore = new MemoryKeyStore()) {
  await flow.chooseNew()
  expect(flow.step.value).toBe('create-code')
  await flow.codeCreated(store)
  return store
}

describe('EntryFlow — a new vault', () => {
  it('asks for the code before a phrase exists, then writes the phrase through the locked view only', async () => {
    const inner = new MemoryKeyStore()
    const { flow, records } = setup({ store: inner })

    await flow.chooseNew()
    expect(flow.step.value).toBe('create-code')
    expect(await inner.list()).toEqual([])

    const locked = await enableDeviceLock(inner, '123456')
    await flow.codeCreated(locked)

    expect(flow.step.value).toBe('phrase')
    const mnemonic = await locked.get(IDENTITY_MNEMONIC_KEY)
    expect(validateMnemonic(mnemonic ?? '')).toBe(true)
    expect(flow.words.value.join(' ')).toBe(mnemonic)
    // At rest the entry is ciphertext: the phrase is never in the clear on this device.
    const atRest = await inner.get(IDENTITY_MNEMONIC_KEY)
    expect(atRest).not.toBeNull()
    expect(atRest).not.toContain(flow.words.value[0])
    expect(records.read()).toEqual({ v: 1, kind: 'new', step: 'phrase' })
  }, 30_000)

  it('keeps "I\'ve written it down" shut until the words were shown', async () => {
    const { flow, records } = setup()
    await throughCode(flow)

    flow.writtenDown()
    expect(flow.step.value).toBe('phrase')

    flow.reveal()
    flow.writtenDown()
    expect(flow.step.value).toBe('check')
    expect(records.read()).toEqual({ v: 1, kind: 'new', step: 'check' })
  })

  it('checks three words and moves on only once all three are right', async () => {
    const { flow, records } = setup()
    await throughCode(flow)
    flow.reveal()
    flow.writtenDown()

    const questions = flow.questions.value
    expect(questions).toHaveLength(3)
    for (const question of questions) {
      expect(question.answer).toBe(flow.words.value[question.position - 1])
      expect(question.options).toContain(question.answer)
    }

    const [first, second, third] = questions
    const wrong = first.options.find((word) => word !== first.answer) as string
    flow.pick(first.position, wrong)
    expect(flow.wrongAt(first.position)).toBe(true)
    expect(flow.wrongAt(second.position)).toBe(false)
    flow.checkNext()
    expect(flow.step.value).toBe('check')

    flow.pick(first.position, first.answer)
    flow.pick(second.position, second.answer)
    flow.checkNext()
    expect(flow.step.value).toBe('check')

    flow.pick(third.position, third.answer)
    expect(flow.checkPassed.value).toBe(true)
    flow.checkNext()
    expect(flow.step.value).toBe('server')
    expect(records.read()).toEqual({ v: 1, kind: 'new', step: 'server' })
  })

  it('lets the check be skipped', async () => {
    const { flow } = setup()
    await throughCode(flow)
    flow.reveal()
    flow.writtenDown()

    flow.skipCheck()

    expect(flow.step.value).toBe('server')
  })

  it('finishes without a server, forgetting the record', async () => {
    const { flow, records, results } = setup()
    const store = await throughCode(flow)
    flow.reveal()
    flow.writtenDown()
    flow.skipCheck()

    flow.finish(false)

    expect(records.read()).toBeNull()
    expect(results).toEqual([{ store, entry: null }])
    // The phrase does not outlive the screens that needed it.
    expect(flow.words.value).toEqual([])
  })

  it('offers no device-only vault when the page is served by the server it would keep it on', async () => {
    const { flow, results } = setup({ server: { fixed: 'https://mine.example.org' } })
    await throughCode(flow)
    flow.reveal()
    flow.writtenDown()
    flow.skipCheck()
    flow.finish(false)
    expect(results).toHaveLength(0)
  })

  it('finishes with a server only once it answered, leaving its address for sync', async () => {
    const { flow, records, results, inspect } = setup()
    await throughCode(flow)
    flow.reveal()
    flow.writtenDown()
    flow.skipCheck()

    flow.setAddress(' hub.example.com/ ')
    flow.finish(true)
    expect(results).toHaveLength(0)

    await flow.checkServer()
    expect(inspect).toHaveBeenCalledWith('https://hub.example.com', flow.words.value.join(' '))
    expect(flow.serverStatus.value).toEqual(FOUND_EMPTY)

    flow.finish(true)
    expect(records.read()).toEqual({ v: 1, kind: 'connect', serverUrl: 'https://hub.example.com' })
    expect(results[0]?.entry).toEqual({ v: 1, kind: 'connect', serverUrl: 'https://hub.example.com' })
  })

  it('refuses an address that is not an origin without asking anything', async () => {
    const { flow, inspect } = setup()
    await throughCode(flow)
    flow.skipCheck()

    flow.setAddress('https://hub.example.com/some/path')
    await flow.checkServer()

    expect(flow.serverStatus.value).toEqual({ kind: 'invalid' })
    expect(inspect).not.toHaveBeenCalled()
  })

  it('does not show an answer against an address that changed while it was on its way', async () => {
    let answer: (status: ServerStatus) => void = () => {}
    const { flow } = setup({ inspect: () => new Promise((resolve) => (answer = resolve)) })
    await throughCode(flow)
    flow.skipCheck()

    flow.setAddress('https://one.example.com')
    const check = flow.checkServer()
    flow.setAddress('https://two.example.com')
    answer(FOUND_EMPTY)
    await check

    expect(flow.serverStatus.value).toEqual({ kind: 'idle' })
  })

  it('reads a failed check as a server that did not respond', async () => {
    const { flow } = setup({ inspect: () => Promise.reject(new Error('offline')) })
    await throughCode(flow)
    flow.skipCheck()
    flow.setAddress('https://hub.example.com')

    await flow.checkServer()

    expect(flow.serverStatus.value).toEqual({ kind: 'unreachable' })
  })

  it('checks a fixed server on arrival, and does not let it be edited', async () => {
    const { flow, inspect } = setup({ server: { fixed: 'https://vault.example.org' } })
    await throughCode(flow)
    flow.skipCheck()
    await vi.waitFor(() => expect(flow.serverStatus.value).toEqual(FOUND_EMPTY))

    expect(inspect).toHaveBeenCalledWith('https://vault.example.org', expect.any(String))
    flow.setAddress('https://elsewhere.example.org')
    expect(flow.address.value).toBe('https://vault.example.org')
  })

  it('goes back to the chooser from the phrase, and choosing again shows the same words', async () => {
    const { flow } = setup()
    const store = await throughCode(flow)
    const words = flow.words.value

    flow.back()
    expect(flow.step.value).toBe('welcome')
    // The code exists by now, so the code step is not asked for again.
    await flow.chooseNew()

    expect(flow.step.value).toBe('phrase')
    expect(flow.words.value).toEqual(words)
    expect(await store.get(IDENTITY_MNEMONIC_KEY)).toBe(words.join(' '))
  })

  it('steps back from the check to the phrase, recording where it is', async () => {
    const { flow, records } = setup()
    await throughCode(flow)
    flow.reveal()
    flow.writtenDown()

    flow.back()

    expect(flow.step.value).toBe('phrase')
    expect(flow.revealed.value).toBe(false)
    expect(records.read()).toEqual({ v: 1, kind: 'new', step: 'phrase' })
  })

  it('skips the code step on a device that already has one', async () => {
    const store = new MemoryKeyStore()
    const { flow } = setup({ store, locked: true })

    await flow.chooseNew()

    expect(flow.step.value).toBe('phrase')
    expect(validateMnemonic((await store.get(IDENTITY_MNEMONIC_KEY)) ?? '')).toBe(true)
  })

  it.each(['phrase', 'check', 'server'] as const)('resumes at %s with the phrase already in the store', async (step) => {
    const store = new MemoryKeyStore()
    const first = setup({ store, locked: true })
    await first.flow.chooseNew()
    const words = first.flow.words.value

    const { flow, inspect } = setup({ store, locked: true })
    await flow.resume(step)

    expect(flow.step.value).toBe(step)
    expect(flow.words.value).toEqual(words)
    if (step === 'check') expect(flow.questions.value).toHaveLength(3)
    if (step === 'server') expect(inspect).not.toHaveBeenCalled()
  })
})

// --- Joining -------------------------------------------------------------------------------------

const FOUND_VAULT: ServerStatus = { kind: 'found', summary: { empty: false, documents: 3, bytes: 1024 } }
const INVITE_ID = 'AAAAAAAAAAAAAAAAAAAAAA'

function fakeJoiner() {
  let resolve: (payload: PairingPayload) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const joiner: EntryJoiner = {
    phase: ref<PairingJoinerPhase>('claiming'),
    sas: ref<string | null>(null),
    matched: ref(false),
    error: shallowRef<AppError | null>(null),
    start: () =>
      new Promise<PairingPayload>((res, rej) => {
        resolve = res
        reject = rej
      }),
    confirm: vi.fn(() => {
      joiner.matched.value = true
    }),
    reject: vi.fn(async () => {
      joiner.phase.value = 'failed'
    }),
    cancel: vi.fn(async () => {}),
  }
  return { joiner, deliver: (payload: PairingPayload) => resolve(payload), fail: (error: unknown) => reject(error) }
}

function joinSetup(options: { server?: EntryServer; locked?: boolean; store?: KeyStore; camera?: 'native' | 'page' | null } = {}) {
  const records = new EntryRecordStore(memoryStorage())
  const results: EntryFlowResult[] = []
  const fake = fakeJoiner()
  const factory = vi.fn<EntryJoinerFactory>(() => fake.joiner)
  const flow = new EntryFlow({
    records,
    store: options.store ?? new MemoryKeyStore(),
    locked: options.locked ?? false,
    server: options.server ?? 'ask',
    inspect: vi.fn<ServerInspector>(() => Promise.resolve(FOUND_VAULT)),
    joiner: factory,
    camera: options.camera === undefined ? 'page' : options.camera,
    deviceName: 'Android phone',
    now: () => new Date('2026-09-26T12:00:00.000Z'),
    onDone: (result) => results.push(result),
  })
  return { flow, records, results, fake, factory }
}

describe('EntryFlow — joining by the phrase', () => {
  const phrase = generateMnemonic()

  it('goes method → phrase → server → code, and only writes once the code has locked the store', async () => {
    const inner = new MemoryKeyStore()
    const { flow, records, results } = joinSetup({ store: inner })
    flow.chooseJoin()
    expect(flow.step.value).toBe('join-method')
    flow.joinByPhrase()
    flow.pastePhrase(phrase)
    expect(flow.phraseCheck.value.valid).toBe(true)
    flow.phraseNext()
    expect(flow.step.value).toBe('join-server')

    flow.setAddress('hub.example.com')
    await flow.checkServer()
    flow.serverNext()
    expect(flow.step.value).toBe('create-code')
    // Nothing is at rest yet: the phrase lives in memory until the code step.
    expect(await inner.get(IDENTITY_MNEMONIC_KEY)).toBeNull()
    expect(records.read()).toBeNull()

    const locked = await enableDeviceLock(inner, '123456')
    await flow.codeCreated(locked)

    expect(await locked.get(IDENTITY_MNEMONIC_KEY)).toBe(phrase)
    // What lands at rest is ciphertext.
    expect(await inner.get(IDENTITY_MNEMONIC_KEY)).not.toBe(phrase)
    const entry = { v: 1, kind: 'join', serverUrl: 'https://hub.example.com', since: '2026-09-26T12:00:00.000Z' }
    expect(records.read()).toEqual(entry)
    expect(results).toEqual([{ store: locked, entry }])
  })

  it('does not lead on from a phrase that does not add up, or a server with nothing for it', async () => {
    const { flow } = joinSetup()
    flow.chooseJoin()
    flow.joinByPhrase()
    const words = phrase.split(' ')
    flow.pastePhrase([...words.slice(1), words[0]].join(' '))
    flow.phraseNext()
    expect(flow.step.value).toBe('join-phrase')

    flow.pastePhrase(phrase)
    flow.phraseNext()
    flow.serverStatus.value = { kind: 'found', summary: { empty: true } }
    flow.address.value = 'https://hub.example.com'
    flow.serverNext()
    expect(flow.step.value).toBe('join-server')
  })

  it('checks the server with the phrase being joined', async () => {
    const records = new EntryRecordStore(memoryStorage())
    const inspect = vi.fn<ServerInspector>(() => Promise.resolve(FOUND_VAULT))
    const flow = new EntryFlow({
      records,
      store: new MemoryKeyStore(),
      locked: false,
      server: { fixed: 'https://hub.example.com' },
      inspect,
      onDone: () => {},
    })
    flow.chooseJoin()
    flow.joinByPhrase()
    flow.pastePhrase(phrase)
    flow.phraseNext()
    // A fixed server is checked as the screen opens.
    await vi.waitFor(() => expect(flow.serverStatus.value.kind).toBe('found'))
    expect(inspect).toHaveBeenCalledWith('https://hub.example.com', phrase)
  })

  it('skips the code on a device whose code already exists', async () => {
    const store = new MemoryKeyStore()
    const { flow, results } = joinSetup({ store, locked: true })
    flow.chooseJoin()
    flow.joinByPhrase()
    flow.pastePhrase(phrase)
    flow.phraseNext()
    flow.setAddress('https://hub.example.com')
    await flow.checkServer()
    flow.serverNext()
    await vi.waitFor(() => expect(results).toHaveLength(1))
    expect(await store.get(IDENTITY_MNEMONIC_KEY)).toBe(phrase)
  })

  it('steps back through its screens to the chooser', () => {
    const { flow } = joinSetup()
    flow.chooseJoin()
    flow.joinByPhrase()
    flow.back()
    expect(flow.step.value).toBe('join-method')
    flow.back()
    expect(flow.step.value).toBe('welcome')
    expect(flow.mode.value).toBe('new')
  })
})

describe('EntryFlow — joining by invitation', () => {
  const phrase = generateMnemonic()
  const qr = `arxhub://pair?v=1&server=${encodeURIComponent('https://hub.example.com')}&id=${INVITE_ID}`

  it('a scanned invitation is followed to the key, then the code, and the server comes from the invitation', async () => {
    const { flow, fake, factory, records, results } = joinSetup()
    flow.chooseJoin()
    flow.joinByInvitation()
    expect(flow.step.value).toBe('join-scan')
    flow.scanned(qr)
    expect(factory).toHaveBeenCalledWith({ server: 'https://hub.example.com', ref: INVITE_ID, deviceName: 'Android phone' })
    expect(flow.step.value).toBe('join-compare')

    fake.deliver({ v: 1, mnemonic: phrase, serverUrl: 'https://hub.example.com' })
    await vi.waitFor(() => expect(flow.step.value).toBe('join-received'))
    await flow.receivedNext()
    expect(flow.step.value).toBe('create-code')
    await flow.codeCreated(new MemoryKeyStore())

    expect(records.read()).toMatchObject({ kind: 'join', serverUrl: 'https://hub.example.com' })
    expect(results).toHaveLength(1)
  })

  it('refuses a QR that is not an invitation, and one for another server than the page is served by', () => {
    const { flow, factory } = joinSetup({ server: { fixed: 'https://mine.example.org' } })
    flow.chooseJoin()
    flow.joinByInvitation()
    flow.scanned('https://example.com/menu')
    expect(flow.scanError.value).toMatch(/isn't an ArxHub invitation/)
    flow.scanned(qr)
    expect(flow.scanError.value).toBe('This invitation is for https://hub.example.com — open ArxHub from that address.')
    expect(factory).not.toHaveBeenCalled()
    expect(flow.step.value).toBe('join-scan')
  })

  it('without a camera, goes straight to the typed code and checks both fields', () => {
    const { flow, factory } = joinSetup({ camera: null })
    flow.chooseJoin()
    flow.joinByInvitation()
    expect(flow.step.value).toBe('join-code')

    flow.setInviteServer('not a url with spaces')
    flow.setInviteCode('7K4Q-2MXD')
    flow.inviteNext()
    expect(flow.inviteError.value).toMatch(/isn't a server address/)

    flow.setInviteServer('hub.example.com')
    flow.setInviteCode('7K4Q-2M')
    flow.inviteNext()
    expect(flow.inviteError.value).toMatch(/8 letters and digits/)

    flow.setInviteCode('7k4q 2mxd')
    flow.inviteNext()
    expect(factory).toHaveBeenCalledWith({ server: 'https://hub.example.com', ref: '7K4Q2MXD', deviceName: 'Android phone' })
  })

  it('a fixed server fills the typed code screen with the page origin', () => {
    const { flow } = joinSetup({ camera: null, server: { fixed: 'https://mine.example.org' } })
    flow.chooseJoin()
    flow.joinByInvitation()
    expect(flow.inviteServer.value).toBe('https://mine.example.org')
  })

  it('cancelling the comparison ends the invitation and goes back to the method', async () => {
    const { flow, fake } = joinSetup()
    flow.chooseJoin()
    flow.joinByInvitation()
    flow.scanned(qr)
    await flow.cancelJoin()
    expect(fake.joiner.cancel).toHaveBeenCalledOnce()
    expect(flow.step.value).toBe('join-method')
    // A payload that still arrives after the cancel is not taken.
    fake.deliver({ v: 1, mnemonic: phrase, serverUrl: 'https://hub.example.com' })
    await Promise.resolve()
    expect(flow.step.value).toBe('join-method')
  })

  it("passes the owner's answer on the new device to the joiner, and only while comparing", async () => {
    const { flow, fake } = joinSetup()
    flow.chooseJoin()
    flow.joinByInvitation()
    flow.scanned(qr)
    flow.joinMatch()
    expect(fake.joiner.confirm).not.toHaveBeenCalled()
    fake.joiner.phase.value = 'compare'
    flow.joinMatch()
    expect(fake.joiner.confirm).toHaveBeenCalledOnce()
    await flow.joinMismatch()
    expect(fake.joiner.reject).toHaveBeenCalledOnce()
    expect(flow.step.value).toBe('join-compare')
  })

  it('a failed handover stays on the comparison, where the joiner says why', async () => {
    const { flow, fake } = joinSetup()
    flow.chooseJoin()
    flow.joinByInvitation()
    flow.scanned(qr)
    fake.fail(new Error('expired'))
    await Promise.resolve()
    expect(flow.step.value).toBe('join-compare')
  })

  it('offers no invitation road without a relay client', () => {
    const records = new EntryRecordStore(memoryStorage())
    const flow = new EntryFlow({
      records,
      store: new MemoryKeyStore(),
      locked: false,
      server: 'ask',
      inspect: vi.fn(),
      camera: 'native',
      onDone: () => {},
    })
    expect(flow.canPair).toBe(false)
    expect(flow.camera).toBeNull()
  })
})
