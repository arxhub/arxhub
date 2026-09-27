<script setup lang="ts">
import { Button, GateLayout } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'
import { t } from '../../i18n/messages'
import EntryError from './EntryError.vue'
import ServerCheck from './ServerCheck.vue'

const props = defineProps<{ flow: EntryFlow; kicker: string }>()

const status = computed(() => props.flow.serverStatus.value)
// Only a server holding a vault this phrase opens leads on: an empty one is a wrong address or a first
// device that never synced, and either way there is nothing here to download.
const ready = computed(() => status.value.kind === 'found' && !status.value.summary.empty)
const checking = computed(() => status.value.kind === 'checking')
</script>

<template>
  <GateLayout>
    <template #kicker>{{ kicker }}</template>
    <template #title>{{ t('entry.joinServer.title') }}</template>
    <template #text>{{ t('entry.joinServer.text') }}</template>

    <ServerCheck :flow="flow" purpose="join" />

    <template #actions>
      <EntryError :flow="flow" />
      <Button block variant="secondary" icon="lu:chevron-left" @click="flow.back()">{{ t('common.back') }}</Button>
      <Button v-if="ready" block data-testid="server-next" @click="flow.serverNext()">{{ t('common.next') }}</Button>
      <Button v-else block icon="lu:server" :disabled="checking" data-testid="server-check" @click="flow.checkServer()">
        {{ t('entry.joinServer.check') }}
      </Button>
    </template>
  </GateLayout>
</template>
