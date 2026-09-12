<script setup lang="ts">
import { useHotkeyLayer } from '@arxhub/plugin-hotkeys/ui'
import { type BlockAnchor, NotesExtension } from '@arxhub/plugin-notes/ui'
import { useHotkeysExtension } from '@arxhub/plugin-shell/ui'
import { createDebouncedTask } from '@arxhub/stdlib/scheduling/debounced-task'
import { Button } from '@arxhub/uikit/core'
import { toaster, useArxHub, useFileDocument } from '@arxhub/uikit/hooks'
import { VaultVfs } from '@arxhub/vfs'
import { history } from 'prosemirror-history'
import { inputRules } from 'prosemirror-inputrules'
import { keymap } from 'prosemirror-keymap'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { computed, onUnmounted, provide, ref, shallowRef, toRef, useId, watch } from 'vue'
import { ARX_ASSETS, createAssetSession } from '../asset-session'
import { createAssetStore } from '../assets'
import { blockSelectionPlugin } from '../block-selection'
import { createControlViews } from '../control-views'
import { ArxEditorExtension } from '../editor-extension'
import { deserialize, emptyDoc, serialize } from '../editor-format'
import { buildInputRules } from '../editor-input-rules'
import { buildKeymap } from '../editor-keymap'
import { type EditorMode, editorModeKey, modePlugin } from '../editor-mode'
import { PROSEMIRROR_LAYER } from '../hotkeys'
import { slashCommands, slashKey } from '../slash-commands'
import ArxComponentHost from './ArxComponentHost.vue'
import BlockHandle from './BlockHandle.vue'
import EditorToolbar from './EditorToolbar.vue'
import SlashMenu from './SlashMenu.vue'
import 'prosemirror-view/style/prosemirror.css'

// Fires this long after the last keystroke, mirroring the search plugin's index-queue debounce shape
// (a burst of edits coalesces into one write, not one per keystroke).
defineOptions({ name: 'ArxEditor' })

const AUTOSAVE_DEBOUNCE_MS = 1500

const props = defineProps<{ path: string; anchor?: BlockAnchor }>()

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
const slashMenuId = useId()
const { controls, nodeViews } = createControlViews(kit.components)
const slashMenu = computed(() => {
  void revision.value
  return view.value ? slashKey.getState(view.value.state) : null
})
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

// Where the layer IS, while the chords it claims are declared once by the plugin (`hotkeys.ts`).
// Every open `.arx` panel pushes this same layer, and only the one holding the caret is on the stack —
// so ⌘B reaches ProseMirror alone instead of also collapsing the navigation column on its way past the
// window (F-06).
useHotkeyLayer(useHotkeysExtension(), { id: PROSEMIRROR_LAYER, kind: 'editor' }, editorEl)

function buildPlugins() {
  return [
    modePlugin(mode.value, kit.controls, [...Object.keys(kit.components), 'image_block', 'attachment']),
    slashCommands(slashMenuId, kit.commands),
    history(),
    blockSelectionPlugin(),
    assets.plugin,
    ...kit.plugins(),
    keymap(buildKeymap(schema)),
    inputRules({ rules: buildInputRules(schema) }),
  ]
}

function buildState(_path: string, bytes: Uint8Array): EditorState {
  // Only a genuinely-empty file opens an empty document. Anything else is decoded and deserialized
  // as-is — a failure here (corrupt JSON, an incompatible schema) is left to propagate so the shared
  // load hook can route it through the same error path as a read failure, rather than silently
  // substituting an empty document a Save could flush over the original bytes.
  if (bytes.length === 0) return EditorState.create({ schema, doc: emptyDoc(schema), plugins: buildPlugins() })
  const doc = deserialize(schema, new TextDecoder().decode(bytes))
  return EditorState.create({ schema, doc, plugins: buildPlugins() })
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
          const next = previous.apply(tr)
          view.value.updateState(next)
          revision.value++
          if (!previous.doc.eq(next.doc)) {
            // Never autosave over a load that hasn't (or can no longer) resolve — `doSave` re-checks
            // canSave at fire time too, but there is no point arming a timer for a run that can only
            // no-op.
            if (canSave.value) {
              edits.value++
              autosave.schedule()
            }
          }
        },
      })
    }
    edits.value = 0
    savedEdits.value = 0
    saveError.value = false
    revision.value++
    if (props.anchor) reveal(props.anchor)
  },
})

