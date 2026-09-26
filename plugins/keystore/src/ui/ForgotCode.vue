<script setup lang="ts">
import { Button, Card, ModalSurface } from '@arxhub/uikit/core'

defineProps<{ open: boolean; busy?: boolean; error?: string | null }>()
const emit = defineEmits<{ close: []; erase: [] }>()
</script>

<template>
  <ModalSurface :open="open" title="Forgot the code?" size="sm" @close="emit('close')">
    <p class="copy">The code can't be recovered — without it the key on this device can't be read. That's what protects your data.</p>
    <p class="copy">
      If you have the recovery phrase and your vault is on a server, you won't lose anything: erase this device and connect it again.
    </p>
    <Card variant="warning" icon="lu:triangle-alert" title="Without the phrase and a server, this device's documents will be lost." />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <Button block variant="danger" :disabled="busy" data-testid="erase-device" @click="emit('erase')">Erase and connect again</Button>
  </ModalSurface>
</template>

<style scoped>
.copy {
  margin: 0;
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}

.error {
  margin: 0;
  color: var(--danger-11);
}
</style>
