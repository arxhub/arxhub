import { normalizeInvitationCode, type PairingPayload, parseInvitationQr } from '@arxhub/crypto'
import type { AppError } from '@arxhub/errors'
import type { KeyStore } from '@arxhub/plugin-keystore'
import { computed, type Ref, ref, type ShallowRef, shallowRef } from 'vue'
import { createIdentity, hasIdentity, IDENTITY_MNEMONIC_KEY, storeIdentity } from '../identity'
import type { PairingJoinerOptions, PairingJoinerPhase } from '../pairing/pairing-client'
import type { QrScanPort } from '../pairing-extension'
import type { EntryRecord, EntryRecordStore, NewVaultStep } from './entry-record'
import { type PhraseQuestion, phraseQuestions, type Random } from './phrase-check'
import { PHRASE_WORDS, pasteInto, phraseState, phraseSuggestions } from './phrase-input'
import { normalizeServerAddress, type ServerInspector, type ServerStatus } from './server-check'

// Where the vault's server comes from. A browser bundle is served BY its server, so the address is the
// page's own origin and is only checked; the native app has no such origin and asks.
export type EntryServer = 'ask' | { fixed: string }

// Joining an existing vault: by its phrase (method → phrase → server), or by an invitation from a
// device that is already in it (method → scan or code → compare → received). Both end at the code
// step and then at sync's download screen, the fourth step.
export type JoinStep = 'join-method' | 'join-phrase' | 'join-server' | 'join-scan' | 'join-code' | 'join-compare' | 'join-received'

export type EntryStep = 'welcome' | 'create-code' | NewVaultStep | JoinStep

export type EntryMode = 'new' | 'join'

// Where an invitation's QR can be read on this device: the native scanner the app brings, the camera
// inside the page, or nowhere — then only the typed code is offered.
export type EntryCamera = 'native' | 'page' | null

// The step's place in "Step N of 4". The chooser, and the two screens of the handover itself (the
// digits, the key arriving), have none: they are a conversation with the other device, not a step.
export function entryStepNumber(step: EntryStep, mode: EntryMode): number | null {
  switch (step) {
    case 'create-code':
      return mode === 'join' ? 3 : 1
    case 'phrase':
      return 2
    case 'check':
      return 3
    case 'server':
      return 4
    case 'join-method':
    case 'join-phrase':
    case 'join-scan':
    case 'join-code':
      return 1
    case 'join-server':
      return 2
    default:
      return null
  }
}

// The joining half of pairing, as the flow drives it. PairingJoiner in the app; a fake in tests.
export interface EntryJoiner {
  readonly phase: Ref<PairingJoinerPhase>
  readonly sas: Ref<string | null>
  readonly matched: Ref<boolean>
  readonly error: ShallowRef<AppError | null>
  start(): Promise<PairingPayload>
  confirm(): void
  reject(): Promise<void>
  cancel(): Promise<void>
}

export type EntryJoinerFactory = (options: PairingJoinerOptions) => EntryJoiner

export interface EntryFlowResult {
  // The store to boot on — always the locked view: the first run sets the code before the phrase exists.
  store: KeyStore
  entry: EntryRecord | null
}

export interface EntryFlowOptions {
  records: EntryRecordStore
  // The store as it stands now: the plain, empty one on a first run, or the unlocked view when the code
  // already exists (a first run cut short between the code and the phrase, or a resumed one).
  store: KeyStore
  // Whether `store` is already the locked view, so the code step is skipped.
  locked: boolean
  server: EntryServer
  inspect: ServerInspector
  random?: Random
  // The join by invitation. Without a factory (a build with no relay to talk to) only the phrase is offered.
  joiner?: EntryJoinerFactory
  camera?: EntryCamera
  scanner?: QrScanPort
  // How this device introduces itself to the first one.
  deviceName?: string
  // The record's timestamp, injectable so a test can read the record back exactly.
  now?: () => Date
  onDone: (result: EntryFlowResult) => void
}

