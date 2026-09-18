<script setup lang="ts">
import { validation } from '@arxhub/errors'
import { basename, dirname } from '@arxhub/path'
import { useHotkeyLayer } from '@arxhub/plugin-hotkeys/ui'
import { type BlockAnchor, DocumentName, NotesExtension } from '@arxhub/plugin-notes/ui'
import { useHotkeysExtension } from '@arxhub/plugin-shell/ui'
import { createDebouncedTask } from '@arxhub/stdlib/scheduling/debounced-task'
import { Button, Strip } from '@arxhub/uikit/core'
import { toaster, useArxHub, useFileDocument, useShellFrame } from '@arxhub/uikit/hooks'
import { VaultVfs, VaultWatcher } from '@arxhub/vfs'
import { closeHistory, history } from 'prosemirror-history'
import { inputRules } from 'prosemirror-inputrules'
import { keymap } from 'prosemirror-keymap'
import { EditorState, Selection } from 'prosemirror-state'
import { columnResizing, tableEditing } from 'prosemirror-tables'
import { EditorView } from 'prosemirror-view'
import { computed, onMounted, onUnmounted, provide, ref, shallowRef, toRef, useId, watch } from 'vue'
import { ARX_ASSETS, createAssetSession } from '../asset-session'
import { createAssetStore } from '../assets'
import { blockIdentityPlugin, identifyBlocks } from '../block-identity'
import { blockMarqueePlugin } from '../block-marquee'
import { blockSelectionPlugin } from '../block-selection'
import { codeHighlighting } from '../code-highlighting'
import { columnsView } from '../columns-view'
import { createControlViews } from '../control-views'
import type { ArxDraft } from '../document-drafts'
import { documentId, withDocumentId } from '../document-history'
import { documentBlocks, documentHref, documentLinksPlugin, revealBlock } from '../document-links'
import { focusDocument } from '../document-navigation'
import { documentSearchKey, documentSearchPlugin } from '../document-search'
import { ArxEditorExtension } from '../editor-extension'
import { deserialize, emptyDoc, serialize } from '../editor-format'
import { buildInputRules } from '../editor-input-rules'
import { buildKeymap, interactiveKeydown } from '../editor-keymap'
import { type EditorMode, editorModeKey, modePlugin } from '../editor-mode'
import { PROSEMIRROR_LAYER } from '../hotkeys'
import { insertHint } from '../insert-hint'
import { slashCommands, slashKey } from '../slash-commands'
import { restoreVersionBlock } from '../version-diff'
import ArxComponentHost from './ArxComponentHost.vue'
import BlockHandle from './BlockHandle.vue'
import DocumentBacklinks from './DocumentBacklinks.vue'
import DocumentFind from './DocumentFind.vue'
import DocumentOutline from './DocumentOutline.vue'
import DocumentRecovery from './DocumentRecovery.vue'
import DocumentTools from './DocumentTools.vue'
import DocumentVersions from './DocumentVersions.vue'
import SelectionFormatting from './SelectionFormatting.vue'
import SlashMenu from './SlashMenu.vue'
import 'prosemirror-view/style/prosemirror.css'

// Fires this long after the last keystroke, mirroring the search plugin's index-queue debounce shape
// (a burst of edits coalesces into one write, not one per keystroke).
defineOptions({ name: 'ArxEditor' })

const AUTOSAVE_DEBOUNCE_MS = 1500

const props = defineProps<{ path: string; anchor?: BlockAnchor }>()
const buttonSize = useShellFrame() === 'mobile' ? 'md' : 'sm'

