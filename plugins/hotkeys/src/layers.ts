// The layer stack: what "the same chord means different things depending on where you are" is made of.
//
// A binding is never declared "globally" — it is declared in a LAYER. `app` is the bottom of the
// stack and is always there; everything else is pushed on top of it while it is in play and pops off
// when it stops being. Resolution walks the stack from the top down and the first layer that claims
// the chord wins, so an upper layer OVERRIDES a lower one holding the same chord. That is the whole
// model: ⌘B meaning "bold" and ⌘B meaning "collapse the column" stop being a contradiction and become
// two entries in two layers, of which exactly one is on top at any moment.

export type LayerKind = 'app' | 'type' | 'object' | 'layer' | 'editor'

export const APP_LAYER = 'app'

// Why a layer is on the stack right now, which is not decoration — it decides what a modal cuts.
//
// 'focus' — the layer's element contains `document.activeElement`. That is the honest signal for a
// panel, an editor or a sheet, and it is what makes the ⌘S leak unrepresentable rather than merely
// forbidden: a stage that is not on screen cannot hold focus, so its layer cannot be on the stack
// however carelessly its component manages registration.
//
// 'visible' — the layer's element is on screen. A TYPE is where you are, whether or not anything
// inside it has taken focus: clicking blank space parks focus on <body>, and a type whose chords died
// on that would be a keyboard nobody can rely on. Only one type's stage is displayed at a time
// (`TypeStageView` is v-show), so "on screen" IS "this is the active type".
export type LayerReason = 'focus' | 'visible'

export interface StackedLayer {
  readonly id: string
  // Nesting depth of the layer's element in the document. Deeper is more specific, so it sits higher
  // on the stack.
  readonly depth: number
  readonly reason: LayerReason
  // A layer that cuts the stack: while a dialog, a sheet or a menu is up, nothing under it resolves.
  readonly modal: boolean
}

// The stack as the resolver reads it: most specific first, `app` last.
//
// A modal cuts everything it does not contain. It is on the stack because focus is inside it, and
// focus is in one place — so any OTHER layer holding focus is an ancestor or a descendant of it, and
// only the descendants stay. Layers that are up merely because they are visible (the types) are cut
// whatever their depth: a type stage is nested deeper in the document than a dialog teleported to
// <body>, and letting depth decide would leave ⌘B collapsing the column from under an open dialog —
// which is the thing modality means.
export function layerStack(active: readonly StackedLayer[]): string[] {
  // Reversed first, so that at equal depth the layer registered LATER — the one pushed last — is the
  // one on top. `sort` is stable, which is what makes reversing enough to say that.
  const pushed = [...active].reverse()
  const deepest = pushed.filter((it) => it.modal).sort(byDepth)[0]
  const kept = deepest == null ? pushed : pushed.filter((it) => it.id === deepest.id || (it.reason === 'focus' && it.depth > deepest.depth))
  const stack = kept.sort(byDepth).map((it) => it.id)
  // Under a modal there is no `app`: "nothing below resolves" includes the bottom of the stack.
  return deepest == null ? [...stack, APP_LAYER] : stack
}

// Deeper first; at equal depth the one registered later, which is the one pushed last.
function byDepth(a: StackedLayer, b: StackedLayer): number {
  return b.depth - a.depth
}
