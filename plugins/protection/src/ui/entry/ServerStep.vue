<script setup lang="ts">
import { Button, GateLayout } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'
import { t } from '../../i18n/messages'
import EntryError from './EntryError.vue'
import ServerCheck from './ServerCheck.vue'

const props = defineProps<{ flow: EntryFlow; kicker: string }>()

const status = computed(() => props.flow.serverStatus.value)
// A server that answered and holds nothing this phrase cannot read — the one state a vault may start on.
const ready = computed(() => status.value.kind === 'found')
const checking = computed(() => status.value.kind === 'checking')
const text = computed(() => (props.flow.serverFixed ? t('entry.server.textFixed') : t('entry.server.text')))
</script>

<template>
  <GateLayout>
    <template #kicker>{{ kicker }}</template>
    <template #title>{{ t('entry.server.title') }}</template>
    <template #text>{{ text }}</template>

    <ServerCheck :flow="flow" purpose="new" />

    <template #actions>
      <EntryError :flow="flow" />
      <!-- A browser bundle's vault is on the server that serves it: there is no device-only vault to start. -->
      <Button v-if="!flow.serverFixed" block variant="ghost" data-testid="server-later" @click="flow.finish(false)">
        {{ t('entry.server.later') }}
      </Button>
      <Button v-if="ready" block data-testid="server-connect" @click="flow.finish(true)">{{ t('entry.server.connect') }}</Button>
      <Button v-else block icon="lu:server" :disabled="checking" data-testid="server-check" @click="flow.checkServer()">
        {{ t('entry.server.check') }}
      </Button>
    </template>
  </GateLayout>
</template>