// The first run as a state machine with no DOM: which screen is up, what it may do next, and what is
// written where on the way. The screens only render it and call it.
//
// The order of writes is the point. The code is set before the phrase exists, and the phrase is written
// through the locked view, so a secret is never at rest in the clear on this device — not even for the
// seconds between two screens. The entry record is written after each step lands, so a restart resumes
// at the screen the person had not finished rather than skipping past it.
export class EntryFlow {
  readonly step: Ref<EntryStep> = ref('welcome')
  readonly busy = ref(false)
  readonly error = ref<string | null>(null)

  // The phrase is held here while its screens need it, and dropped when the flow ends.
  readonly words = shallowRef<readonly string[]>([])
  readonly revealed = ref(false)

  readonly questions = shallowRef<PhraseQuestion[]>([])
  readonly picks = ref<Record<number, string>>({})
  readonly checkPassed = computed(
    () => this.questions.value.length > 0 && this.questions.value.every((q) => this.picks.value[q.position] === q.answer),
  )

  readonly address = ref('')
  readonly serverStatus = shallowRef<ServerStatus>({ kind: 'idle' })
  readonly serverFixed: boolean

  readonly mode = ref<EntryMode>('new')
  readonly camera: EntryCamera
  readonly canPair: boolean

  // The phrase typed on a joining device, one field per word.
  readonly phraseWords = ref<string[]>(Array<string>(PHRASE_WORDS).fill(''))
  readonly phraseFocus = ref<number | null>(0)
  readonly phraseCheck = computed(() => phraseState(this.phraseWords.value, this.phraseFocus.value))
  readonly suggestions = computed(() => {
    const focus = this.phraseFocus.value
    return focus == null ? [] : phraseSuggestions(this.phraseWords.value[focus] ?? '')
  })

  // The invitation, typed on a device without a camera.
  readonly inviteServer = ref('')
  readonly inviteCode = ref('')
  readonly inviteError = ref<string | null>(null)
  readonly scanError = ref<string | null>(null)
  readonly scanning = ref(false)
  readonly joiner = shallowRef<EntryJoiner | null>(null)

  private store: KeyStore
  private locked: boolean
  private readonly options: EntryFlowOptions
  // Bumped by every check and every edit of the address, so an answer that arrives after the address
  // changed is not shown against the new one.
  private checkGeneration = 0
  private done = false
  // A joining device's phrase and server, in memory only until the code step has locked the store they
  // are written through. Closing the app before then costs the person the phrase or the scan again,
  // never a secret at rest in the clear.
  private joinMnemonic: string | null = null
  private joinServer: string | null = null
  private joinedByInvitation = false
  private scanRun: AbortController | null = null

  constructor(options: EntryFlowOptions) {
    this.options = options
    this.store = options.store
    this.locked = options.locked
    this.serverFixed = options.server !== 'ask'
    this.canPair = options.joiner != null
    this.camera = this.canPair ? (options.camera ?? null) : null
  }

  // Resume where a restart left a new vault. The phrase is already in the store; only the screens it
  // had not been through are shown again.
  async resume(step: NewVaultStep): Promise<void> {
    await this.run(async () => {
      await this.loadWords()
      if (step === 'phrase') this.showPhrase()
      else if (step === 'check') this.showCheck()
      else this.showServer()
    })
  }

  // "Create a new vault".
  async chooseNew(): Promise<void> {
    if (!this.locked) {
      this.step.value = 'create-code'
      return
    }
    await this.run(() => this.beginPhrase())
  }

  // "Connect to my vault".
  chooseJoin(): void {
    this.error.value = null
    this.mode.value = 'join'
    this.step.value = 'join-method'
  }

  // The code step has locked the store; everything from here is written through that view.
  async codeCreated(store: KeyStore): Promise<void> {
    this.store = store
    this.locked = true
    if (this.mode.value === 'join') await this.run(() => this.completeJoin())
    else await this.run(() => this.beginPhrase())
  }

