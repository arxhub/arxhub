<script setup lang="ts">
import { Button, Card, GateLayout } from '@arxhub/uikit/core'
import { onBeforeUnmount, ref } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'
import { t } from '../../i18n/messages'
import EntryError from './EntryError.vue'
import PhraseWords from './PhraseWords.vue'

const props = defineProps<{ flow: EntryFlow; kicker: string }>()

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(copiedTimer))

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.flow.words.value.join(' '))
  } catch {
    // A webview without clipboard access leaves the words on screen to be written down, which is what
    // this screen asks for anyway.
    return
  }
  copied.value = true
  clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 2000)
}
</script>

<template>
  <GateLayout width="wide">
    <template #kicker>{{ kicker }}</template>
    <template #title>{{ t('common.recoveryPhrase') }}</template>
    <template #text>{{ t('entry.reveal.text') }}</template>

    <PhraseWords :words="flow.words.value" :veiled="!flow.revealed.value" />
    <Button v-if="!flow.revealed.value" block variant="secondary" icon="lu:eye" data-testid="reveal-phrase" @click="flow.reveal()">
      {{ t('entry.reveal.show') }}
    </Button>
    <Button v-else block variant="ghost" :icon="copied ? 'lu:check' : 'lu:copy'" @click="copy">
      {{ copied ? t('entry.reveal.copied') : t('entry.reveal.copy') }}
    </Button>
    <Card
      notice
      variant="warning"
      icon="lu:triangle-alert"
      :title="t('entry.reveal.warning')"
    />

    <template #actions>
      <EntryError :flow="flow" />
      <Button block variant="secondary" icon="lu:chevron-left" @click="flow.back()">{{ t('common.back') }}</Button>
      <Button block :disabled="!flow.revealed.value" data-testid="phrase-written" @click="flow.writtenDown()">{{ t('entry.reveal.written') }}</Button>
    </template>
  </GateLayout>
</template>
