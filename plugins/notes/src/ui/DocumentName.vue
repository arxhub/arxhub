<script setup lang="ts">
import { Input } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, nextTick, ref } from 'vue'
import { NotesExtension } from '../notes-extension'

// What an open object is called, at the top of whatever is showing it (OR-02). It lives with the type
// rather than in each viewer because a viewer's business is the content — five copies of "the name,
// and clicking it renames" would be five chances for them to disagree about what a name is.
//
// It is the top of the panel on the phone too, deliberately: reading a document is passive and
// renaming one is rare, and the top of a phone screen is where a rare thing belongs.
const props = defineProps<{ path: string }>()

const arxhub = useArxHub()
const notes = arxhub.extensions.get(NotesExtension)
const touch = useShellFrame() === 'mobile'

// OR-03: the name as every other surface shows it — the tree hid a known extension while this strip
// spelled it out, which is the product contradicting itself about one file on one screen. The field
// therefore holds exactly what is on screen, and `fullName` glues the hidden tail back on.
const name = computed(() => notes.displayName(props.path))

const renaming = ref(false)
const draft = ref('')
// A wrapper ref rather than one on <Input>: the ref would be the component instance, and reaching
// through it for the native element needs a cast strict mode has no honest form for (the same trade
// the explorer's inline rename makes).
const field = ref<HTMLElement | null>(null)

async function start(): Promise<void> {
  draft.value = name.value.text
  renaming.value = true
  await nextTick()
  field.value?.querySelector('input')?.select()
}

function cancel(): void {
  renaming.value = false
}

// Blur commits, so clicking away is not a silent discard — and the guard is what keeps Escape from
// committing through the blur its own unmount fires.
function commit(): void {
  if (!renaming.value) return
  const typed = draft.value.trim()
  renaming.value = false
  if (typed === '' || typed === name.value.text) return
  const renamed = name.value.fullName(typed)
  // A rename started by a click has to report its own failure: a rejected write with only a log entry
  // behind it is indistinguishable from a name that simply did not change. It names the whole file,
  // extension and all — what was typed is only part of it while one is hidden.
  notes.renameObject(props.path, renamed).catch((error: unknown) => {
    arxhub.logger.error(`[notes] failed to rename ${props.path} to ${renamed}:`, error)
    const message = error instanceof Error ? error.message : String(error ?? '')
    toaster.create({
      type: 'error',
      title: `Could not rename to ${renamed}`,
      description: message.trim() || 'The reason was not reported — see the log.',
    })
  })
}
</script>

<template>
  <span class="document-name" :class="{ editing: renaming, touch }">
    <span v-if="renaming" ref="field" class="document-name-field">
      <Input v-model="draft" aria-label="New name" @keydown.enter.prevent.stop="commit" @keydown.escape.prevent.stop="cancel" @blur="commit" @click.stop />
    </span>
    <!-- The full path as the native tooltip and nothing on screen: what tells two "Contract.md" apart
         is already the tab's own second line, and a second copy of it would spend the strip's only
         row on a repeat. -->
    <button v-else type="button" class="document-name-button" :title="path" data-testid="document-name" @click="start">{{ name.text }}</button>
  </span>
</template>

<style scoped>
/* Basis 0: the name takes whatever slack the strip has — so the formatting keys and the Save beside it
   keep their place as the name changes length from document to document — and gives ALL of it back
   before anything else shrinks. That order is what keeps the keys reachable on a phone, where a long
   name and a toolbar do not both fit and something has to yield first. */
.document-name,
.document-name-field {
  display: flex;
  align-items: center;
  flex: 1 1 0;
  min-width: 0;
}

/* The field is capped where the label is not: an input spanning a desktop panel reads as a search bar,
   and the name it holds is never that long. */
.document-name.editing {
  max-width: 320px;
}

/* The Control role's height inside the Strip's: the name is something you press, so it carries a
   pressable box rather than being bare text that happens to react. */
.document-name-button {
  max-width: 100%;
  height: var(--size-xs);
  padding: 0 8px;
  border: none;
  border-radius: var(--radius-xs);
  background: none;
  color: var(--gray-12);
  font: inherit;
  font-weight: var(--font-weight-medium);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-name.touch .document-name-button {
  height: var(--size-md);
}

.document-name-button:hover {
  background: var(--gray-4);
}

.document-name-button:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}
</style>
