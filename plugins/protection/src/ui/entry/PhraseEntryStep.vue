<script setup lang="ts">
import { Button, GateLayout } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'
import { t } from '../../i18n/messages'
import EntryError from './EntryError.vue'
import PhraseWords from './PhraseWords.vue'

const props = defineProps<{ flow: EntryFlow; kicker: string }>()

// The phone has the paste button a thumb away and a narrow column to fill; the sentence about pasting
// is the desktop's, where a paste is a keyboard shortcut nobody sees.
const touch = useShellFrame() === 'mobile'
const check = computed(() => props.flow.phraseCheck.value)
const pasteFailed = ref(false)

// The error the phrase earns, most specific first: a word that is not a word at all, then the order.
const problem = computed(() => {
  if (check.value.badIndexes.length > 0) return t('entry.phraseEntry.badWord')
  if (check.value.orderWrong) return t('entry.phraseEntry.badOrder')
  return null
})

async function paste(): Promise<void> {
  pasteFailed.value = false
  try {
    props.flow.pastePhrase(await navigator.clipboard.readText())
  } catch {
    // A webview that will not read the clipboard still takes a paste into the first field.
    pasteFailed.value = true
  }
}

// Blurring the field is also what a tap on a suggestion does first; the flow keeps the field until the
// tap lands, because the suggestion buttons keep the focus where it was.
function blurred(index: number): void {
  if (props.flow.phraseFocus.value === index) props.flow.focusWord(null)
}
</script>

<template>
  <GateLayout width="wide">
    <template #kicker>{{ kicker }}</template>
    <template #title>{{ t('common.recoveryPhrase') }}</template>
    <template #text>{{ t('entry.phraseEntry.text') }}{{ touch ? '' : t('entry.phraseEntry.pasteHint') }}</template>

    <PhraseWords
      editable
      :words="flow.phraseWords.value"
      :bad="check.badIndexes"
      :focus="flow.phraseFocus.value"
      @input="(index, text) => flow.setWord(index, text)"
      @focus="(index) => flow.focusWord(index)"
      @blur="blurred"
    />
    <p v-if="problem" class="problem" role="alert" data-testid="phrase-problem">{{ problem }}</p>
    <p v-else-if="pasteFailed" class="problem" role="alert">{{ t('entry.phraseEntry.pasteFailed') }}</p>
    <Button block variant="ghost" icon="lu:clipboard-paste" data-testid="phrase-paste" @click="paste">{{ t('entry.phraseEntry.paste') }}</Button>

    <template v-if="flow.suggestions.value.length > 0" #dock>
      <!-- mousedown.prevent: the field being typed in keeps the focus, so the tap knows which word it completes. -->
      <Button
        v-for="word in flow.suggestions.value"
        :key="word"
        size="md"
        variant="secondary"
        mono
        :data-testid="`phrase-suggestion-${word}`"
        @mousedown.prevent
        @click="flow.pickSuggestion(word)"
        >{{ word }}</Button
      >
    </template>

    <template #actions>
      <EntryError :flow="flow" />
      <Button block variant="secondary" icon="lu:chevron-left" @click="flow.back()">{{ t('common.back') }}</Button>
      <Button block :disabled="!check.valid" data-testid="phrase-next" @click="flow.phraseNext()">{{ t('common.next') }}</Button>
    </template>
  </GateLayout>
</template>

<style scoped>
.problem {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--danger-11);
  text-align: center;
}
</style>