const arxhub = useArxHub()
const extension = arxhub.extensions.get(ArxEditorExtension)
const kit = extension.kit
const { schema } = kit
const vfs = arxhub.services.get(VaultVfs)
const assets = createAssetSession(extension.assets ?? createAssetStore(vfs))
provide(ARX_ASSETS, assets)
const notes = arxhub.extensions.get(NotesExtension)
const editorEl = ref<HTMLDivElement>()
const view = shallowRef<EditorView | null>(null)
const revision = ref(0)
const mode = ref<EditorMode>('editable')
const findOpen = ref(false)
const outlineOpen = ref(false)
const backlinksOpen = ref(false)
const versionsOpen = ref(false)
const historyId = computed(() => {
  void revision.value
  return view.value ? documentId(view.value.state.doc) : null
})
const slashMenuId = useId()
const { controls, nodeViews } = createControlViews(kit.components)
nodeViews.columns = columnsView(useShellFrame())
const slashMenu = computed(() => {
  void revision.value
  return view.value ? slashKey.getState(view.value.state) : null
})
const loadedStates = new WeakMap<EditorState, string>()
let baseContent = ''
let draftId: string = crypto.randomUUID()
const recovery = shallowRef<{ draft: ArxDraft; saved: string; conflict: boolean } | null>(null)
const recoveryBusy = ref(false)
const recoveryError = ref('')
const draftError = ref('')
const identityPending = ref(false)
const edits = ref(0)
const savedEdits = ref(0)
const saving = ref(false)
const saveError = ref(false)
const saveStatus = computed(() => {
  if (!canSave.value) return loadError.value ? 'Document unavailable' : 'Loading…'
  if (saveError.value) return 'Save failed — retry Save'
  if (saving.value) return 'Saving…'
  return edits.value === savedEdits.value ? 'Saved' : 'Unsaved changes'
})
// Conflicts left in the document by a three-way sync merge (arx-merge.ts) do not block autosave or
// close — the document is perfectly valid with them in, that is the point of representing them in the
// format rather than as a copy beside it — but they are worth a permanent, visible count regardless of
// what else the status line says.
const conflictCount = computed(() => {
  void revision.value
  if (!view.value) return 0
  let count = 0
  view.value.state.doc.descendants((node) => {
    if (node.type.name === 'conflict') count++
  })
  return count
})

// Where the layer IS, while the chords it claims are declared once by the plugin (`hotkeys.ts`).
// Every open `.arx` panel pushes this same layer, and only the one holding the caret is on the stack —
// so ⌘B reaches ProseMirror alone instead of also collapsing the navigation column on its way past the
// window (F-06).
useHotkeyLayer(useHotkeysExtension(), { id: PROSEMIRROR_LAYER, kind: 'editor' }, editorEl)

const keys = buildKeymap(schema)
const interactiveKeys = interactiveKeydown(keys)

// Interactive mode is not editable, and ProseMirror does not deliver keydown to a view that is not —
// see `interactiveKeydown`. Capture, so the chord is answered even while focus sits inside a control's
// own component, which is where ticking a box leaves it.
function historyChord(event: KeyboardEvent) {
  if (view.value && interactiveKeys(view.value, event)) event.preventDefault()
}

function buildPlugins() {
  return [
    modePlugin(mode.value, kit.controls, [
      ...Object.keys(kit.components),
      'image_block',
      'attachment',
      'code_block',
      'section',
      'data_view',
      'conflict',
    ]),
    slashCommands(slashMenuId, kit.commands),
    insertHint(),
    history(),
    blockIdentityPlugin(),
    blockMarqueePlugin(),
    blockSelectionPlugin(),
    assets.plugin,
    codeHighlighting(),
    columnResizing(),
    documentLinksPlugin(
      () => props.path,
      extension.links,
      (error) =>
        toaster.create({ title: 'Could not open link', description: error instanceof Error ? error.message : String(error), type: 'error' }),
    ),
    documentSearchPlugin(() => {
      findOpen.value = true
    }),
    ...kit.plugins(),
    keymap(keys),
    inputRules({ rules: buildInputRules(schema) }),
    tableEditing({ allowTableNodeSelection: true }),
  ]
}

