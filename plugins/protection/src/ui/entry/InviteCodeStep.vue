<script setup lang="ts">
import { Button, Field, GateLayout, Input } from '@arxhub/uikit/core'
import { computed, useId } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'

const props = defineProps<{ flow: EntryFlow; kicker: string }>()

const serverId = useId()
const codeId = useId()
const server = computed({
  get: () => props.flow.inviteServer.value,
  set: (value: string) => props.flow.setInviteServer(value),
})
const code = computed({
  get: () => props.flow.inviteCode.value,
  set: (value: string) => props.flow.setInviteCode(value),
})
</script>

<template>
  <GateLayout>
    <template #kicker>{{ kicker }}</template>
    <template #title>Connect by code</template>
    <template #text>
      The server address and the code are both on the first device's screen. The code holds no key: it only finds the invitation.
    </template>

    <Field v-if="flow.serverFixed" label="Server address">
      <p class="fixed">{{ flow.inviteServer.value }}</p>
    </Field>
    <Field v-else label="Server address" :for="serverId">
      <Input
        :id="serverId"
        v-model="server"
        type="url"
        inputmode="url"
        autocomplete="url"
        autocapitalize="off"
        spellcheck="false"
        placeholder="https://hub.example.com"
        data-testid="invite-server"
      />
    </Field>
    <Field label="Invitation code" :for="codeId" :error="flow.inviteError.value">
      <Input
        :id="codeId"
        v-model="code"
        mono
        autocomplete="one-time-code"
        autocapitalize="characters"
        spellcheck="false"
        placeholder="XXXX-XXXX"
        data-testid="invite-code"
        @keydown.enter.prevent="flow.inviteNext()"
      />
    </Field>

    <template #actions>
      <Button block variant="secondary" icon="lu:chevron-left" @click="flow.back()">Back</Button>
      <Button block data-testid="invite-next" @click="flow.inviteNext()">Next</Button>
    </template>
  </GateLayout>
</template>

<style scoped>
.fixed {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--gray-12);
  overflow-wrap: anywhere;
}
</style>
