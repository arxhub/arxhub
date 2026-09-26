<script setup lang="ts">
import type { KeyStore } from '@arxhub/plugin-keystore'
import { CreateCode } from '@arxhub/plugin-keystore/ui'
import { computed } from 'vue'
import { type EntryFlow, entryStepNumber } from '../../entry/entry-flow'
import InviteCodeStep from './InviteCodeStep.vue'
import JoinCompareStep from './JoinCompareStep.vue'
import JoinMethodStep from './JoinMethodStep.vue'
import JoinServerStep from './JoinServerStep.vue'
import KeyReceivedStep from './KeyReceivedStep.vue'
import PhraseCheckStep from './PhraseCheckStep.vue'
import PhraseEntryStep from './PhraseEntryStep.vue'
import PhraseRevealStep from './PhraseRevealStep.vue'
import ScanStep from './ScanStep.vue'
import ServerStep from './ServerStep.vue'
import WelcomeStep from './WelcomeStep.vue'

// The first run, one gate screen at a time. Which screen is up, and what each may do, is the flow's;
// this only picks the screen. What differs between the frames is GateLayout's and PinEntry's business.
const props = defineProps<{
  flow: EntryFlow
  // The store the code step locks. Only read while there is no code yet.
  inner: KeyStore
}>()

const step = computed(() => props.flow.step.value)
const kicker = computed(() => {
  const number = entryStepNumber(step.value, props.flow.mode.value)
  return number == null ? '' : `Step ${number} of 4`
})
</script>

<template>
  <WelcomeStep v-if="step === 'welcome'" :flow="flow" />
  <CreateCode
    v-else-if="step === 'create-code'"
    :inner="inner"
    :kicker="kicker"
    :on-done="(store: KeyStore) => flow.codeCreated(store)"
    :on-back="() => flow.back()"
  />
  <PhraseRevealStep v-else-if="step === 'phrase'" :flow="flow" :kicker="kicker" />
  <PhraseCheckStep v-else-if="step === 'check'" :flow="flow" :kicker="kicker" />
  <ServerStep v-else-if="step === 'server'" :flow="flow" :kicker="kicker" />
  <JoinMethodStep v-else-if="step === 'join-method'" :flow="flow" :kicker="kicker" />
  <PhraseEntryStep v-else-if="step === 'join-phrase'" :flow="flow" :kicker="kicker" />
  <JoinServerStep v-else-if="step === 'join-server'" :flow="flow" :kicker="kicker" />
  <ScanStep v-else-if="step === 'join-scan'" :flow="flow" :kicker="kicker" />
  <InviteCodeStep v-else-if="step === 'join-code'" :flow="flow" :kicker="kicker" />
  <JoinCompareStep v-else-if="step === 'join-compare'" :flow="flow" />
  <KeyReceivedStep v-else :flow="flow" />
</template>