async function buildState(path: string, bytes: Uint8Array): Promise<EditorState> {
  // Only a genuinely-empty file opens an empty document. Anything else is decoded and deserialized
  // as-is — a failure here (corrupt JSON, an incompatible schema) is left to propagate so the shared
  // load hook can route it through the same error path as a read failure, rather than silently
  // substituting an empty document a Save could flush over the original bytes.
  let doc = bytes.length === 0 ? emptyDoc(schema) : deserialize(schema, new TextDecoder().decode(bytes), kit.format)
  let id = documentId(doc)
  if (id && extension.history) {
    try {
      const latest = (await extension.history.list(id))[0]
      if (latest) {
        const previous = await extension.history.read(id, latest)
        if (previous.path !== path && (await vfs.exists(previous.path))) id = null
      }
    } catch (error) {
      arxhub.logger.warn(`[editor] could not inspect history for ${path}; keeping the current document available:`, error)
    }
  }
  doc = identifyBlocks(withDocumentId(doc, id ?? crypto.randomUUID()))
  const state = EditorState.create({ schema, doc, plugins: buildPlugins() })
  loadedStates.set(state, new TextDecoder().decode(bytes))
  return state
}

// Shared composable owns the load lifecycle: staleness guard on rapid file switches, open-empty
// is refused for missing files, and canSave prevents writing over a failed or in-flight read.
const {
  error: loadError,
  canSave,
  reload,
} = useFileDocument<EditorState>(toRef(props, 'path'), {
  retainOnPathChange: true,
  allowMissing: false,
  read: (path) => vfs.read(path),
  build: (path, bytes) => buildState(path, bytes),
  apply: (_path, state) => {
    if (view.value) {
      view.value.updateState(state)
    } else if (editorEl.value) {
      view.value = new EditorView(editorEl.value, {
        state,
        nodeViews,
        dispatchTransaction(tr) {
          if (!view.value) return
          const previous = view.value.state
          const next = previous.applyTransaction(tr).state
          view.value.updateState(next)
          revision.value++
          if (!previous.doc.eq(next.doc)) {
            // Never autosave over a load that hasn't (or can no longer) resolve — `doSave` re-checks
            // canSave at fire time too, but there is no point arming a timer for a run that can only
            // no-op.
            if (canSave.value) {
              edits.value++
              backupDraft()
              if (!recovery.value) autosave.schedule()
            }
          }
        },
      })
    }
    baseContent = loadedStates.get(state) ?? ''
    draftId = crypto.randomUUID()
    recovery.value = null
    try {
      const draft = extension.drafts?.list(props.path).find((entry) => entry.content !== baseContent)
      if (draft) recovery.value = { draft, saved: baseContent, conflict: draft.base !== baseContent }
    } catch (error) {
      draftError.value = error instanceof Error ? error.message : String(error)
    }
    identityPending.value = true
    edits.value = 0
    savedEdits.value = 0
    saveError.value = false
    revision.value++
    if (props.anchor) reveal(props.anchor)
  },
})

watch(
  [mode, canSave, recovery],
  ([selected, ready, pending]) => {
    const current = view.value
    if (current)
      current.dispatch(current.state.tr.setMeta(editorModeKey, ready && !pending ? selected : 'readonly').setMeta(slashKey, 'dismiss'))
  },
  { flush: 'sync' },
)

function warnUnsaved(event: BeforeUnloadEvent) {
  event.preventDefault()
  event.returnValue = ''
}

watch(
  () => edits.value !== savedEdits.value || assets.pending.value > 0,
  (dirty) => {
    if (dirty) window.addEventListener('beforeunload', warnUnsaved)
    else window.removeEventListener('beforeunload', warnUnsaved)
  },
  { flush: 'sync' },
)

function dismissSlash() {
  const current = view.value
  if (current && slashKey.getState(current.state)) current.dispatch(current.state.tr.setMeta(slashKey, 'dismiss'))
}

function closeFind() {
  findOpen.value = false
  const current = view.value
  if (!current) return
  current.dispatch(current.state.tr.setMeta(documentSearchKey, { query: '' }))
  focusDocument(current)
}

function reveal(anchor: BlockAnchor): boolean {
  const current = view.value
  if (current == null) return false
  const selection = revealBlock(current.state.doc, anchor)
  if (!selection) return false
  current.dispatch(current.state.tr.setSelection(selection).scrollIntoView())
  requestAnimationFrame(() => {
    if (!current.isDestroyed) focusDocument(current)
  })
  return true
}

