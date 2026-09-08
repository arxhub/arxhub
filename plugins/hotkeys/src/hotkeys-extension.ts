import { Extension, type ExtensionArgs } from '@arxhub/core'
import { createEventBus, type TypedEventBus } from '@arxhub/events'
import { type ComputedRef, computed, markRaw, shallowRef } from 'vue'
import {
  ChordError,
  type ChordSource,
  chordOf,
  detectPlatform,
  formatChord,
  isBareKey,
  isReserved,
  normalizeChord,
  type Platform,
  parseChord,
} from './chord'
import { APP_LAYER, type LayerKind, type LayerReason, layerStack, type StackedLayer } from './layers'

export type Disposer = () => void

export interface HotkeyBinding {
  // Stable, `<plugin>.<action>`: what a rebinding would key off when it comes (A-36), and what a
  // collision warning names. Also half of what a command registry would need, which is why it is a
  // field rather than a generated number.
  readonly id: string
  // Canonical `Mod-` notation. Normalized on registration, so a lookup is string equality.
  readonly chord: string
  // Which layer it lives in. `app` is the bottom of the stack and always present.
  readonly layer: string
  readonly title: string
  // Checked at resolution, not at registration: a binding whose condition is false is skipped and the
  // stack keeps going down. ⌘B on a frame with no navigation column is the worked example — nobody
  // claims it, so it reaches the system unchanged.
  readonly when?: () => boolean
  // Absent means FOREIGN (F-06): the chord belongs to a library keymap that handles it itself.
  // Resolution stops at it and touches the event no further, so the library gets the keystroke while
  // the layers below never see it. That is the whole ⌘B fix, and it took no line inside either editor.
  readonly run?: () => void
}

export interface HotkeyLayer {
  readonly id: string
  readonly kind: LayerKind
  // The layer's root. A type's stage, a panel, an editor, a dialog's body.
  readonly element: HTMLElement
  // Cuts the stack: while it is up, nothing under it resolves. A dialog, a sheet, a menu.
  readonly modal?: boolean
}

// What a chord did, which is three answers and not two. 'yielded' is the one worth having: the chord
// was claimed by a foreign keymap, so the event is deliberately left alone AND the layers below are
// not consulted.
export type HotkeyOutcome =
  | { readonly kind: 'ran'; readonly binding: HotkeyBinding }
  | { readonly kind: 'yielded'; readonly binding: HotkeyBinding }
  | { readonly kind: 'unclaimed'; readonly chord: string | null }

// One binding shadowed by another holding the same chord in a different layer. Legal — it is the
// point of the whole model — and therefore something the registry has to be able to state.
export interface HotkeyShadow {
  readonly chord: string
  readonly by: string
  readonly over: string
}

interface HotkeyEvents {
  ran: { binding: HotkeyBinding }
  yielded: { binding: HotkeyBinding }
  unclaimed: { chord: string }
}

// Which layers are on the stack right now. Injectable so the registry can be tested whole — layers,
// resolution and dispatch — without a DOM, which is where all of the interesting rules are.
export type LayerProbe = (layer: HotkeyLayer) => { readonly reason: LayerReason; readonly depth: number } | null

export interface HotkeysExtensionArgs extends ExtensionArgs {
  probe?: LayerProbe
  platform?: Platform
}

export class HotkeysExtension extends Extension {
  readonly platform: Platform
  private readonly probe: LayerProbe

  // shallowRef + markRaw: an entry holds `run` and `when`, which need no reactive proxy and whose
  // identity a proxy breaks — the same reason written down in `TabTypeRegistry`.
  private readonly entries = shallowRef<HotkeyBinding[]>([])
  private readonly layers = shallowRef<HotkeyLayer[]>([])

