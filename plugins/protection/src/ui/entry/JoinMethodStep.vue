<script setup lang="ts">
import { Button, GateLayout, Row } from '@arxhub/uikit/core'
import type { EntryFlow } from '../../entry/entry-flow'

defineProps<{ flow: EntryFlow; kicker: string }>()
</script>

<template>
  <GateLayout>
    <template #kicker>{{ kicker }}</template>
    <template #title>How to connect</template>
    <template #text>This device will get the same key as the first one and will be able to open the vault.</template>

    <div class="choices">
      <Row
        as="button"
        choice
        next
        icon="lu:key-round"
        label="Enter the 12-word phrase"
        detail="The recovery phrase from your first device"
        data-testid="join-by-phrase"
        @click="flow.joinByPhrase()"
      />
      <!-- The invitation road stays reachable without a camera: its typed code is the same invitation. -->
      <Row
        v-if="flow.canPair"
        as="button"
        choice
        next
        icon="lu:qr-code"
        :label="flow.camera != null ? 'Scan the QR from the first device' : 'Enter the invitation code'"
        detail="Settings → Security → Connect a device on the first one"
        data-testid="join-by-invitation"
        @click="flow.joinByInvitation()"
      />
    </div>

    <template #actions>
      <Button block variant="ghost" icon="lu:chevron-left" @click="flow.back()">Back</Button>
    </template>
  </GateLayout>
</template>

<style scoped>
.choices {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