async function copyBlockLink() {
  const current = view.value
  if (!current || !canSave.value) return
  const position = current.state.selection.from
  const block = documentBlocks(current.state.doc).find((item) => {
    const selection = revealBlock(current.state.doc, item.anchor)
    return selection && selection.from <= position && selection.to >= position
  })
  try {
    if (!(await beforeClose())) throw validation('Save the document before copying its link.')
    const href = extension.links?.href ? await extension.links.href(props.path, block?.anchor) : documentHref(props.path, block?.anchor)
    await navigator.clipboard.writeText(href)
    toaster.create({ title: block ? 'Block link copied' : 'Document link copied', type: 'success' })
  } catch {
    toaster.create({ title: 'Could not copy link', description: 'The browser did not allow clipboard access.', type: 'error' })
  }
}

onUnmounted(notes.registerOpenView(() => props.path, reveal, beforeClose))

async function doSave() {
  if (!view.value || !canSave.value) return
  if (recovery.value) throw validation('Resolve the recovery choice before saving.')
  const path = props.path
  const version = edits.value
  saving.value = true
  try {
    const content = serialize(view.value.state.doc, kit.format)
    const saved = new TextDecoder().decode(await vfs.read(path))
    if (saved !== baseContent && saved !== content) {
      recovery.value = { draft: currentDraft(content), saved, conflict: true }
      throw validation('The file changed outside this editor. Choose which version to keep.')
    }
    const id = documentId(view.value.state.doc)
    const write = async () => {
      if (!canSave.value || props.path !== path) throw validation('The document moved or became unavailable while saving. Retry Save.')
      if (new TextDecoder().decode(await vfs.read(path)) !== saved)
        throw validation('The file changed during saving. Retry Save to compare versions.')
      await vfs.write(path, new TextEncoder().encode(content))
      baseContent = content
    }
    if (id && extension.history?.save) await extension.history.save(id, saved, content, path, write)
    else {
      if (id && extension.history) await extension.history.record(id, saved, path)
      await write()
      if (id && extension.history) await extension.history.record(id, content, path)
    }
    identityPending.value = false
    savedEdits.value = version
    if (edits.value === version) {
      try {
        extension.drafts?.remove(draftId)
      } catch (error) {
        draftError.value = String(error)
      }
    } else backupDraft()
    saveError.value = false
  } catch (error) {
    saveError.value = true
    // Don't swallow a failed write — that silently loses the user's edits. Surface it loudly.
    arxhub.logger.error(`[editor] failed to save ${props.path}:`, error)
    toaster.create({ title: 'Save failed', description: `Couldn't save ${props.path}`, type: 'error' })
    throw error
  } finally {
    saving.value = false
  }
}

