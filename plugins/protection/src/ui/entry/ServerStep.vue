<script setup lang="ts">
import { Button, GateLayout } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'
import EntryError from './EntryError.vue'
import ServerCheck from './ServerCheck.vue'

const props = defineProps<{ flow: EntryFlow; kicker: string }>()

const status = computed(() => props.flow.serverStatus.value)
// A server that answered and holds nothing this phrase cannot read — the one state a vault may start on.
const ready = computed(() => status.value.kind === 'found')
const checking = computed(() => status.value.kind === 'checking')
const text = computed(() =>
  props.flow.serverFixed
    ? 'This vault is kept on the server this page comes from, so your documents are on your other devices too.'
    : 'Connect a server so your documents are on your other devices too. You can do it later in Settings.',
)
</script>

<template>
  <GateLayout>
    <template #kicker>{{ kicker }}</template>
    <template #title>Sync</template>
    <template #text>{{ text }}</template>

    <ServerCheck :flow="flow" purpose="new" />

    <template #actions>
      <EntryError :flow="flow" />
      <!-- A browser bundle's vault is on the server that serves it: there is no device-only vault to start. -->
      <Button v-if="!flow.serverFixed" block variant="ghost" data-testid="server-later" @click="flow.finish(false)">
        Only this device — later
      </Button>
      <Button v-if="ready" block data-testid="server-connect" @click="flow.finish(true)">Connect and start</Button>
      <Button v-else block icon="lu:server" :disabled="checking" data-testid="server-check" @click="flow.checkServer()">
        Check server
      </Button>
    </template>
  </GateLayout>
</template>