  back(): void {
    this.error.value = null
    switch (this.step.value) {
      case 'create-code':
        if (this.mode.value === 'join') {
          // The code screen follows the server check or the key arriving; the key stays in memory, so
          // stepping back shows where it came from rather than asking for it again.
          this.step.value = this.joinMnemonic != null && this.joinedByInvitation ? 'join-received' : 'join-server'
          return
        }
        this.step.value = 'welcome'
        return
      // The phrase exists by now and stays: stepping back to the chooser and choosing "new" again shows
      // the same words rather than minting a second vault the person has half written down.
      case 'phrase':
        this.step.value = 'welcome'
        return
      case 'check':
        this.showPhrase()
        return
      case 'join-method':
        this.mode.value = 'new'
        this.step.value = 'welcome'
        return
      case 'join-phrase':
        this.step.value = 'join-method'
        return
      case 'join-server':
        this.step.value = 'join-phrase'
        return
      case 'join-scan':
        this.stopScan()
        this.step.value = 'join-method'
        return
      case 'join-code':
        this.inviteError.value = null
        this.step.value = this.camera != null ? 'join-scan' : 'join-method'
        return
      case 'join-compare':
        void this.cancelJoin()
        return
      default:
        return
    }
  }

  // --- Joining by the phrase ---------------------------------------------------------------------

  joinByPhrase(): void {
    this.step.value = 'join-phrase'
  }

  // What one field now holds. Text with several words in it is a paste, wherever it landed.
  setWord(index: number, text: string): void {
    const { words, focus } = pasteInto(this.phraseWords.value, index, text)
    this.phraseWords.value = words
    if (focus !== index) this.phraseFocus.value = focus
  }

  focusWord(index: number | null): void {
    this.phraseFocus.value = index
  }

  pastePhrase(text: string): void {
    const { words, focus } = pasteInto(this.phraseWords.value, this.phraseFocus.value ?? 0, text)
    this.phraseWords.value = words
    this.phraseFocus.value = focus
  }

  // A tap on a suggestion completes the field being typed in and moves on to the next.
  pickSuggestion(word: string): void {
    const focus = this.phraseFocus.value
    if (focus == null) return
    const words = [...this.phraseWords.value]
    words[focus] = word
    this.phraseWords.value = words
    this.phraseFocus.value = focus < PHRASE_WORDS - 1 ? focus + 1 : null
  }

  phraseNext(): void {
    if (!this.phraseCheck.value.valid) return
    this.joinMnemonic = this.phraseWords.value.join(' ')
    this.joinedByInvitation = false
    this.showJoinServer()
  }

  // "Next" on the join's server step: only a server that holds a vault for this phrase leads on.
  serverNext(): void {
    const status = this.serverStatus.value
    const serverUrl = normalizeServerAddress(this.address.value)
    if (status.kind !== 'found' || status.summary.empty || serverUrl == null) return
    this.joinServer = serverUrl
    void this.toCode()
  }

  // --- Joining by invitation ---------------------------------------------------------------------

  joinByInvitation(): void {
    this.scanError.value = null
    this.inviteError.value = null
    if (this.camera == null) {
      this.showInviteCode()
      return
    }
    this.step.value = 'join-scan'
  }

  enterCodeManually(): void {
    this.stopScan()
    this.showInviteCode()
  }

  // The native scanner takes the whole screen and comes back with the text, or with nothing when the
  // person backed out of it — then the scan screen is left up, with its way to type the code instead.
  async scanNative(): Promise<void> {
    const scanner = this.options.scanner
    if (scanner == null || this.scanning.value) return
    const run = new AbortController()
    this.scanRun = run
    this.scanning.value = true
    this.scanError.value = null
    try {
      const text = await scanner.scan(run.signal)
      if (!run.signal.aborted && text != null) this.scanned(text)
    } catch (error) {
      if (!run.signal.aborted) this.scanError.value = error instanceof Error ? error.message : String(error)
    } finally {
      if (this.scanRun === run) this.scanRun = null
      this.scanning.value = false
    }
  }

  scanUnavailable(reason: string): void {
    this.scanError.value = reason
  }

  // Whatever QR the camera was pointed at. Only an ArxHub invitation is taken, and only one for the
  // server this bundle is served by when there is such a server.
  scanned(text: string): void {
    const invitation = parseInvitationQr(text.trim())
    if (invitation == null) {
      this.scanError.value = "This isn't an ArxHub invitation — scan the QR under Settings → Security → Connect a device"
      return
    }
    const fixed = this.options.server === 'ask' ? null : this.options.server.fixed
    if (fixed != null && normalizeServerAddress(invitation.server) !== normalizeServerAddress(fixed)) {
      this.scanError.value = `This invitation is for ${invitation.server} — open ArxHub from that address.`
      return
    }
    this.startJoiner(invitation.server, invitation.id)
  }