  // The registry's OWN bus, by the shape `VfsWatcher` uses: this stream belongs to one object, and on
  // the application-wide bus every subscriber would filter the whole product's traffic back out to
  // find it. And to say it before the next hand reads the file wrongly: the registry itself is NOT a
  // bus. A bus reaches every subscriber; here exactly one binding wins. It is a resolution table, and
  // "nothing hand-rolls a listener registry" does not apply to it.
  readonly events: TypedEventBus<HotkeyEvents> = createEventBus<HotkeyEvents>({
    onError: (error, event) => this.logger.error(`hotkeys listener for "${event}" threw:`, error),
  })

  readonly bindings: ComputedRef<readonly HotkeyBinding[]> = computed(() => this.entries.value)

  constructor(args: HotkeysExtensionArgs) {
    super(args)
    this.platform = args.platform ?? detectPlatform()
    this.probe = args.probe ?? domProbe
  }

  // Declare a chord. Refused — with a warning and a no-op disposer — rather than thrown, in three
  // cases, all of them a developer's mistake found at start-up instead of by a user a month later:
  // the chord is already taken IN THE SAME LAYER, it belongs to the system, or it is a bare key.
  //
  // The first one keeps the FIRST registration, exactly as `TabTypeRegistry` and `StatusRegistry` do:
  // registration runs as plugins start, and throwing here would mean failing to boot because two
  // plugins did not agree on a key.
  register(binding: HotkeyBinding): Disposer {
    let chord: string
    try {
      chord = normalizeChord(binding.chord)
    } catch (error) {
      if (!(error instanceof ChordError)) throw error
      this.logger.warn(`Hotkey "${binding.id}" declares an unreadable chord "${binding.chord}": ${error.message}`)
      return noop
    }
    const parsed = parseChord(chord)
    if (isReserved(parsed)) {
      this.logger.warn(`Hotkey "${binding.id}" claims ${chord}, which belongs to the system or the browser — refused`)
      return noop
    }
    if (isBareKey(parsed)) {
      this.logger.warn(`Hotkey "${binding.id}" claims the bare key ${chord}; a chord without a modifier would eat typed text — refused`)
      return noop
    }
    const layer = binding.layer || APP_LAYER
    const taken = this.entries.value.find((it) => it.layer === layer && it.chord === chord)
    if (taken != null) {
      this.logger.warn(`Chord ${chord} is already bound in layer "${layer}" by "${taken.id}"; keeping it and refusing "${binding.id}"`)
      return noop
    }
    const entry = markRaw({ ...binding, chord, layer }) as HotkeyBinding
    this.entries.value = [...this.entries.value, entry]
    return () => {
      this.entries.value = this.entries.value.filter((it) => it !== entry)
    }
  }

  // Push a layer. It is only ever ON the stack while it is focused (or, for a type, on screen) — this
  // records that the layer EXISTS, which is a different thing, and why a component that forgets to
  // dispose cannot make its chords win from off screen.
  pushLayer(layer: HotkeyLayer): Disposer {
    if (layer.id === APP_LAYER) {
      this.logger.warn(`"${APP_LAYER}" is the bottom of the stack and is never pushed; ignoring the registration`)
      return noop
    }
    const entry = markRaw({ ...layer }) as HotkeyLayer
    this.layers.value = [...this.layers.value, entry]
    return () => {
      this.layers.value = this.layers.value.filter((it) => it !== entry)
    }
  }

  // The stack as it stands, most specific first, `app` last. Public because it is the one thing worth
  // looking at when a chord did something unexpected.
  stack(): string[] {
    const active: StackedLayer[] = []
    for (const layer of this.layers.value) {
      const on = this.probe(layer)
      if (on != null) active.push({ id: layer.id, depth: on.depth, reason: on.reason, modal: layer.modal === true })
    }
    return layerStack(active)
  }

