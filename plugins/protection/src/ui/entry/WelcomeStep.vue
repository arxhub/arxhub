<script setup lang="ts">
import { GateLayout, Row } from '@arxhub/uikit/core'
import type { EntryFlow } from '../../entry/entry-flow'
import EntryError from './EntryError.vue'

defineProps<{ flow: EntryFlow }>()
</script>

<template>
  <GateLayout center="mobile" mark="lu:lock">
    <template #title>ArxHub</template>
    <template #text>Documents, sheets and notes — on your devices, encrypted with your key.</template>

    <template #actions>
      <EntryError :flow="flow" />
      <Row
        as="button"
        choice
        next
        icon="lu:square-plus"
        label="Create a new vault"
        detail="First device — we'll set a code and a key"
        :disabled="flow.busy.value"
        data-testid="entry-new-vault"
        @click="flow.chooseNew()"
      />
      <Row
        as="button"
        choice
        next
        icon="lu:smartphone"
        label="Connect to my vault"
        detail="I already have ArxHub on another device"
        :disabled="flow.busy.value"
        data-testid="entry-join-vault"
        @click="flow.chooseJoin()"
      />
    </template>
  </GateLayout>
</template>
