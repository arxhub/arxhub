<script setup lang="ts">
import { useHotkeyLayer } from '@arxhub/plugin-hotkeys/ui'
import { type BlockAnchor, DocumentName, NotesExtension } from '@arxhub/plugin-notes/ui'
import { useHotkeysExtension } from '@arxhub/plugin-shell/ui'
import { createDebouncedTask } from '@arxhub/stdlib/scheduling/debounced-task'
import { Button, Strip } from '@arxhub/uikit/core'
import { toaster, useArxHub, useFileDocument } from '@arxhub/uikit/hooks'
import { VaultVfs } from '@arxhub/vfs'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { EditorState, Prec } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { basicSetup, EditorView } from 'codemirror'
import { computed, onUnmounted, ref, shallowRef, toRef, watch } from 'vue'
import { findOccurrence } from '../document-reveal'
import { editorTheme } from '../editor-theme'
import { CODEMIRROR_LAYER } from '../hotkeys'
import { insertLink, toggleBold, toggleInlineCode, toggleItalic } from '../markdown-commands'
import { isMarkdown, markdownProfile } from '../markdown-profile'
import MarkdownToolbar from './MarkdownToolbar.vue'

// Fires this long after the last keystroke, mirroring the search plugin's index-queue debounce shape
// (a burst of edits coalesces into one write, not one per keystroke) and the ProseMirror editor's own
// autosave, so the two note editors behave identically.
const AUTOSAVE_DEBOUNCE_MS = 1500

const props = defineProps<{ path: string; anchor?: BlockAnchor }>()

// ⌘⇧K for the link, not ⌘K: the plain chord is the application's global "open or switch to" (F-10), and
// a key that means one thing everywhere except inside a note is a key the owner cannot trust. CodeMirror
// binds the shifted chord as its own, so the global listener — which ignores anything carrying shift —
// never sees it.
const markdownKeymap = [
  { key: 'Mod-b', run: toggleBold },
  { key: 'Mod-i', run: toggleItalic },
  { key: 'Mod-e', run: toggleInlineCode },
  { key: 'Mod-Shift-k', run: insertLink },
]

const arxhub = useArxHub()
const vfs = arxhub.services.get(VaultVfs)
const notes = arxhub.extensions.get(NotesExtension)
const editorEl = ref<HTMLDivElement>()
// shallowRef so the markdown toolbar can reach the live view; the view is not reactive data.
const view = shallowRef<EditorView | null>(null)
const note = computed(() => isMarkdown(props.path))
// Bumped on every selection/doc change (see the updateListener below) so the toolbar's active-state
// highlighting has a reactive reason to recompute — mutating `view.value` in place never gives Vue one.
const revision = ref(0)
let edits = 0
let savedEdits = 0

// Where the layer IS, while the chords it claims are declared once by the plugin (`hotkeys.ts`). The
// layer is on the stack only while the caret is inside the text — which is what makes ⌘B mean "bold"
// here and "collapse the navigation column" everywhere else, instead of meaning both at once (F-06).
//
// `editorEl` and not the panel root: focus on the toolbar is not the caret in the note, and the
// library's keymap does not fire there either. And only for a note: the markdown keymap below is
// installed for a note alone, so over a code file this editor claims nothing and ⌘B collapses the
// column. That condition is the layer's rather than each binding's because the layer is per open
// panel while the four chords are declared once for every panel — see `declareCodeMirrorChords`.
const noteEditorEl = computed(() => (note.value ? editorEl.value : null))
useHotkeyLayer(useHotkeysExtension(), { id: CODEMIRROR_LAYER, kind: 'editor' }, noteEditorEl)