  setInviteServer(text: string): void {
    this.inviteServer.value = text
    this.inviteError.value = null
  }

  setInviteCode(text: string): void {
    this.inviteCode.value = text
    this.inviteError.value = null
  }

  inviteNext(): void {
    const server = normalizeServerAddress(this.inviteServer.value)
    if (server == null) {
      this.inviteError.value = "That isn't a server address — for example https://hub.example.com"
      return
    }
    const code = normalizeInvitationCode(this.inviteCode.value)
    if (code == null) {
      this.inviteError.value = 'An invitation code is 8 letters and digits, as on the first device'
      return
    }
    this.startJoiner(server, code)
  }

  // "Cancel" while the digits are compared: the invitation is ended on the relay too, so the first
  // device learns at once rather than at expiry.
  async cancelJoin(): Promise<void> {
    const joiner = this.joiner.value
    this.joiner.value = null
    this.step.value = 'join-method'
    await joiner?.cancel()
  }

  // "They match" on the new device: only now is whatever the first device sends opened here.
  joinMatch(): void {
    const joiner = this.joiner.value
    if (joiner?.phase.value === 'compare') joiner.confirm()
  }

  // "They don't match": the invitation is ended and the screen says why; Back returns to the method.
  async joinMismatch(): Promise<void> {
    const joiner = this.joiner.value
    if (joiner?.phase.value === 'compare') await joiner.reject()
  }

  // "Next" on "Key received".
  async receivedNext(): Promise<void> {
    await this.toCode()
  }

  private startJoiner(server: string, ref: string): void {
    const factory = this.options.joiner
    if (factory == null) return
    const joiner = factory({ server, ref, deviceName: this.options.deviceName ?? 'New device' })
    this.joiner.value = joiner
    this.step.value = 'join-compare'
    joiner.start().then(
      (payload) => {
        if (this.joiner.value !== joiner) return
        this.joinMnemonic = payload.mnemonic
        // With a fixed server the page's own origin is the address, whatever spelling the other device
        // used for it; the scan was refused above if they are not the same server.
        this.joinServer = this.options.server === 'ask' ? payload.serverUrl : this.options.server.fixed
        this.joinedByInvitation = true
        this.step.value = 'join-received'
      },
      // The failure is on the joiner (phase and error), which the compare screen reads.
      () => {},
    )
  }

  private showInviteCode(): void {
    const server = this.options.server
    this.inviteServer.value = server === 'ask' ? this.inviteServer.value : server.fixed
    this.inviteError.value = null
    this.step.value = 'join-code'
  }

  private stopScan(): void {
    this.scanRun?.abort()
    this.scanRun = null
    this.scanning.value = false
  }

  private showJoinServer(): void {
    const server = this.options.server
    if (server === 'ask') {
      // Kept across Back/Next, so a typo is corrected rather than retyped.
      this.checkGeneration += 1
      this.serverStatus.value = { kind: 'idle' }
    } else {
      this.address.value = server.fixed
    }
    this.step.value = 'join-server'
    if (server !== 'ask') void this.checkServer()
  }

  // A device that already has its code (the app closed between the code and the phrase last time) skips
  // straight to writing the identity.
  private async toCode(): Promise<void> {
    if (this.locked) {
      await this.run(() => this.completeJoin())
      return
    }
    this.step.value = 'create-code'
  }

  private async completeJoin(): Promise<void> {
    const mnemonic = this.joinMnemonic
    const serverUrl = this.joinServer
    if (mnemonic == null || serverUrl == null || this.done) return
    await storeIdentity(this.store, mnemonic)
    this.options.records.write({ v: 1, kind: 'join', serverUrl, since: (this.options.now?.() ?? new Date()).toISOString() })
    this.done = true
    this.joinMnemonic = null
    this.phraseWords.value = Array<string>(PHRASE_WORDS).fill('')
    this.joiner.value = null
    this.options.onDone({ store: this.store, entry: this.options.records.read() })
  }

