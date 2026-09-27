<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Button, ScrollArea } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { errorText } from '../errors'
import { t } from '../i18n/messages'
import { useSheet } from './use-sheet'

const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const { document, calculationError, retryCalculation, saveError, save, reload } = useSheet()
const { loading, error } = document
</script>

<template>
  <ScrollArea v-if="loading" class="sheet-message">
    <div class="sheet-message-body" role="status">{{ t('messages.opening') }}</div>
  </ScrollArea>
  <ScrollArea v-if="error" class="sheet-message">
    <div class="sheet-message-body" role="alert">
      {{ t('messages.openFailed', { reason: errorText(error) }) }}
      <Button :size="buttonSize" variant="secondary" @click="reload">{{ t('messages.retry') }}</Button>
    </div>
  </ScrollArea>
  <ScrollArea v-if="calculationError" class="sheet-message">
    <div class="sheet-message-body" role="alert">
      {{ errorText(calculationError) }}
      <Button :size="buttonSize" variant="secondary" @click="retryCalculation">{{ t('messages.retryCalculation') }}</Button>
    </div>
  </ScrollArea>
  <ScrollArea v-if="saveError" class="sheet-message">
    <div class="sheet-message-body" role="alert">
      {{ errorText(saveError) }}
      <Button :size="buttonSize" variant="secondary" @click="save">{{ t('messages.retrySave') }}</Button>
    </div>
  </ScrollArea>
</template>

<style scoped>
.sheet-message { color: var(--danger-11); font-size: var(--font-size-sm); max-height: 30%; flex-shrink: 0; }
.sheet-message-body { padding: 8px 12px; }
</style>
