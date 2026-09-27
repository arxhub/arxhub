<script setup lang="ts">
import { Button, Field, GateLayout, Input } from '@arxhub/uikit/core'
import { computed, useId } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'
import { t } from '../../i18n/messages'

const props = defineProps<{ flow: EntryFlow; kicker: string }>()

// What an address and a code look like, not words: the same in every language.
const EXAMPLE_SERVER = 'https://hub.example.com'
const CODE_SHAPE = 'XXXX-XXXX'
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
    <template #title>{{ t('entry.invite.title') }}</template>
    <template #text>{{ t('entry.invite.text') }}</template>

    <Field v-if="flow.serverFixed" :label="t('common.serverAddress')">
      <p class="fixed">{{ flow.inviteServer.value }}</p>
    </Field>
    <Field v-else :label="t('common.serverAddress')" :for="serverId">
      <Input
        :id="serverId"
        v-model="server"
        type="url"
        inputmode="url"
        autocomplete="url"
        autocapitalize="off"
        spellcheck="false"
        :placeholder="EXAMPLE_SERVER"
        data-testid="invite-server"
      />
    </Field>
    <Field :label="t('entry.invite.code')" :for="codeId" :error="flow.inviteError.value">
      <Input
        :id="codeId"
        v-model="code"
        mono
        autocomplete="one-time-code"
        autocapitalize="characters"
        spellcheck="false"
        :placeholder="CODE_SHAPE"
        data-testid="invite-code"
        @keydown.enter.prevent="flow.inviteNext()"
      />
    </Field>

    <template #actions>
      <Button block variant="secondary" icon="lu:chevron-left" @click="flow.back()">{{ t('common.back') }}</Button>
      <Button block data-testid="invite-next" @click="flow.inviteNext()">{{ t('common.next') }}</Button>
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
