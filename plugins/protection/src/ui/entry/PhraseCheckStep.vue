<script setup lang="ts">
import { Button, Field, GateLayout, Segmented } from '@arxhub/uikit/core'
import type { EntryFlow } from '../../entry/entry-flow'
import { t } from '../../i18n/messages'
import EntryError from './EntryError.vue'

defineProps<{ flow: EntryFlow; kicker: string }>()
</script>

<template>
  <GateLayout>
    <template #kicker>{{ kicker }}</template>
    <template #title>{{ t('entry.check.title') }}</template>
    <template #text>{{ t('entry.check.text') }}</template>

    <Field
      v-for="question in flow.questions.value"
      :key="question.position"
      :label="t('entry.check.word', { number: question.position })"
      :error="flow.wrongAt(question.position) ? t('entry.check.wrong') : null"
    >
      <Segmented
        stretch
        mono
        :invalid="flow.wrongAt(question.position)"
        :model-value="flow.picks.value[question.position]"
        :options="question.options.map((word) => ({ value: word, label: word }))"
        :aria-label="t('entry.check.word', { number: question.position })"
        :data-testid="`check-word-${question.position}`"
        @update:model-value="flow.pick(question.position, $event)"
      />
    </Field>

    <template #actions>
      <EntryError :flow="flow" />
      <Button block variant="secondary" icon="lu:chevron-left" @click="flow.back()">{{ t('common.back') }}</Button>
      <Button block variant="ghost" data-testid="skip-check" @click="flow.skipCheck()">{{ t('entry.check.skip') }}</Button>
      <Button block :disabled="!flow.checkPassed.value" data-testid="check-next" @click="flow.checkNext()">{{ t('common.next') }}</Button>
    </template>
  </GateLayout>
</template>
