import { Extension } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import { shallowRef } from 'vue'
import { DEFAULT_DIFF_SETTINGS, type DiffSettings } from './diff-config'
import type { DiffContext, DifferRegistration, DiffRequest, DiffSide } from './differ'
import type { DiffModel, DiffResult, DiffTextModel } from './model'
import { replacedModel, textDiff } from './text-differ'
import { decodeText } from './word-diff'

export interface AttachedDiffView {
  element: HTMLElement
  step(direction: 1 | -1): void
}

const BINARY_DIFFER = 'binary'
const TEXT_DIFFER = 'text'

const encoder = new TextEncoder()

// One registry of differs by file, the shape RepositoryExtension.registerContentMerger has, so a format owner
// contributes its comparison without the diff plugin — or any consumer of it — importing that format.
export class DiffExtension extends Extension {
  private readonly registrations: DifferRegistration[] = []
  private readonly views = new Set<AttachedDiffView>()
  // Written by DiffPlugin from its config (boot read and every later save); read live by the views.
  readonly settings = shallowRef<DiffSettings>(DEFAULT_DIFF_SETTINGS)

  registerDiffer(registration: DifferRegistration): () => void {
    if (this.registrations.some((it) => it.id === registration.id))
      throw illegalState(`A differ with id "${registration.id}" is already registered`)
    this.registrations.push(registration)
    // Removes THIS registration, not whichever holds the id now — a plugin restarted under the same id must not
    // have its fresh registration pulled out by the old one's late unregister.
    return () => {
      const index = this.registrations.indexOf(registration)
      if (index >= 0) this.registrations.splice(index, 1)
    }
  }

  text(left: string, right: string): DiffTextModel {
    return textDiff(left, right)
  }

  async diff(request: DiffRequest): Promise<DiffResult> {
    const left = sideOf(request.left)
    const right = sideOf(request.right)
    const ctx: DiffContext = { pathname: request.pathname, text: textDiff }
    const answer = (await this.resolve(left, right, ctx)) ?? { differ: BINARY_DIFFER, model: replacedModel(left.bytes, right.bytes) }

    let source: DiffTextModel | null | undefined
    return {
      pathname: request.pathname,
      leftLabel: request.leftLabel,
      rightLabel: request.rightLabel,
      differ: answer.differ,
      model: answer.model,
      source: () => {
        if (source !== undefined) return source
        const raw = answer.differ === TEXT_DIFFER || answer.differ === BINARY_DIFFER || left.text == null || right.text == null
        source = raw ? null : textDiff(left.text ?? '', right.text ?? '')
        return source
      },
    }
  }

  // Owners first, in registration order, then the generic fallbacks — whatever order they registered in, since
  // a plugin cannot know whether the diff plugin's own text differ was registered before it.
  private async resolve(left: DiffSide, right: DiffSide, ctx: DiffContext): Promise<{ differ: string; model: DiffModel } | null> {
    const registrations = [...this.registrations]
    for (const fallback of [false, true]) {
      for (const registration of registrations) {
        if ((registration.fallback === true) !== fallback) continue
        try {
          if (!registration.matches(ctx.pathname)) continue
          const model = await registration.diff(left, right, ctx)
          if (model != null) return { differ: registration.id, model }
        } catch (error) {
          this.logger.error(`Differ "${registration.id}" failed on ${ctx.pathname}; treating it as a decline`, error)
        }
      }
    }
    return null
  }

  attachView(view: AttachedDiffView): () => void {
    this.views.add(view)
    return () => {
      this.views.delete(view)
    }
  }

  // The view the keyboard is in. A chord only resolves while focus sits inside a diff's layer, so the one that
  // contains the active element is the one the reader means — even with two diffs mounted side by side.
  focusedView(): AttachedDiffView | null {
    if (typeof document === 'undefined') return null
    const active = document.activeElement
    if (active == null) return null
    for (const view of this.views) if (view.element.contains(active)) return view
    return null
  }
}

function sideOf(value: string | Uint8Array): DiffSide {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value
  return { bytes, text: decodeText(bytes) }
}
