<script setup lang="ts">
import { Field, Input, StatusDot } from '@arxhub/uikit/core'
import { computed, useId } from 'vue'
import type { EntryFlow } from '../../entry/entry-flow'
import { type ServerPurpose, serverStatusLine } from '../../entry/server-status-line'

const props = defineProps<{ flow: EntryFlow; purpose: ServerPurpose }>()

const id = useId()
const line = computed(() => serverStatusLine(props.flow.serverStatus.value, props.purpose))
const address = computed({
  get: () => props.flow.address.value,
  set: (value: string) => props.flow.setAddress(value),
})
</script>

<template>
  <div class="server-check">
    <!-- A browser bundle is served by its server, so there is nothing to type: the address is shown,
         and checked, as the page's own origin. -->
    <Field v-if="flow.serverFixed" label="Server address">
      <p class="fixed" data-testid="server-address">{{ flow.address.value }}</p>
    </Field>
    <Field v-else label="Server address" :for="id">
      <Input
        :id="id"
        v-model="address"
        type="url"
        inputmode="url"
        autocomplete="url"
        autocapitalize="off"
        spellcheck="false"
        placeholder="https://hub.example.com"
        data-testid="server-address"
        @keydown.enter.prevent="flow.checkServer()"
      />
    </Field>
    <p v-if="line" class="status" role="status" data-testid="server-status">
      <StatusDot :tone="line.tone" :pulse="line.pending" />
      <span>{{ line.text }}</span>
    </p>
  </div>
</template>

<style scoped>
.server-check {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fixed {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--gray-12);
  overflow-wrap: anywhere;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}
</style>