function currentDraft(content = view.value ? serialize(view.value.state.doc, kit.format) : ''): ArxDraft {
  return { id: draftId, path: props.path, base: baseContent, content, updatedAt: Date.now() }
}
function backupDraft() {
  if (!view.value || !canSave.value || !extension.drafts) return
  try {
    extension.drafts.write(currentDraft())
    draftError.value = ''
  } catch (error) {
    draftError.value = error instanceof Error ? error.message : String(error)
  }
}
async function checkExternal() {
  if (!view.value || !canSave.value || saving.value || recovery.value || !view.value.dom.getClientRects().length) return
  const path = props.path
  try {
    const saved = new TextDecoder().decode(await vfs.read(path))
    if (props.path !== path || saving.value || recovery.value || saved === baseContent) return
    if (edits.value === savedEdits.value) await reload(path)
    else {
      autosave.cancel()
      recovery.value = { draft: currentDraft(), saved, conflict: true }
    }
  } catch {
    /* Save reports read failures while the live buffer remains available. */
  }
}
let externalTimer: ReturnType<typeof setInterval>
onMounted(() => {
  externalTimer = setInterval(checkExternal, 5000)
  window.addEventListener('focus', checkExternal)
})
onUnmounted(
  arxhub.services.get(VaultWatcher).subscribe((change) => {
    if (change.pathname === props.path && change.kind === 'written') queueMicrotask(checkExternal)
  }),
)
async function resolveRecovery(action: 'draft' | 'saved' | 'both') {
  const pending = recovery.value
  if (!pending || !view.value || recoveryBusy.value) return
  recoveryBusy.value = true
  recoveryError.value = ''
  try {
    const path = props.path
    const latest = new TextDecoder().decode(await vfs.read(path))
    if (latest !== pending.saved) {
      recovery.value = { ...pending, saved: latest, conflict: true }
      throw validation('The saved file changed again. Review the latest version.')
    }
    if (action === 'both') {
      const copy = await notes.freePath(dirname(path), `${basename(path, '.arx')} recovered`, '.arx')
      const doc = withDocumentId(deserialize(schema, pending.draft.content, kit.format), crypto.randomUUID())
      await vfs.write(copy, new TextEncoder().encode(serialize(doc, kit.format)))
      extension.drafts?.remove(pending.draft.id)
      recovery.value = null
      await reload(path)
      await extension.links?.open(copy)
    } else if (action === 'saved') {
      extension.drafts?.remove(pending.draft.id)
      recovery.value = null
      await reload(path)
    } else {
      const doc = deserialize(schema, pending.draft.content, kit.format)
      baseContent = pending.saved
      draftId = pending.draft.id
      recovery.value = null
      mode.value = 'editable'
      const tr = view.value.state.tr
        .replaceWith(0, view.value.state.doc.content.size, doc.content)
        .setDocAttribute('arxEnvelope', doc.attrs.arxEnvelope)
      view.value.dispatch(closeHistory(tr))
      backupDraft()
      await autosave.flush()
    }
  } catch (error) {
    recoveryError.value = error instanceof Error ? error.message : String(error)
  } finally {
    recoveryBusy.value = false
  }
}

async function restoreVersion(content: string, block?: string): Promise<void> {
  if (mode.value !== 'editable' || !view.value || !canSave.value) throw validation('Switch to Editable to restore a version.')
  const id = documentId(view.value.state.doc)
  if (!id) throw validation('The document has no history identity.')
  const restored = withDocumentId(deserialize(schema, content, kit.format), id)
  if (!(await beforeClose())) throw validation('Your current draft could not be saved. Retry before restoring a version.')
  const current = view.value
  if (!current || !canSave.value || mode.value !== 'editable') throw validation('The document is no longer editable.')
  const tr = block
    ? restoreVersionBlock(current.state, restored, block)
    : current.state.tr
        .replaceWith(0, current.state.doc.content.size, restored.content)
        .setDocAttribute('arxEnvelope', restored.attrs.arxEnvelope)
  current.dispatch(closeHistory(tr).setSelection(Selection.atStart(tr.doc)).scrollIntoView())
  await autosave.flush()
}

// One write path for both the explicit Save (button / Ctrl+S) and autosave: the explicit path flushes
// the debounce immediately (joining an in-flight autosave rather than racing it with a second write),
// autosave schedules it AUTOSAVE_DEBOUNCE_MS after the last edit.
const autosave = createDebouncedTask({ run: doSave, debounceMs: AUTOSAVE_DEBOUNCE_MS })

async function save() {
  if (mode.value === 'readonly' && savedEdits.value === edits.value) return
  try {
    await autosave.flush()
    // flush() can join a run that was already in flight — it captured the doc as it stood when
    // that run started, which an edit made since (a keystroke, a paste) is not part of. The same
    // staleness beforeClose() loops around below: keep flushing until an edit made up to this call
    // has actually reached storage, rather than reporting success for a save that missed it.
    while (view.value && canSave.value && savedEdits.value !== edits.value) await autosave.flush()
  } catch {
    // doSave has already reported the error; event handlers must not leak a rejected promise.
  }
}

async function beforeClose(): Promise<boolean> {
  if (recovery.value) return false
  try {
    await assets.wait()
    // flush() may join an older in-flight write. Keep the view until all edits made since it began
    // have reached storage too; a failure leaves the buffer available for retry.
    while (savedEdits.value !== edits.value || identityPending.value) {
      if (!view.value || !canSave.value) return false
      await autosave.flush()
    }
    return true
  } catch {
    return false
  }
}

