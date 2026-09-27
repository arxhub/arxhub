<script setup lang="ts">
import { Button, Card, GateLayout } from '@arxhub/uikit/core'
import { onBeforeUnmount, ref } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'
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
    <template #title>Recovery phrase</template>
    <template #text>12 words — the only way to connect another device or get your vault back if this device is lost.</template>

    <PhraseWords :words="flow.words.value" :veiled="!flow.revealed.value" />
    <Button v-if="!flow.revealed.value" block variant="secondary" icon="lu:eye" data-testid="reveal-phrase" @click="flow.reveal()">
      Show phrase
    </Button>
    <Button v-else block variant="ghost" :icon="copied ? 'lu:check' : 'lu:copy'" @click="copy">
      {{ copied ? 'Copied' : 'Copy' }}
    </Button>
    <Card
      notice
      variant="warning"
      icon="lu:triangle-alert"
      title="Write it on paper. Don't take a screenshot or send it in a messenger. Anyone who knows the phrase gets access to everything."
    />

    <template #actions>
      <EntryError :flow="flow" />
      <Button block variant="secondary" icon="lu:chevron-left" @click="flow.back()">Back</Button>
      <Button block :disabled="!flow.revealed.value" data-testid="phrase-written" @click="flow.writtenDown()">I've written it down</Button>
    </template>
  </GateLayout>
</template>