  reveal(): void {
    this.revealed.value = true
  }

  // "I've written it down" — only after the words were on screen, or there was nothing to write.
  writtenDown(): void {
    if (!this.revealed.value) return
    this.showCheck()
  }

  pick(position: number, word: string): void {
    this.picks.value = { ...this.picks.value, [position]: word }
  }

  // A pick that is not the word at that position. Null while nothing is picked there yet.
  wrongAt(position: number): boolean {
    const picked = this.picks.value[position]
    const question = this.questions.value.find((q) => q.position === position)
    return picked != null && question != null && picked !== question.answer
  }

  checkNext(): void {
    if (this.checkPassed.value) this.showServer()
  }

  skipCheck(): void {
    this.showServer()
  }

  setAddress(text: string): void {
    if (this.serverFixed) return
    this.address.value = text
    this.checkGeneration += 1
    this.serverStatus.value = { kind: 'idle' }
  }

  async checkServer(): Promise<void> {
    const serverUrl = normalizeServerAddress(this.address.value)
    const generation = ++this.checkGeneration
    if (serverUrl == null) {
      this.serverStatus.value = { kind: 'invalid' }
      return
    }
    this.serverStatus.value = { kind: 'checking' }
    // A joining device asks about the phrase it was given; a new vault about the one it just made.
    const mnemonic = this.mode.value === 'join' ? (this.joinMnemonic ?? '') : this.words.value.join(' ')
    let status: ServerStatus
    try {
      status = await this.options.inspect(serverUrl, mnemonic)
    } catch {
      status = { kind: 'unreachable' }
    }
    if (generation === this.checkGeneration) this.serverStatus.value = status
  }

  // "Connect and start" (with the server that answered) or "Only this device — later" (without one).
  // A browser bundle has no "later": its vault lives on the server that serves it, so a key that server
  // does not accept would boot into an app that can read and write nothing.
  finish(withServer: boolean): void {
    if (this.done) return
    if (!withServer && this.serverFixed) return
    const serverUrl = normalizeServerAddress(this.address.value)
    if (withServer) {
      if (this.serverStatus.value.kind !== 'found' || serverUrl == null) return
      this.options.records.write({ v: 1, kind: 'connect', serverUrl })
    } else {
      this.options.records.clear()
    }
    this.done = true
    const entry = this.options.records.read()
    this.words.value = []
    this.picks.value = {}
    this.questions.value = []
    this.options.onDone({ store: this.store, entry })
  }

  private async beginPhrase(): Promise<void> {
    if (!(await hasIdentity(this.store))) await createIdentity(this.store)
    await this.loadWords()
    this.showPhrase()
  }

  private async loadWords(): Promise<void> {
    const mnemonic = (await this.store.get(IDENTITY_MNEMONIC_KEY))?.trim() ?? ''
    this.words.value = mnemonic === '' ? [] : mnemonic.split(/\s+/)
  }

  private showPhrase(): void {
    this.options.records.write({ v: 1, kind: 'new', step: 'phrase' })
    this.revealed.value = false
    this.step.value = 'phrase'
  }

  private showCheck(): void {
    this.options.records.write({ v: 1, kind: 'new', step: 'check' })
    this.questions.value = phraseQuestions(this.words.value, this.options.random)
    this.picks.value = {}
    this.step.value = 'check'
  }

  private showServer(): void {
    this.options.records.write({ v: 1, kind: 'new', step: 'server' })
    const server = this.options.server
    this.address.value = server === 'ask' ? '' : server.fixed
    this.checkGeneration += 1
    this.serverStatus.value = { kind: 'idle' }
    this.step.value = 'server'
    // A fixed address has nothing to type, so the screen opens on its answer.
    if (server !== 'ask') void this.checkServer()
  }

  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy.value) return
    this.busy.value = true
    this.error.value = null
    try {
      await work()
    } catch (error) {
      this.error.value = error instanceof Error ? error.message : String(error)
    } finally {
      this.busy.value = false
    }
  }
}