watch(
  () => props.path,
  () => {
    if (!canSave.value) return
    // A rename may have copied the file while an autosave still targeted its old path.
    edits.value++
    backupDraft()
    autosave.schedule()
  },
)

onUnmounted(() => {
  clearInterval(externalTimer)
  window.removeEventListener('focus', checkExternal)
  assets.dispose()
  window.removeEventListener('beforeunload', warnUnsaved)
  autosave.cancel()
  view.value?.destroy()
  view.value = null
})
</script>

<template>
  <div class="editor-panel" @keydown.capture="historyChord" @keydown.ctrl.s.prevent.stop="save" @keydown.meta.s.prevent.stop="save">
    <!-- The name, and nothing else, at the very top (OR-02). The document's tools stay in the band at
         the bottom: on the phone that is where a hand reaches, and reading a document is passive while
         renaming one is rare — which is exactly what earns the name the top. -->
    <Strip>
      <DocumentName :path="path" />
    </Strip>
    <DocumentFind v-if="findOpen && view && canSave" :view="view" :revision="revision" :mode="mode" @close="closeFind" />
    <DocumentOutline v-if="outlineOpen && view && canSave" :view="view" :revision="revision" @close="outlineOpen = false" />
    <DocumentBacklinks v-if="backlinksOpen && extension.links" :links="extension.links" :path="path" @close="backlinksOpen = false" />
    <DocumentVersions v-if="versionsOpen && extension.history && historyId && view" :store="extension.history" :current="view.state.doc" :document-id="historyId" :kit="kit" :mode="mode" :restore="restoreVersion" @close="versionsOpen = false" />
    <DocumentRecovery v-if="recovery" :kit="kit" :saved="recovery.saved" :draft="recovery.draft.content" :conflict="recovery.conflict" :busy="recoveryBusy" :error="recoveryError" @choose="resolveRecovery" />
    <div v-if="draftError" class="editor-error" role="alert"><span>Draft backup unavailable: {{ draftError }}</span><Button variant="secondary" @click="backupDraft()">Retry draft backup</Button></div>
    <div v-if="loadError" class="editor-error">
      <span>{{ (loadError instanceof Error ? loadError.message : String(loadError)) || "Couldn't load this file." }} Saving is disabled.</span>
      <Button :size="buttonSize" variant="secondary" @click="reload(path)">Retry</Button>
    </div>
    <div v-if="assets.error.value" class="editor-error" role="alert">
      <span>{{ assets.error.value }}</span><Button variant="secondary" @click="assets.retry">Retry upload</Button><Button variant="ghost" @click="assets.dismiss">Dismiss</Button>
    </div>
    <div v-show="!loadError" ref="editorEl" class="editor-content" @scroll="dismissSlash" />
    <BlockHandle v-if="view && editorEl && canSave && mode === 'editable'" :view="view" :scroller="editorEl" :revision="revision" :commands="kit.commands" />
    <SelectionFormatting v-if="view && editorEl && canSave && mode === 'editable'" :view="view" :scroller="editorEl" :revision="revision" :links="extension.links" :path="path" />
    <SlashMenu v-if="view && slashMenu && !loadError" :view="view" :menu="slashMenu" :menu-id="slashMenuId" :commands="kit.commands" />
    <div class="editor-status">
      <DocumentTools v-model:mode="mode" :view="view" :revision="revision" :on-save="save" :can-save="canSave" :busy="assets.pending.value > 0" :links="extension.links" :has-history="!!extension.history" :publication-actions="extension.publicationActions?.(path)" :path="path" @find="findOpen = true" @outline="outlineOpen = true" @backlinks="backlinksOpen = true" @copy-link="copyBlockLink" @versions="versionsOpen = true" />
      <span role="status" aria-live="polite">{{ saveStatus }}</span>
      <span v-if="conflictCount" role="status">{{ conflictCount }} conflict{{ conflictCount === 1 ? '' : 's' }}</span>
      <span v-if="assets.pending.value" role="status">Uploading attachment…</span>
      <Button v-if="saveError" variant="ghost" :disabled="!canSave" @click="save">Retry save</Button>
      <span v-if="mode === 'readonly'">Read only · Select and copy text</span>
      <span v-else-if="mode === 'interactive'">Interactive · Change values; text stays protected</span>
    </div>
    <Teleport v-for="control in controls.values()" :key="control.id" :to="control.host">
      <ArxComponentHost :control="control" />
    </Teleport>
  </div>