  // Walk the stack from the top down; the first binding whose chord matches and whose condition holds
  // wins, and nothing below it is consulted.
  resolve(event: ChordSource): HotkeyOutcome {
    const chord = chordOf(event)
    if (chord == null) return { kind: 'unclaimed', chord: null }
    for (const layer of this.stack()) {
      for (const binding of this.entries.value) {
        if (binding.layer !== layer || binding.chord !== chord) continue
        if (binding.when != null && !binding.when()) continue
        return binding.run == null ? { kind: 'yielded', binding } : { kind: 'ran', binding }
      }
    }
    return { kind: 'unclaimed', chord }
  }

  // The one place a keydown becomes an action. A chord NOBODY claimed is not touched at all — no
  // preventDefault, no stopPropagation — and that is the most important rule here: today the settings
  // bar swallows ⌘S even with nothing staged and the desktop frame swallows ⌘B even where there is no
  // column. An unclaimed chord has to reach the browser and the system exactly as if the app were not
  // running.
  dispatch(event: KeyboardEvent): HotkeyOutcome {
    const outcome = this.resolve(event)
    if (outcome.kind === 'unclaimed') {
      if (outcome.chord != null) this.events.emit('unclaimed', { chord: outcome.chord })
      return outcome
    }
    if (outcome.kind === 'yielded') {
      // Untouched on purpose: the library that owns this chord has not seen the event yet — the
      // dispatcher listens in the capture phase — and stopping it here would kill the very binding
      // the layer was declared to protect.
      this.events.emit('yielded', { binding: outcome.binding })
      return outcome
    }
    event.preventDefault()
    event.stopPropagation()
    try {
      outcome.binding.run?.()
    } catch (error) {
      // A chord that throws is a bug in one binding, not a reason to leave the keyboard in a state
      // where the next keystroke behaves differently.
      this.logger.error(`Hotkey "${outcome.binding.id}" (${outcome.binding.chord}) failed:`, error)
    }
    this.events.emit('ran', { binding: outcome.binding })
    return outcome
  }

  // Every pair where one layer's chord covers another's. Shadowing BETWEEN layers is legal and is the
  // point — so it has to be visible, or the model is indistinguishable from the accident it replaced.
  shadows(): HotkeyShadow[] {
    const found: HotkeyShadow[] = []
    for (const binding of this.entries.value) {
      for (const other of this.entries.value) {
        if (other === binding || other.chord !== binding.chord || other.layer === binding.layer) continue
        if (binding.layer === APP_LAYER) continue
        found.push({ chord: binding.chord, by: binding.id, over: other.id })
      }
    }
    return found
  }

  // The chord as this machine's owner reads it. One function for the whole product (F-02).
  label(chord: string): string {
    return formatChord(normalizeChord(chord), this.platform)
  }
}

function noop(): void {}

// Whether a layer is on the stack, read off the live document.
//
// A type is up while its element is DISPLAYED; everything else is up while it holds focus. The two
// clauses are the difference between "where you are" and "where the caret is", and the product needs
// both: clicking blank space parks focus on <body>, and a type whose chords died on that would be
// unusable.
function domProbe(layer: HotkeyLayer): { reason: LayerReason; depth: number } | null {
  const element = layer.element
  if (element.ownerDocument == null || !element.isConnected) return null
  if (layer.kind === 'type') {
    return visible(element) ? { reason: 'visible', depth: depthOf(element) } : null
  }
  const focused = element.ownerDocument.activeElement
  if (focused == null || !element.contains(focused)) return null
  return { reason: 'focus', depth: depthOf(element) }
}

function visible(element: HTMLElement): boolean {
  // checkVisibility() answers display:none — which is what `v-show` sets and what puts a type's stage
  // off screen. offsetParent is the fallback for an engine without it, and is wrong for a fixed
  // element, which no type stage is.
  if (typeof element.checkVisibility === 'function') return element.checkVisibility()
  return element.offsetParent != null
}

function depthOf(element: HTMLElement): number {
  let depth = 0
  let node: HTMLElement | null = element
  while (node != null) {
    depth++
    node = node.parentElement
  }
  return depth
}
