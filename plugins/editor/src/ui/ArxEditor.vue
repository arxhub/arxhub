<script setup lang="ts">
import { validation } from '@arxhub/errors'
import { basename, dirname } from '@arxhub/path'
import { type BlockAnchor, DocumentsExtension } from '@arxhub/plugin-documents'
import { useHotkeyLayer } from '@arxhub/plugin-hotkeys/ui'
import { useHotkeysExtension } from '@arxhub/plugin-shell/ui'
import { createDebouncedTask } from '@arxhub/stdlib/scheduling/debounced-task'
// biome-ignore lint/style/useImportType: ScrollArea is also rendered in the template, not only read as a type
import { actionMenu, Button, ScrollArea } from '@arxhub/uikit/core'
import { toaster, useArxHub, useFileDocument, useKeyboardInset, usePanelChrome, useShellFrame } from '@arxhub/uikit/hooks'
import { VaultVfs, VaultWatcher } from '@arxhub/vfs'
import { closeHistory, history } from 'prosemirror-history'
import { inputRules } from 'prosemirror-inputrules'
import { keymap } from 'prosemirror-keymap'
import { EditorState, Selection } from 'prosemirror-state'
import { columnResizing, tableEditing } from 'prosemirror-tables'
import { EditorView } from 'prosemirror-view'
import { computed, h, markRaw, nextTick, onMounted, onUnmounted, provide, ref, shallowRef, toRef, useId, watch } from 'vue'
import { ARX_ASSETS, createAssetSession } from '../asset-session'
import { createAssetStore } from '../assets'
import { blockIdentityPlugin, identifyBlocks } from '../block-identity'
import { blockMarqueePlugin } from '../block-marquee'
import { blockSelectionPlugin } from '../block-selection'
import { inspect, inspectorPlugin } from '../block-settings'
import { codeHighlighting } from '../code-highlighting'
import { columnsView } from '../columns-view'
import { createControlViews } from '../control-views'
import { type DocumentAppearance as Appearance, changeAppearance, documentAppearance } from '../document-appearance'
import { documentBarMenu, documentBarSub, editorModeMenu, modeLabel } from '../document-bar'
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
import { renameTitleEcho, selectionAfterEcho, titleEcho } from '../title-echo'
import { restoreVersionBlock } from '../version-diff'
import ArxComponentHost from './ArxComponentHost.vue'
import ArxEditingToolbar from './ArxEditingToolbar.vue'
import BlockHandle from './BlockHandle.vue'
import BlockSettingsHandle from './BlockSettingsHandle.vue'
import DocumentAppearance from './DocumentAppearance.vue'
import DocumentBacklinks from './DocumentBacklinks.vue'
import DocumentChrome from './DocumentChrome.vue'
import DocumentFind from './DocumentFind.vue'
import DocumentOutline from './DocumentOutline.vue'
import DocumentPageHeader from './DocumentPageHeader.vue'
import DocumentRecovery from './DocumentRecovery.vue'
import DocumentTools from './DocumentTools.vue'
import DocumentVersionsPage from './DocumentVersionsPage.vue'
import EditorInspector from './EditorInspector.vue'
import LinkDialog from './LinkDialog.vue'
import SelectionFormatting from './SelectionFormatting.vue'
import SlashMenu from './SlashMenu.vue'
import 'prosemirror-view/style/prosemirror.css'
import { editorError, reasonText } from '../errors'
import { t } from '../i18n/messages'

// Fires this long after the last keystroke, mirroring the search plugin's index-queue debounce shape
// (a burst of edits coalesces into one write, not one per keystroke).
defineOptions({ name: 'ArxEditor' })

const AUTOSAVE_DEBOUNCE_MS = 1500

const props = defineProps<{ path: string; anchor?: BlockAnchor }>()
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const touch = useShellFrame() === 'mobile'