</template>

<style scoped>
.editor-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.editor-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  flex-shrink: 0;
  min-height: var(--size-md);
  padding: 0 8px;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
  border-top: 1px solid var(--gray-6);
  background: var(--gray-2);
}
.editor-content {
  min-height: 0;
  overscroll-behavior: contain;
  flex: 1;
  overflow-y: auto;
  padding: 24px clamp(44px, 6%, 64px);
  box-sizing: border-box;
}
.editor-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  font-size: var(--font-size-sm);
  color: var(--danger-11);
  background: var(--danger-2);
  border-bottom: 1px solid var(--danger-6);
}
.editor-content :deep(.ProseMirror) {
  outline: none;
  min-height: 200px;
  max-width: 760px;
  margin-inline: auto;
  overflow-wrap: anywhere;
  padding-bottom: 80px;
  font-size: var(--font-size-md);
  line-height: 1.7;
  color: var(--gray-12);
}
.editor-content :deep(.arx-block-selected) {
  outline: 2px solid var(--accent-8);
  outline-offset: 1px;
  background: var(--accent-3);
}
.editor-content :deep(.arx-block-marquee) {
  position: fixed;
  pointer-events: none;
  border: 1px solid var(--accent-8);
  background: color-mix(in srgb, var(--accent-8) 16%, transparent);
  box-sizing: border-box;
  z-index: 1;
}
.editor-content :deep(.arx-find-match) { background: var(--warning-4); }
.editor-content :deep(.arx-find-current) { outline: 2px solid var(--accent-8); outline-offset: 1px; }
.editor-content :deep(.arx-columns-desktop) { display: grid; gap: 24px; align-items: start; }
.editor-content :deep(.arx-columns-mobile) { display: flex; flex-direction: column; gap: 16px; }
.editor-content :deep(.arx-column) { min-width: 0; }
.editor-content :deep(.tableWrapper) { overflow-x: auto; margin-block: 16px; }
.editor-content :deep(table) { border-collapse: collapse; table-layout: fixed; width: 100%; overflow: hidden; }
.editor-content :deep(td), .editor-content :deep(th) { border: 1px solid var(--gray-7); padding: 8px; min-width: 80px; vertical-align: top; position: relative; }
.editor-content :deep(th) { background: var(--gray-3); font-weight: 600; }
.editor-content :deep(.selectedCell) { background: var(--accent-3); }
.editor-content :deep(.column-resize-handle) { position: absolute; inset-block: 0; right: -1px; width: 4px; background: var(--accent-8); pointer-events: none; }
.editor-content :deep(.resize-cursor) { cursor: col-resize; }
.editor-content :deep(details[data-type="section"]) { padding: 8px; border: 1px solid var(--gray-6); border-radius: var(--radius-sm); margin-block: 12px; }
.editor-content :deep(details[data-type="section"] > summary) { cursor: pointer; }
.editor-content :deep(details[data-type="section"] > summary:focus-visible) { outline: 2px solid var(--accent-8); outline-offset: 1px; }
.editor-content :deep(details[data-type="section"] > summary > .arx-control) { display: inline-block; width: calc(100% - 32px); vertical-align: middle; }
.editor-content :deep(.section-content) { padding: 8px; }
.editor-content :deep(.tok-keyword), .editor-content :deep(.tok-operator) { color: var(--info-11); }
.editor-content :deep(.tok-string), .editor-content :deep(.tok-string2) { color: var(--success-11); }
.editor-content :deep(.tok-number), .editor-content :deep(.tok-bool), .editor-content :deep(.tok-atom) { color: var(--warning-11); }
.editor-content :deep(.tok-comment), .editor-content :deep(.tok-meta) { color: var(--gray-11); }
.editor-content :deep(.tok-typeName), .editor-content :deep(.tok-className), .editor-content :deep(.tok-labelName) { color: var(--info-11); }
/* design-ignore DS type ramp: this is the CONTENT of a note, not chrome. A heading inside a document
   scales with the body it sits in, so these are relative to --font-size-md rather than steps of the
   chrome ramp — the ramp has no note-heading step and should not grow one. */