watch(
  [mode, canSave],
  ([selected, ready]) => {
    const current = view.value
    if (current) current.dispatch(current.state.tr.setMeta(editorModeKey, ready ? selected : 'readonly').setMeta(slashKey, 'dismiss'))
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

function reveal(anchor: BlockAnchor): boolean {
  const current = view.value
  if (current == null) return false
  let found: number | null = null
  current.state.doc.descendants((node, pos) => {
    if (found != null) return false
    if (!node.isTextblock) return true
    const index = node.textContent.toLowerCase().indexOf(anchor.text.toLowerCase())
    if (index >= 0) found = pos + 1 + index
    return false
  })
  if (found == null) return false
  current.dispatch(current.state.tr.setSelection(TextSelection.create(current.state.doc, found, found + anchor.text.length)).scrollIntoView())
  requestAnimationFrame(() => current.focus())
  return true
}

onUnmounted(notes.registerOpenView(() => props.path, reveal, beforeClose))

async function doSave() {
  if (!view.value || !canSave.value) return
  const version = edits.value
  saving.value = true
  try {
    const content = serialize(view.value.state.doc)
    await vfs.write(props.path, new TextEncoder().encode(content))
    savedEdits.value = version
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

// One write path for both the explicit Save (button / Ctrl+S) and autosave: the explicit path flushes
// the debounce immediately (joining an in-flight autosave rather than racing it with a second write),
// autosave schedules it AUTOSAVE_DEBOUNCE_MS after the last edit.
const autosave = createDebouncedTask({ run: doSave, debounceMs: AUTOSAVE_DEBOUNCE_MS })

async function save() {
  if (mode.value === 'readonly' && savedEdits.value === edits.value) return
  try {
    await autosave.flush()
  } catch {
    // doSave has already reported the error; event handlers must not leak a rejected promise.
  }
}

async function beforeClose(): Promise<boolean> {
  try {
    await assets.wait()
    // flush() may join an older in-flight write. Keep the view until all edits made since it began
    // have reached storage too; a failure leaves the buffer available for retry.
    while (savedEdits.value !== edits.value) {
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
    autosave.schedule()
  },
)

onUnmounted(() => {
  assets.dispose()
  window.removeEventListener('beforeunload', warnUnsaved)
  autosave.cancel()
  view.value?.destroy()
  view.value = null
})
</script>

<template>
  <div class="editor-panel" @keydown.ctrl.s.prevent.stop="save" @keydown.meta.s.prevent.stop="save">
    <EditorToolbar v-model:mode="mode" :view="view" :revision="revision" :on-save="save" :can-save="canSave" :commands="kit.commands" :busy="assets.pending.value > 0" />
    <div v-if="loadError" class="editor-error">
      <span>{{ (loadError instanceof Error ? loadError.message : String(loadError)) || "Couldn't load this file." }} Saving is disabled.</span>
      <Button size="sm" variant="secondary" @click="reload(path)">Retry</Button>
    </div>
    <div v-if="assets.error.value" class="editor-error" role="alert">
      <span>{{ assets.error.value }}</span><Button variant="secondary" @click="assets.retry">Retry upload</Button><Button variant="ghost" @click="assets.dismiss">Dismiss</Button>
    </div>
    <div v-show="!loadError" ref="editorEl" class="editor-content" @scroll="dismissSlash" />
    <BlockHandle v-if="view && editorEl && canSave && mode === 'editable'" :view="view" :scroller="editorEl" :revision="revision" />
    <SlashMenu v-if="view && slashMenu && !loadError" :view="view" :menu="slashMenu" :menu-id="slashMenuId" :commands="kit.commands" />
    <div class="editor-status" role="status" aria-live="polite">
      <span>{{ saveStatus }}</span>
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
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding: 4px 12px;
  color: var(--gray-11);
  font-size: var(--font-size-xs);
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
.editor-content :deep(.ProseMirror[data-mode="editable"] > p:only-child:has(> br:only-child))::before {
  content: 'Type / to insert a block';
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
