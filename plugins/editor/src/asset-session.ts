import { illegalState } from '@arxhub/errors'
import { Fragment } from 'prosemirror-model'
import { Plugin, PluginKey, Selection, type SelectionBookmark } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { type InjectionKey, inject, ref } from 'vue'
import { type ArxAsset, type ArxAssetStore, isImageAsset } from './assets'
import { insertBlock } from './block-actions'
import { runPreparedCommand } from './command-state'
import { editorMode } from './editor-mode'

const positions = new PluginKey<Map<number, SelectionBookmark>>('asset-insertion-positions')
type PositionChange = { add: number; bookmark: SelectionBookmark } | { remove: number }

export function createAssetSession(store: ArxAssetStore) {
  const pending = ref(0)
  const error = ref('')
  const jobs = new Set<Promise<void>>()
  let retryJob: (() => void) | null = null
  let discardJob: (() => void) | null = null
  let disposed = false
  let id = 0

  function dismiss() {
    discardJob?.()
    discardJob = null
    retryJob = null
    error.value = ''
  }

  function run(operation: () => Promise<void>, discard?: () => void): Promise<void> {
    dismiss()
    const job = operation()
      .catch((failure: unknown) => {
        if (!disposed) {
          discardJob?.()
          error.value = failure instanceof Error ? failure.message : 'Upload failed'
          discardJob = discard ?? null
          retryJob = () => {
            discardJob = null
            void run(operation, discard).catch(() => {})
          }
        }
        throw failure
      })
      .finally(() => {
        jobs.delete(job)
        pending.value = jobs.size
      })
    jobs.add(job)
    pending.value = jobs.size
    return job
  }

  function upload(file: File, apply: (asset: ArxAsset) => void): Promise<void> {
    return run(async () => {
      const asset = await store.put(file)
      if (!disposed) apply(asset)
    })
  }

  function insert(view: Pick<EditorView, 'state' | 'dispatch' | 'isDestroyed'>, files: File[], at?: number): void {
    if (!files.length || editorMode(view.state) !== 'editable') return
    const key = ++id
    const selection = at === undefined ? view.state.selection : Selection.near(view.state.doc.resolve(at))
    const bookmark = selection.getBookmark()
    view.dispatch(view.state.tr.setMeta(positions, { add: key, bookmark } satisfies PositionChange))
    const discard = () => {
      if (!disposed && !view.isDestroyed) view.dispatch(view.state.tr.setMeta(positions, { remove: key } satisfies PositionChange))
    }
    // Successful uploads survive retry; a failed later file does not make us write them again.
    const uploaded = new Map<File, ArxAsset>()
    void run(async () => {
      for (const file of files) {
        if (disposed || view.isDestroyed) return
        if (!uploaded.has(file)) uploaded.set(file, await store.put(file))
      }
      if (disposed || view.isDestroyed) return
      if (editorMode(view.state) !== 'editable') throw illegalState('Switch to Editable to finish inserting the attachment')
      const saved = positions.getState(view.state)?.get(key)
      if (!saved) return
      const tr = view.state.tr.setSelection(saved.resolve(view.state.doc))
      runPreparedCommand(
        view.state,
        tr,
        insertBlock({
          id: 'uploaded-assets',
          label: 'Attachments',
          icon: 'lu:paperclip',
          keywords: '',
          run: (state, dispatch) => {
            const nodes = [...uploaded.values()].map((asset) =>
              state.schema.nodes[isImageAsset(asset.mime) ? 'image_block' : 'attachment'].create(asset),
            )
            const { $from } = state.selection
            dispatch?.(state.tr.replaceWith($from.before(), $from.after(), Fragment.from([...nodes, state.schema.nodes.paragraph.create()])))
            return true
          },
        }),
      )
      view.dispatch(tr.setMeta(positions, { remove: key } satisfies PositionChange))
    }, discard).catch(() => {})
  }

  const plugin = new Plugin<Map<number, SelectionBookmark>>({
    key: positions,
    state: {
      init: () => new Map(),
      apply: (tr, previous) => {
        const next = new Map([...previous].map(([key, bookmark]) => [key, bookmark.map(tr.mapping)]))
        const change: PositionChange | undefined = tr.getMeta(positions)
        if (change && 'add' in change) next.set(change.add, change.bookmark)
        if (change && 'remove' in change) next.delete(change.remove)
        return next
      },
    },
    props: {
      handlePaste: (view, event) => {
        const files = Array.from(event.clipboardData?.files ?? [])
        if (!files.length || editorMode(view.state) !== 'editable') return false
        insert(view, files)
        return true
      },
      handleDOMEvents: {
        drop: (view, event) => {
          const files = Array.from(event.dataTransfer?.files ?? [])
          if (!files.length || editorMode(view.state) !== 'editable') return false
          event.preventDefault()
          insert(view, files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos)
          return true
        },
      },
    },
  })

  return {
    store,
    pending,
    error,
    plugin,
    upload,
    insert,
    dismiss,
    retry: () => retryJob?.(),
    wait: async () => {
      while (jobs.size) await Promise.all([...jobs])
    },
    dispose: () => {
      disposed = true
      dismiss()
    },
  }
}

export type ArxAssetSession = ReturnType<typeof createAssetSession>
export const ARX_ASSETS: InjectionKey<ArxAssetSession> = Symbol('ArxEditor assets')
export function useAssetSession(): ArxAssetSession {
  const session = inject(ARX_ASSETS)
  if (!session) throw illegalState('Asset controls need an ArxEditor document')
  return session
}
