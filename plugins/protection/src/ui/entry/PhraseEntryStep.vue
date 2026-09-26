<script setup lang="ts">
import { Button, GateLayout } from '@arxhub/uikit/core'
import { computed, ref } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'
import EntryError from './EntryError.vue'
import PhraseWords from './PhraseWords.vue'

const props = defineProps<{ flow: EntryFlow; kicker: string }>()

const check = computed(() => props.flow.phraseCheck.value)
const pasteFailed = ref(false)

// The error the phrase earns, most specific first: a word that is not a word at all, then the order.
const problem = computed(() => {
  if (check.value.badIndexes.length > 0) return "This word isn't in the phrase list — check the spelling"
  if (check.value.orderWrong) return "The words are right, but the phrase doesn't add up — check the order"
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
    <template #title>Recovery phrase</template>
    <template #text>In order, as written down on the first device. You can paste the whole phrase.</template>

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
    <p v-else-if="pasteFailed" class="problem" role="alert">This device won't let the app read the clipboard — paste into the first word instead</p>
    <div class="paste">
      <Button variant="ghost" icon="lu:clipboard-paste" data-testid="phrase-paste" @click="paste">Paste from clipboard</Button>
    </div>

    <template v-if="flow.suggestions.value.length > 0" #dock>
      <!-- mousedown.prevent: the field being typed in keeps the focus, so the tap knows which word it completes. -->
      <Button
        v-for="word in flow.suggestions.value"
        :key="word"
        size="sm"
        variant="secondary"
        :data-testid="`phrase-suggestion-${word}`"
        @mousedown.prevent
        @click="flow.pickSuggestion(word)"
        >{{ word }}</Button
      >
    </template>

    <template #actions>
      <EntryError :flow="flow" />
      <Button block variant="secondary" icon="lu:chevron-left" @click="flow.back()">Back</Button>
      <Button block :disabled="!check.valid" data-testid="phrase-next" @click="flow.phraseNext()">Next</Button>
    </template>
  </GateLayout>
</template>

<style scoped>
.problem {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--danger-11);
}

.paste {
  display: flex;
}
</style>
