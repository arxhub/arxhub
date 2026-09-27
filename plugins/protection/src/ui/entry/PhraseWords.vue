<script setup lang="ts">
import { Input } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { type ComponentPublicInstance, nextTick, watch } from 'vue'
import { t } from '../../i18n/messages'

// The twelve words, numbered, three to a line on the phone and four on the desktop's wider column — the order a person copies them onto paper in, and the
// order they type them back in on another device. One cell for both, so the phrase a device shows and
// the phrase a device asks for look like the same thing.
const props = defineProps<{
  words: readonly string[]
  // Blurred until the person asks for them: a phrase must not be on screen by surprise, in front of
  // whoever else is looking.
  veiled?: boolean
  // Each cell is a field to type the word into.
  editable?: boolean
  // Cells holding something that is not a word of the list.
  bad?: readonly number[]
  // The cell being typed in; moved by the flow when a suggestion is taken or a paste fills the rest.
  focus?: number | null
}>()

const emit = defineEmits<{
  input: [index: number, text: string]
  focus: [index: number]
  blur: [index: number]
}>()

const desk = useShellFrame() !== 'mobile'
const fields: (HTMLInputElement | null)[] = []

function bind(index: number, instance: Element | ComponentPublicInstance | null): void {
  fields[index] = instance == null ? null : ((instance as ComponentPublicInstance).$el as HTMLInputElement)
}

watch(
  () => props.focus,
  async (index) => {
    if (!props.editable || index == null) return
    await nextTick()
    const field = fields[index]
    if (field != null && document.activeElement !== field) field.focus()
  },
)

// Space or Enter ends a word: the next field, as a person reads the phrase aloud.
function onKeydown(index: number, event: KeyboardEvent): void {
  if (event.key !== ' ' && event.key !== 'Enter') return
  event.preventDefault()
  fields[index + 1]?.focus()
}
</script>

<template>
  <ol class="words" :class="{ veiled, editable, desk }" :aria-hidden="veiled || undefined" data-testid="phrase-words">
    <li v-for="(word, index) in words" :key="index" class="word" :class="{ bad: bad?.includes(index), filled: word !== '' }">
      <span class="number">{{ index + 1 }}</span>
      <Input
        v-if="editable"
        :ref="(el) => bind(index, el)"
        variant="bare"
        :model-value="word"
        :aria-label="t('entry.phraseEntry.word', { number: index + 1 })"
        :aria-invalid="bad?.includes(index) || undefined"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="next"
        :data-testid="`phrase-word-${index + 1}`"
        @update:model-value="emit('input', index, $event ?? '')"
        @focus="emit('focus', index)"
        @blur="emit('blur', index)"
        @keydown="onKeydown(index, $event)"
      />
      <span v-else class="text">{{ word }}</span>
    </li>
  </ol>
</template>

<style scoped>
.words {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.words.desk {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.word {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: var(--size-md);
  padding: 0 8px;
  box-sizing: border-box;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-1);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
}

/* A field to type into is a control, and takes the control's border step once it holds something. */
.editable .word.filled {
  border-color: var(--gray-7);
}

.editable .word:focus-within {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.editable .word.bad {
  border-color: var(--danger-8);
  background: var(--danger-2);
}

.number {
  flex: none;
  width: 16px;
  color: var(--gray-10);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.veiled .text {
  filter: blur(6px);
  user-select: none;
}
</style>
