<script setup lang="ts">
import { Button, GateLayout } from '@arxhub/uikit/core'
import type { EntryFlow } from '../../entry/entry-flow'
import { t } from '../../i18n/messages'
import EntryError from './EntryError.vue'

defineProps<{ flow: EntryFlow }>()
</script>

<template>
  <GateLayout center mark="lu:check">
    <template #title>{{ t('entry.received.title') }}</template>
    <template #text>{{ t('entry.received.text') }}</template>

    <template #actions>
      <EntryError :flow="flow" />
      <Button block :disabled="flow.busy.value" data-testid="key-received-next" @click="flow.receivedNext()">{{ t('common.next') }}</Button>
    </template>
  </GateLayout>
</template>