async function buildState(path: string, bytes: Uint8Array): Promise<EditorState> {
  const doc = new TextDecoder().decode(bytes)
  // Markdown gets the note profile — the document-like presentation and formatting keys — instead of
  // the plain code-editor language support. Everything else stays a code file.
  const note = isMarkdown(path)
  const langDesc = note ? null : LanguageDescription.matchFilename(languages, path)
  const langSupport = langDesc ? await langDesc.load() : null
  return EditorState.create({
    doc,
    extensions: [
      basicSetup,
      // A note is prose: no band on the caret's line. Passed rather than overridden downstream, so
      // there is one rule and no precedence race between two themes setting the same property.
      editorTheme({ activeLine: !note }),
      // Prec.high, and not a matter of taste: ⌘⇧K is `deleteLine` in CodeMirror's own default keymap,
      // which `basicSetup` installs at higher precedence than anything declared after it — so the plain
      // binding emptied the line instead of inserting a link. A note gives the chord up; a code file,
      // which never gets this keymap, keeps it.
      ...(note ? [markdownProfile(), Prec.high(keymap.of(markdownKeymap))] : []),
      ...(langSupport ? [langSupport] : []),
      // Guard on transactions: a programmatic setState() during a file switch reports docChanged but
      // carries no transaction, so it must NOT autosave — a plain file switch would immediately
      // re-write the file it just opened.
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) revision.value++
        if (update.docChanged && update.transactions.length > 0 && canSave.value) {
          edits++
          autosave.schedule()
        }
      }),
    ],
  })
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
    if (view.value) view.value.setState(state)
    else if (editorEl.value) view.value = new EditorView({ state, parent: editorEl.value })
    if (props.anchor) reveal(props.anchor)
  },
})

// Markdown carries no block identity (A-29) — `anchor.blockId` is an `.arx` thing and never set here —
// so the only address a hit can give is the text itself and which occurrence of it this is.
function reveal(anchor: BlockAnchor): boolean {
  const current = view.value
  if (current == null) return false
  const text = current.state.doc.toString()
  const from = findOccurrence(text, anchor.text, anchor.skip ?? 0)
  if (from < 0) return false
  current.dispatch({ selection: { anchor: from, head: from + anchor.text.length }, scrollIntoView: true })
  requestAnimationFrame(() => current.focus())
  return true
}

onUnmounted(notes.registerOpenView(() => props.path, reveal, beforeClose))

async function doSave() {
  if (!view.value || !canSave.value) return
  const saving = edits
  try {
    await vfs.write(props.path, new TextEncoder().encode(view.value.state.doc.toString()))
    savedEdits = saving
  } catch (error) {
    // Don't swallow — a failed write silently loses edits.
    arxhub.logger.error(`[codemirror] failed to save ${props.path}:`, error)
    toaster.create({ title: 'Save failed', description: `Couldn't save ${props.path}`, type: 'error' })
    throw error
  }
}

// One write path for both the explicit Save (button / Ctrl+S) and autosave: the explicit path flushes
// the debounce immediately (joining an in-flight autosave rather than racing it with a second write),
// autosave schedules it AUTOSAVE_DEBOUNCE_MS after the last edit.
const autosave = createDebouncedTask({ run: doSave, debounceMs: AUTOSAVE_DEBOUNCE_MS })

async function save() {
  await autosave.flush()
}

async function beforeClose(): Promise<boolean> {
  try {
    // flush() may join an older in-flight write. Keep the view until all edits made since it began
    // have reached storage too; a failure leaves the buffer available for retry.
    while (savedEdits !== edits) {
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
    edits++
    autosave.schedule()
  },
)

onUnmounted(() => {
  autosave.cancel()
  view.value?.destroy()
  view.value = null
})
</script>

<template>
  <div class="codemirror-wrapper" @keydown.ctrl.s.prevent.stop="save" @keydown.meta.s.prevent.stop="save">
    <!-- One strip, not two. The name and the formatting keys used to sit on separate rows, which put
         three bands of chrome (tab strip, path, toolbar) above every note before a word of it showed. -->
    <Strip>
      <DocumentName :path="path" />
      <MarkdownToolbar v-if="note && !loadError" :view="view" :revision="revision" />
      <template #actions>
        <Button variant="secondary" :disabled="!canSave" @click="save">Save</Button>
      </template>
    </Strip>
    <div v-if="loadError" class="codemirror-error">
      <span>Couldn't load this file. Saving is disabled to avoid overwriting it.</span>
      <Button size="sm" variant="secondary" @click="reload(path)">Retry</Button>
    </div>
    <div v-show="!loadError" ref="editorEl" class="codemirror-editor" />
  </div>
</template>

<style scoped>
.codemirror-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.codemirror-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  font-size: var(--font-size-xs);
  color: var(--danger-11);
  background: var(--danger-2);
  border-bottom: 1px solid var(--danger-6);
}

.codemirror-editor {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.codemirror-editor :deep(.cm-editor) {
  height: 100%;
  font-size: var(--font-size-sm);
}

.codemirror-editor :deep(.cm-scroller) {
  overflow: auto;
  font-family: var(--font-mono, monospace);
}
</style>
