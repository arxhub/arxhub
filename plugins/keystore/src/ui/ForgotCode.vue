<script setup lang="ts">
import { Button, Card, Interpolated, ModalSurface } from '@arxhub/uikit/core'
import { messages, t } from '../i18n/messages'

defineProps<{ open: boolean; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{ close: []; erase: [] }>()
</script>

<template>
  <ModalSurface :open="open" :title="t('forgot.title')" size="md" @close="emit('close')">
    <p class="copy">{{ t('forgot.lost') }}</p>
    <p class="copy">
      <Interpolated :text="messages.raw('forgot.phrase')">
        <template #phrase><strong>{{ t('forgot.phraseWord') }}</strong></template>
      </Interpolated>
    </p>
    <Card notice variant="warning" icon="lu:triangle-alert" :title="t('forgot.warning')" />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <Button block variant="danger" solid :disabled="busy" data-testid="erase-device" @click="emit('erase')">{{ t('forgot.erase') }}</Button>
  </ModalSurface>
</template>

<style scoped>
.copy {
  margin: 0;
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}

.copy strong {
  color: var(--gray-12);
  font-weight: var(--font-weight-semibold);
}

.error {
  margin: 0;
  color: var(--danger-11);
}
</style>