const arxhub = useArxHub()
const extension = arxhub.extensions.get(ArxEditorExtension)
const kit = extension.kit
const { schema } = kit
const vfs = arxhub.services.get(VaultVfs)
const assets = createAssetSession(extension.assets ?? createAssetStore(vfs))
provide(ARX_ASSETS, assets)
const documents = arxhub.extensions.get(DocumentsExtension)
const editorArea = ref<InstanceType<typeof ScrollArea> | null>(null)
const editorEl = computed(() => editorArea.value?.viewport ?? undefined)
const editorBody = ref<HTMLElement>()
const editorMount = ref<HTMLDivElement>()
const appearanceOpen = ref(false)
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
  if (!canSave.value) return loadError.value ? t('status.unavailable') : t('status.loading')
  if (saveError.value) return t('status.saveFailedRetry')
  if (saving.value) return t('status.saving')
  return edits.value === savedEdits.value ? t('status.saved') : t('status.unsaved')
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
useHotkeyLayer(useHotkeysExtension(), { id: PROSEMIRROR_LAYER, kind: 'editor' }, editorMount)

const keys = buildKeymap(schema)
const interactiveKeys = interactiveKeydown(keys)

// Interactive mode is not editable, and ProseMirror does not deliver keydown to a view that is not —
// see `interactiveKeydown`. Capture, so the chord is answered even while focus sits inside a control's
// own component, which is where ticking a box leaves it.
function historyChord(event: KeyboardEvent) {
  if (view.value && interactiveKeys(view.value, event)) event.preventDefault()
}

