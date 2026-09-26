<script setup lang="ts">
import { Button, GateLayout } from '@arxhub/uikit/core'
import type { EntryFlow } from '../../entry/entry-flow'
import EntryError from './EntryError.vue'

defineProps<{ flow: EntryFlow }>()
</script>

<template>
  <GateLayout center mark="lu:check">
    <template #title>Key received</template>
    <template #text>The server is already known from the invitation. Now create a code for this device.</template>

    <template #actions>
      <EntryError :flow="flow" />
      <Button block :disabled="flow.busy.value" data-testid="key-received-next" @click="flow.receivedNext()">Next</Button>
    </template>
  </GateLayout>
</template>
