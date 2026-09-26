import { illegalState } from '@arxhub/errors'
import { HotkeysExtension } from '@arxhub/plugin-hotkeys'
import { useHotkeyLayer } from '@arxhub/plugin-hotkeys/ui'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import {
  type ComputedRef,
  computed,
  type InjectionKey,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  type Ref,
  watch,
  watchEffect,
} from 'vue'
import { DIFF_LAYER } from '../contributions'
import type { DiffSettings } from '../diff-config'
import { DiffExtension } from '../diff-extension'
import { type FoldEntry, foldRuns } from '../fold'
import { hiddenTargets } from './block-view'
import type { DiffController } from './controller'
import { useDiffSettings } from './use-diff'

// Where a stop hidden inside a fold lives, published by whichever renderer drew the fold. Per scope, so a
// container that unmounts takes its entries with it instead of leaving a fold id nothing draws any more.
export interface FoldTargets {
  publish(scope: string, targets: ReadonlyMap<string, string>): void
  withdraw(scope: string): void
  foldOf(target: string): string | null
}

export interface DiffViewContext {
  controller: DiffController
  settings: Readonly<Ref<DiffSettings>>
  touch: boolean
  folds: FoldTargets
}

const DIFF_VIEW_KEY: InjectionKey<DiffViewContext> = Symbol('arxhub.diff.view')

function createFoldTargets(): FoldTargets {
  const scopes = new Map<string, ReadonlyMap<string, string>>()
  return {
    publish(scope, targets) {
      if (targets.size === 0) scopes.delete(scope)
      else scopes.set(scope, targets)
    },
    withdraw(scope) {
      scopes.delete(scope)
    },
    foldOf(target) {
      for (const targets of scopes.values()) {
        const fold = targets.get(target)
        if (fold != null) return fold
      }
      return null
    },
  }
}

export function useDiffViewContext(): DiffViewContext {
  const context = inject(DIFF_VIEW_KEY, null)
  if (context == null) throw illegalState('A diff renderer was mounted outside a DiffView')
  return context
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function stopElement(root: HTMLElement, target: string): HTMLElement | null {
  const found = root.querySelector(`[data-diff-stop="${CSS.escape(target)}"]`)
  return found instanceof HTMLElement ? found : null
}

// The wiring both realizations share and no renderer should repeat: the keyboard layer, the extension's view
// registry that the Alt+↑/↓ bindings step, and turning a controller's `reveal` into focus and scroll.
export function useDiffView(controller: DiffController, root: Ref<HTMLElement | null>): DiffViewContext {
  const arxhub = useArxHub()
  const context: DiffViewContext = {
    controller,
    settings: useDiffSettings(),
    touch: useShellFrame() === 'mobile',
    folds: createFoldTargets(),
  }
  provide(DIFF_VIEW_KEY, context)

  if (arxhub.extensions.has(HotkeysExtension)) {
    useHotkeyLayer(arxhub.extensions.get(HotkeysExtension), { id: DIFF_LAYER, kind: 'object' }, root)
  }

  let detach: (() => void) | null = null
  onMounted(() => {
    const element = root.value
    if (element == null || !arxhub.extensions.has(DiffExtension)) return
    detach = arxhub.extensions.get(DiffExtension).attachView({ element, step: controller.step })
  })
  onBeforeUnmount(() => {
    detach?.()
    detach = null
  })

  watch(controller.reveal, async (reveal) => {
    const element = root.value
    if (reveal == null || element == null) return
    const fold = context.folds.foldOf(reveal.target)
    if (fold != null) controller.expand(fold)
    await nextTick()
    // Stale: the reader stepped again while the fold was opening.
    if (controller.reveal.value !== reveal) return
    const stop = stopElement(element, reveal.target)
    if (stop == null) return
    stop.focus({ preventScroll: true })
    // Both axes: a grid cell can sit off to the right as well as below.
    stop.scrollIntoView({ block: 'center', inline: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' })
  })

  return context
}

// A click on a change (or Tab onto one) makes it the current stop, so "k из n" and the next ↓ start from where
// the reader is rather than from where the arrows last left them.
export function useStopFocusSync(controller: DiffController): (event: FocusEvent) => void {
  return (event) => {
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-diff-stop]') : null
    const id = target?.getAttribute('data-diff-stop')
    if (id == null) return
    const index = controller.stops.value.findIndex((stop) => stop.target === id)
    if (index >= 0) controller.current.value = index
  }
}

export interface FoldsOptions<T> {
  isChange: (item: T) => boolean
  context: () => number
  scope: () => string
  targetsOf: (item: T) => string[]
  // An unchanged container is context, not content: all of it folds, where foldRuns would show all of it.
  foldAllWhenUnchanged?: () => boolean
}

let registrations = 0

// foldRuns over a reactive list, with the stops it hides published to the view's fold registry.
export function useFolds<T>(items: () => readonly T[], options: FoldsOptions<T>): ComputedRef<FoldEntry<T>[]> {
  const { controller, folds } = useDiffViewContext()
  // Its own registry key: both columns of the side-by-side view fold the same scope, and one must not withdraw
  // what the other published.
  const key = `folds:${++registrations}`
  const entries = computed<FoldEntry<T>[]>(() => {
    const list = items()
    const scope = options.scope()
    const all = `${scope}:0`
    if (options.foldAllWhenUnchanged?.() === true && list.length > 1 && !list.some(options.isChange) && !controller.expanded.value.has(all))
      return [{ kind: 'fold', id: all, start: 0, count: list.length }]
    return foldRuns(list, options.isChange, { context: options.context(), expanded: controller.expanded.value, scope })
  })
  watchEffect(() => {
    folds.publish(key, hiddenTargets(entries.value, items(), options.targetsOf))
  })
  onBeforeUnmount(() => folds.withdraw(key))
  return entries
}