function buildPlugins(name: string) {
  return [
    titleEcho(name),
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
    inspectorPlugin(),
    blockMarqueePlugin(() => editorEl.value),
    blockSelectionPlugin(),
    assets.plugin,
    codeHighlighting(),
    columnResizing(),
    documentLinksPlugin(
      () => props.path,
      extension.links,
      (error) => toaster.create({ title: t('toast.linkOpenFailed'), description: reasonText(error), type: 'error' }),
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
  documentAppearance(doc)
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
  const name = documents.displayName(path).text
  const state = EditorState.create({ schema, doc, plugins: buildPlugins(name), selection: selectionAfterEcho(doc, name) })
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
    } else if (editorMount.value) {
      view.value = new EditorView(editorMount.value, {
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
      draftError.value = reasonText(error)
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
// scroll does not bubble, so a listener on the ScrollArea component would sit on its root and never fire.
watch(editorEl, (el, _, cleanup) => {
  if (!el) return
  el.addEventListener('scroll', dismissSlash)
  cleanup(() => el.removeEventListener('scroll', dismissSlash))
})

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
    toaster.create({ title: block ? t('toast.blockLinkCopied') : t('toast.documentLinkCopied'), type: 'success' })
  } catch {
    toaster.create({ title: t('toast.copyFailed'), description: t('toast.clipboardDenied'), type: 'error' })
  }
}

onUnmounted(documents.registerOpenView(() => props.path, reveal, beforeClose))

async function doSave() {
  if (!view.value || !canSave.value) return
  if (recovery.value) throw editorError('RecoveryPendingError')
  const path = props.path
  const version = edits.value
  saving.value = true
  try {
    const content = serialize(view.value.state.doc, kit.format)
    const saved = new TextDecoder().decode(await vfs.read(path))
    if (saved !== baseContent && saved !== content) {
      recovery.value = { draft: currentDraft(content), saved, conflict: true }
      throw editorError('FileChangedOutsideError')
    }
    const id = documentId(view.value.state.doc)
    const write = async () => {
      if (!canSave.value || props.path !== path) throw editorError('DocumentMovedWhileSavingError')
      if (new TextDecoder().decode(await vfs.read(path)) !== saved) throw editorError('FileChangedWhileSavingError')
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
        draftError.value = reasonText(error)
      }
    } else backupDraft()
    saveError.value = false
  } catch (error) {
    saveError.value = true
    // Don't swallow a failed write — that silently loses the user's edits. Surface it loudly.
    arxhub.logger.error(`[editor] failed to save ${props.path}:`, error)
    toaster.create({ title: t('status.saveFailed'), description: t('toast.saveFailedPath', { path: props.path }), type: 'error' })
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
    draftError.value = reasonText(error)
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
      throw editorError('SavedFileChangedAgainError')
    }
    if (action === 'both') {
      const copy = await documents.freePath(dirname(path), t('document.recoveredName', { name: basename(path, '.arx') }), '.arx')
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
    recoveryError.value = reasonText(error)
  } finally {
    recoveryBusy.value = false
  }
}

const displayName = computed(() => documents.displayName(props.path).text)
watch(displayName, (name) => {
  const current = view.value
  if (current && !current.isDestroyed) current.dispatch(renameTitleEcho(current.state.tr, name))
})

// The versions page stands in the editor's own column rather than over it, so the buffer it compares against and
// restores into stays mounted underneath — unsaved text and undo survive the visit.
async function closeVersions(): Promise<void> {
  versionsOpen.value = false
  await nextTick()
  const current = view.value
  if (current && !current.isDestroyed) focusDocument(current)
}

async function restoreVersion(content: string, block?: string): Promise<void> {
  if (mode.value !== 'editable' || !view.value || !canSave.value) throw editorError('RestoreNeedsEditableError')
  const id = documentId(view.value.state.doc)
  if (!id) throw editorError('NoHistoryIdentityError')
  const restored = withDocumentId(deserialize(schema, content, kit.format), id)
  if (!(await beforeClose())) throw editorError('DraftNotSavedError')
  const current = view.value
  if (!current || !canSave.value || mode.value !== 'editable') throw editorError('DocumentNotEditableError')
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
const appearance = computed(() => {
  void revision.value
  return view.value ? documentAppearance(view.value.state.doc) : { icon: null, cover: null }
})

watch(
  [() => props.path, appearance],
  ([path, value]) => {
    if (view.value && canSave.value) extension.documentIcons?.set(path, value.icon)
  },
  { immediate: true },
)
function applyAppearance(value: Appearance) {
  if (view.value && canSave.value && mode.value === 'editable') changeAppearance(view.value, value)
  appearanceOpen.value = false
}
// The phone's object band: the type draws it, the editor describes what only it knows. The desktop frame
// never reads it, so the same description is registered in both frames rather than branched on one.
//
// The editing toolbar belongs to the caret in THIS document. A field that is not the document — find, a
// dialog, a control's own input — raises the keyboard too, and formatting keys aimed at the text would be
// a lie there, so the band steps aside instead.
const documentFocused = ref(false)
function trackFocus(event: FocusEvent): void {
  const target = event.type === 'focusin' ? event.target : event.relatedTarget
  documentFocused.value = target instanceof Node && view.value != null && view.value.dom.contains(target)
}
onMounted(() => {
  document.addEventListener('focusin', trackFocus)
  document.addEventListener('focusout', trackFocus)
})
onUnmounted(() => {
  document.removeEventListener('focusin', trackFocus)
  document.removeEventListener('focusout', trackFocus)
})
const offersEditing = computed(() => documentFocused.value && mode.value !== 'readonly')
// While the keyboard is up the phone's band IS the formatting toolbar, so a selection's bubble would be a
// second copy of the same keys one thumb-width above it — one concept, one control. The desktop has no
// band, and a phone without the keyboard up has none either, so the bubble stays there.
const keyboardInset = useKeyboardInset()
const editingBandUp = computed(() => touch && keyboardInset.value > 0 && offersEditing.value)
// Hosted here and not in the toolbar: opening it takes focus out of the document, which takes the
// toolbar off the band — and a dialog inside the toolbar would go with it.
const bandLinkOpen = ref(false)
// One component for the life of this editor: the band compares it by identity, and a new one per render
// would remount the toolbar on every keystroke.
const editing = markRaw({
  name: 'ArxEditingBar',
  render: () =>
    view.value == null
      ? null
      : h(ArxEditingToolbar, { view: view.value, revision: revision.value, mode: mode.value, onLink: () => (bandLinkOpen.value = true) }),
})
function pickMode(current: EditorMode): void {
  actionMenu.open(
    editorModeMenu(current, (next) => {
      mode.value = next
    }),
    { title: t('modes.title') },
  )
}
const barMenu = computed(() =>
  documentBarMenu(
    {
      mode: mode.value,
      canSave: canSave.value,
      busy: assets.pending.value > 0,
      hasLinks: extension.links != null,
      hasHistory: extension.history != null,
      publication: extension.publicationActions?.(props.path) ?? [],
    },
    {
      outline: () => (outlineOpen.value = true),
      find: () => (findOpen.value = true),
      properties: () => {
        if (view.value) inspect(view.value, { kind: 'page' })
      },
      versions: () => (versionsOpen.value = true),
      mode: pickMode,
      appearance: () => (appearanceOpen.value = true),
      save: () => void save(),
      backlinks: () => (backlinksOpen.value = true),
      copyLink: () => void copyBlockLink(),
    },
  ),
)
onUnmounted(
  documents.registerViewBar(
    () => props.path,
    () => ({
      sub: documentBarSub({
        canSave: canSave.value,
        loadError: loadError.value != null,
        saveError: saveError.value,
        saving: saving.value,
        uploading: assets.pending.value > 0,
        unsaved: edits.value !== savedEdits.value,
        mode: mode.value,
      }),
      menu: barMenu.value,
      editing: offersEditing.value ? editing : undefined,
    }),
  ),
)

const chromeTarget = usePanelChrome(() => ({
  icon: appearance.value.icon ?? undefined,
  status: loadError.value
    ? { icon: 'lu:triangle-alert', label: t('status.unavailable'), tone: 'danger' }
    : !canSave.value
      ? { icon: 'lu:loader-circle', label: t('status.loadingDocument') }
      : saveError.value
        ? { icon: 'lu:triangle-alert', label: t('status.saveFailed'), tone: 'danger' }
        : assets.pending.value
          ? { icon: 'lu:upload', label: t('status.uploading') }
          : saving.value
            ? { icon: 'lu:loader-circle', label: t('status.saving') }
            : edits.value !== savedEdits.value
              ? { icon: 'lu:circle-dot', label: t('status.unsaved') }
              : undefined,
  mode: mode.value === 'editable' ? undefined : modeLabel(mode.value),
}))
</script>

<template>
  <div class="editor-panel" :class="{ touch }" @keydown.capture="historyChord" @keydown.ctrl.s.prevent.stop="save" @keydown.meta.s.prevent.stop="save">
    <DocumentFind v-if="findOpen && view && canSave" :view="view" :revision="revision" :mode="mode" @close="closeFind" />
    <DocumentOutline v-if="outlineOpen && view && canSave" :view="view" :revision="revision" @close="outlineOpen = false" />
    <DocumentBacklinks v-if="backlinksOpen && extension.links" :links="extension.links" :path="path" @close="backlinksOpen = false" />
    <DocumentRecovery v-if="recovery" :kit="kit" :saved="recovery.saved" :draft="recovery.draft.content" :conflict="recovery.conflict" :busy="recoveryBusy" :error="recoveryError" @choose="resolveRecovery" />
    <div v-if="draftError" class="editor-error" role="alert"><span>{{ t('panel.draftBackupUnavailable', { reason: draftError }) }}</span><Button :size="buttonSize" variant="secondary" @click="backupDraft()">{{ t('panel.retryDraftBackup') }}</Button></div>
    <div v-if="loadError" class="editor-error">
      <span>{{ t('panel.savingDisabled', { reason: reasonText(loadError) || t('panel.loadFailed') }) }}</span>
      <Button :size="buttonSize" variant="secondary" @click="reload(path)">{{ t('panel.retry') }}</Button>
    </div>
    <div v-if="assets.error.value" class="editor-error" role="alert">
      <span>{{ assets.error.value }}</span><Button :size="buttonSize" variant="secondary" @click="assets.retry">{{ t('panel.retryUpload') }}</Button><Button :size="buttonSize" variant="ghost" @click="assets.dismiss">{{ t('panel.dismiss') }}</Button>
    </div>
    <div v-if="saveError" class="editor-error" role="alert"><span>{{ t('panel.saveFailedKept') }}</span><Button :size="buttonSize" variant="ghost" :disabled="!canSave" @click="save">{{ t('panel.retrySave') }}</Button></div>
    <div v-if="conflictCount" class="editor-warning" role="status">{{ t('panel.conflicts', { count: conflictCount }) }}</div>
    <DocumentAppearance v-if="appearanceOpen" :appearance="appearance" @apply="applyAppearance" @close="appearanceOpen = false" />
    <DocumentVersionsPage v-if="versionsOpen && extension.history && historyId && view" :store="extension.history" :current="view.state.doc" :revision="revision" :document-id="historyId" :kit="kit" :mode="mode" :path="path" :title="displayName" :restore="restoreVersion" @close="closeVersions" />
    <div v-show="!versionsOpen" ref="editorBody" class="editor-body">
    <ScrollArea v-show="!loadError" ref="editorArea" class="editor-scroll" viewport-class="editor-content" content-class="editor-document">
      <DocumentPageHeader :path="path" :appearance="appearance" :disabled="!canSave || mode !== 'editable'" />
      <div ref="editorMount" />
    </ScrollArea>
    <BlockHandle v-if="view && editorEl && editorBody && canSave && mode === 'editable'" :view="view" :scroller="editorEl" :panel="editorBody" :revision="revision" :commands="kit.commands" />
    <SelectionFormatting v-if="view && editorEl && editorBody && canSave && mode === 'editable' && !editingBandUp" :view="view" :scroller="editorEl" :panel="editorBody" :revision="revision" :links="extension.links" :path="path" />
    <SlashMenu v-if="view && slashMenu && !loadError" :view="view" :menu="slashMenu" :menu-id="slashMenuId" :commands="kit.commands" />
    <BlockSettingsHandle v-if="view && editorEl && editorBody && canSave && mode === 'editable'" :view="view" :scroller="editorEl" :panel="editorBody" :revision="revision" :components="kit.components" />
    <EditorInspector v-if="view && canSave" :view="view" :revision="revision" :kit="kit" :mode="mode" :path="path" />
    </div>
    <DocumentChrome v-show="!(touch && versionsOpen)" :target="chromeTarget" :status="assets.pending.value ? t('status.uploading') : saveStatus" :mode="mode">
      <DocumentTools v-model:mode="mode" :view="view" :revision="revision" :on-save="save" :can-save="canSave" :busy="assets.pending.value > 0" :links="extension.links" :has-history="!!extension.history" :publication-actions="extension.publicationActions?.(path)" :path="path" :on-appearance="() => appearanceOpen = true" @properties="view && inspect(view, { kind: 'page' })" @find="findOpen = true" @outline="outlineOpen = true" @backlinks="backlinksOpen = true" @copy-link="copyBlockLink" @versions="versionsOpen = true" />
    </DocumentChrome>
    <LinkDialog v-if="bandLinkOpen && view" :view="view" :links="extension.links" :path="path" @close="bandLinkOpen = false" />
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
.editor-warning { padding: 8px 12px; color: var(--warning-11); background: var(--warning-2); font-size: var(--font-size-sm); }
.editor-panel.touch .editor-scroll :deep(.editor-content) { padding-inline: 56px; }
.editor-body { position: relative; display: flex; flex: 1; min-height: 0; min-width: 0; container-type: inline-size; }
.editor-scroll { flex: 1; }
/* The inset stays on the viewport, the element that scrolls, as it was on the old container: a pointerdown
   in that margin (or in the empty space under a short document) must land on the scroller itself, which
   is where the block marquee starts. */
.editor-scroll :deep(.editor-content) {
  overscroll-behavior: contain;
  padding: 24px clamp(44px, 6%, 64px);
  box-sizing: border-box;
}
.editor-scroll :deep(.editor-document) { flex: none; }
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
.editor-scroll :deep(.ProseMirror) {
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
.editor-scroll :deep(.arx-block-selected) {
  outline: 2px solid var(--accent-8);
  outline-offset: 1px;
  background: var(--accent-3);
}
.editor-scroll :deep(.arx-block-marquee) {
  position: fixed;
  pointer-events: none;
  border: 1px solid var(--accent-8);
  background: color-mix(in srgb, var(--accent-8) 16%, transparent);
  box-sizing: border-box;
  z-index: 1;
}
/* The first heading that repeats the document's name (title-echo.ts): the name above the body is the title. */
.editor-scroll :deep(.arx-title-echo) { display: none; }
.editor-scroll :deep(.arx-find-match) { background: var(--warning-4); }
.editor-scroll :deep(.arx-find-current) { outline: 2px solid var(--accent-8); outline-offset: 1px; }
.editor-scroll :deep(.arx-columns-desktop) { display: grid; gap: 24px; align-items: start; }
.editor-scroll :deep(.arx-columns-mobile) { display: flex; flex-direction: column; gap: 16px; }
.editor-scroll :deep(.arx-column) { min-width: 0; }
/* design-ignore DS-1 ScrollArea: prosemirror-tables creates this wrapper inside the editable DOM, where a
   Vue component cannot be mounted; a wide table scrolls natively as part of the note's content. */
.editor-scroll :deep(.tableWrapper) { overflow-x: auto; margin-block: 16px; }

.editor-scroll :deep(table) { border-collapse: collapse; table-layout: fixed; width: 100%; overflow: hidden; }
.editor-scroll :deep(td), .editor-scroll :deep(th) { border: 1px solid var(--gray-7); padding: 8px; min-width: 80px; vertical-align: top; position: relative; }
.editor-scroll :deep(th) { background: var(--gray-3); font-weight: 600; }
.editor-scroll :deep(.selectedCell) { background: var(--accent-3); }
.editor-scroll :deep(.column-resize-handle) { position: absolute; inset-block: 0; right: -1px; width: 4px; background: var(--accent-8); pointer-events: none; }
.editor-scroll :deep(.resize-cursor) { cursor: col-resize; }
.editor-scroll :deep(details[data-type="section"]) { padding: 8px; border: 1px solid var(--gray-6); border-radius: var(--radius-sm); margin-block: 12px; }
.editor-scroll :deep(details[data-type="section"] > summary) { cursor: pointer; }
.editor-scroll :deep(details[data-type="section"] > summary:focus-visible) { outline: 2px solid var(--accent-8); outline-offset: 1px; }
.editor-scroll :deep(details[data-type="section"] > summary > .arx-control) { display: inline-block; width: calc(100% - 32px); vertical-align: middle; }
.editor-scroll :deep(.section-content) { padding: 8px; }
.editor-scroll :deep(.tok-keyword), .editor-scroll :deep(.tok-operator) { color: var(--info-11); }
.editor-scroll :deep(.tok-string), .editor-scroll :deep(.tok-string2) { color: var(--success-11); }
.editor-scroll :deep(.tok-number), .editor-scroll :deep(.tok-bool), .editor-scroll :deep(.tok-atom) { color: var(--warning-11); }
.editor-scroll :deep(.tok-comment), .editor-scroll :deep(.tok-meta) { color: var(--gray-11); }
.editor-scroll :deep(.tok-typeName), .editor-scroll :deep(.tok-className), .editor-scroll :deep(.tok-labelName) { color: var(--info-11); }
/* design-ignore DS type ramp: this is the CONTENT of a note, not chrome. A heading inside a document
   scales with the body it sits in, so these are relative to --font-size-md rather than steps of the
   chrome ramp — the ramp has no note-heading step and should not grow one. */
.editor-scroll :deep(h1) { font-size: 2em; font-weight: 700; margin: 0.67em 0; }
.editor-scroll :deep(h2) { font-size: 1.5em; font-weight: 600; margin: 0.75em 0; }
.editor-scroll :deep(h3) { font-size: 1.17em; font-weight: 600; margin: 0.83em 0; }
/* design-ignore DS type ramp: note content again. A phone column is a third of a desktop one, so 2em/1.5em
   headings wrap after two words there; 26px and 20px over the 16px touch body. */
.editor-panel.touch .editor-scroll :deep(.ProseMirror h1) { font-size: 1.625em; }
.editor-panel.touch .editor-scroll :deep(.ProseMirror h2) { font-size: 1.25em; }
.editor-scroll :deep(p) { margin: 0.4em 0; }
.editor-scroll :deep(ul), .editor-scroll :deep(ol) { padding-left: 1.75em; margin: 0.4em 0; }
.editor-scroll :deep(blockquote) {
  border-left: 3px solid var(--gray-6);
  padding-left: 1em;
  color: var(--gray-10);
  margin: 0.5em 0;
}
.editor-scroll :deep(code) {
  background: var(--gray-3);
  padding: 0.1em 0.35em;
  border-radius: var(--radius-xs);
  font-family: var(--font-mono, monospace);
  /* design-ignore DS type ramp: inline code inside note content, relative to the note body. */
  font-size: 0.875em;
}
/* design-ignore DS-1 ScrollArea: a code block is ProseMirror-rendered note content (contenteditable), not
   chrome; its long lines keep the native horizontal scroll a reader expects of code. */
.editor-scroll :deep(pre) {
  background: var(--gray-2);
  border: 1px solid var(--gray-4);
  padding: 1em;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  margin: 0.5em 0;
}

/* The box is the whole block, so its header (language, Copy) sits inside it rather than floating above. */
.editor-scroll :deep(div[data-type="code_block"]) {
  background: var(--gray-2);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  overflow: hidden;
  margin: 0.5em 0;
}
.editor-scroll :deep(div[data-type="code_block"] > pre) { margin: 0; border: 0; border-radius: 0; background: none; padding: 12px; }
/* design-ignore DS type ramp: code block inside note content, relative to the note body. */
.editor-scroll :deep(pre code) { background: none; padding: 0; border-radius: 0; font-size: 0.9em; }
.editor-scroll :deep(hr) { border: none; border-top: 1px solid var(--gray-5); margin: 1.5em 0; }
.editor-scroll :deep(ul[data-type="task_list"]) { list-style: none; padding-left: 0.25em; }
.editor-scroll :deep(li[data-type="task_item"]) { display: flex; align-items: flex-start; gap: 8px; margin: 0.15em 0; }
/* An empty box has no text baseline, so it is centred on the first line explicitly: one line box tall, and
   offset by the same top margin the first paragraph carries. */
.editor-scroll :deep(li[data-type="task_item"] > .arx-control) { display: flex; align-items: center; flex: none; height: 1.7em; margin-top: 0.4em; }
.editor-scroll :deep(.task-content > ul[data-type="task_list"]) { padding-left: 1.25em; }
.editor-scroll :deep(.task-content) { flex: 1; min-width: 0; }
.editor-scroll :deep(li[data-checked="true"] > .task-content > p) { color: var(--gray-9); text-decoration: line-through; }
/* The paragraph that carries the hint is chosen by `insert-hint.ts`, not by this selector. */
.editor-scroll :deep(p[data-placeholder])::before {
  content: attr(data-placeholder);
  color: var(--gray-10);
  pointer-events: none;
  float: left;
  height: 0;
}
.editor-scroll :deep(.callout) {
  border-left: 4px solid var(--gray-6);
  padding: 0.75em 1em;
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  margin: 0.75em 0;
  background: var(--gray-2);
}
/* The semantic aliases, not the raw scales they happen to resolve to: a theme remaps info/warning/
   danger/success, and naming blue/yellow/red/green here would opt a callout out of that. */
.editor-scroll :deep(.callout[data-type="info"]) { border-color: var(--info-8); background: var(--info-2); }
.editor-scroll :deep(.callout[data-type="warning"]) { border-color: var(--warning-8); background: var(--warning-2); }
.editor-scroll :deep(.callout[data-type="danger"]) { border-color: var(--danger-8); background: var(--danger-2); }
.editor-scroll :deep(.callout[data-type="success"]) { border-color: var(--success-8); background: var(--success-2); }
.editor-scroll :deep(s) { text-decoration: line-through; }
.editor-scroll :deep(u) { text-decoration: underline; }
.editor-scroll :deep(mark) { background: var(--warning-4); border-radius: var(--radius-xs); padding: 0 2px; }
/* A link is the second of the two things the accent is spent on, and accent text is step 11. */
.editor-scroll :deep(a) { color: var(--accent-11); text-decoration: underline; cursor: pointer; }
</style>