.editor-content :deep(h1) { font-size: 2em; font-weight: 700; margin: 0.67em 0; }
.editor-content :deep(h2) { font-size: 1.5em; font-weight: 600; margin: 0.75em 0; }
.editor-content :deep(h3) { font-size: 1.17em; font-weight: 600; margin: 0.83em 0; }
.editor-content :deep(p) { margin: 0.4em 0; }
.editor-content :deep(ul), .editor-content :deep(ol) { padding-left: 1.75em; margin: 0.4em 0; }
.editor-content :deep(blockquote) {
  border-left: 3px solid var(--gray-6);
  padding-left: 1em;
  color: var(--gray-10);
  margin: 0.5em 0;
}
.editor-content :deep(code) {
  background: var(--gray-3);
  padding: 0.1em 0.35em;
  border-radius: var(--radius-xs);
  font-family: var(--font-mono, monospace);
  /* design-ignore DS type ramp: inline code inside note content, relative to the note body. */
  font-size: 0.875em;
}
.editor-content :deep(pre) {
  background: var(--gray-2);
  border: 1px solid var(--gray-4);
  padding: 1em;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  margin: 0.5em 0;
}
/* design-ignore DS type ramp: code block inside note content, relative to the note body. */
.editor-content :deep(pre code) { background: none; padding: 0; border-radius: 0; font-size: 0.9em; }
.editor-content :deep(hr) { border: none; border-top: 1px solid var(--gray-5); margin: 1.5em 0; }
.editor-content :deep(ul[data-type="task_list"]) { list-style: none; padding-left: 0.25em; }
.editor-content :deep(li[data-type="task_item"]) { display: flex; align-items: baseline; gap: 0.5em; margin: 0.15em 0; }
.editor-content :deep(.task-content > ul[data-type="task_list"]) { padding-left: 1.25em; }
.editor-content :deep(.task-content) { flex: 1; min-width: 0; }
.editor-content :deep(li[data-checked="true"] > .task-content > p) { color: var(--gray-9); text-decoration: line-through; }
/* The paragraph that carries the hint is chosen by `insert-hint.ts`, not by this selector. */
.editor-content :deep(p[data-placeholder])::before {
  content: attr(data-placeholder);
  color: var(--gray-10);
  pointer-events: none;
  float: left;
  height: 0;
}
.editor-content :deep(.callout) {
  border-left: 4px solid var(--gray-6);
  padding: 0.75em 1em;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  margin: 0.75em 0;
  background: var(--gray-2);
}
/* The semantic aliases, not the raw scales they happen to resolve to: a theme remaps info/warning/
   danger/success, and naming blue/yellow/red/green here would opt a callout out of that. */
.editor-content :deep(.callout[data-type="info"]) { border-color: var(--info-8); background: var(--info-2); }
.editor-content :deep(.callout[data-type="warning"]) { border-color: var(--warning-8); background: var(--warning-2); }
.editor-content :deep(.callout[data-type="danger"]) { border-color: var(--danger-8); background: var(--danger-2); }
.editor-content :deep(.callout[data-type="success"]) { border-color: var(--success-8); background: var(--success-2); }
.editor-content :deep(s) { text-decoration: line-through; }
.editor-content :deep(u) { text-decoration: underline; }
.editor-content :deep(mark) { background: var(--warning-4); border-radius: var(--radius-xs); padding: 0 2px; }
/* A link is the second of the two things the accent is spent on, and accent text is step 11. */
.editor-content :deep(a) { color: var(--accent-11); text-decoration: underline; cursor: pointer; }
</style>
