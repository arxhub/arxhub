<script setup lang="ts">
import { Button, Field, GateLayout, Segmented } from '@arxhub/uikit/core'
import type { EntryFlow } from '../../entry/entry-flow'
import EntryError from './EntryError.vue'

defineProps<{ flow: EntryFlow; kicker: string }>()
</script>

<template>
  <GateLayout width="wide">
    <template #kicker>{{ kicker }}</template>
    <template #title>Check the phrase</template>
    <template #text>Pick the words you wrote down — so we know the phrase is recorded correctly.</template>

    <Field
      v-for="question in flow.questions.value"
      :key="question.position"
      :label="`Word #${question.position}`"
      :error="flow.wrongAt(question.position) ? 'Not this word' : null"
    >
      <Segmented
        stretch
        :model-value="flow.picks.value[question.position]"
        :options="question.options.map((word) => ({ value: word, label: word }))"
        :aria-label="`Word #${question.position}`"
        :data-testid="`check-word-${question.position}`"
        @update:model-value="flow.pick(question.position, $event)"
      />
    </Field>

    <template #actions>
      <EntryError :flow="flow" />
      <Button block variant="secondary" icon="lu:chevron-left" @click="flow.back()">Back</Button>
      <Button block variant="ghost" data-testid="skip-check" @click="flow.skipCheck()">Skip the check</Button>
      <Button block :disabled="!flow.checkPassed.value" data-testid="check-next" @click="flow.checkNext()">Next</Button>
    </template>
  </GateLayout>
</template>
