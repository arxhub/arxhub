<script setup lang="ts">
import { Button, GateLayout, Row } from '@arxhub/uikit/core'
import type { EntryFlow } from '../../entry/entry-flow'
import { t } from '../../i18n/messages'

defineProps<{ flow: EntryFlow; kicker: string }>()
</script>

<template>
  <GateLayout>
    <template #kicker>{{ kicker }}</template>
    <template #title>{{ t('entry.method.title') }}</template>
    <template #text>{{ t('entry.method.text') }}</template>

    <div class="choices">
      <Row
        as="button"
        choice
        next
        icon="lu:key-round"
        :label="t('entry.method.phrase')"
        :detail="t('entry.method.phraseDetail')"
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
        :label="flow.camera != null ? t('entry.method.scan') : t('entry.method.code')"
        :detail="t('entry.method.invitationDetail')"
        data-testid="join-by-invitation"
        @click="flow.joinByInvitation()"
      />
    </div>

    <template #actions>
      <Button block variant="ghost" icon="lu:chevron-left" @click="flow.back()">{{ t('common.back') }}</Button>
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
