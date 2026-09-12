<script setup lang="ts">
import { Button } from '@arxhub/uikit/core'
import { useSheet } from './use-sheet'

const { document, calculationError, retryCalculation, saveError, save, reload } = useSheet()
const { loading, error } = document
</script>

<template>
  <div v-if="loading" class="sheet-message" role="status">Opening spreadsheet…</div>
  <div v-if="error" class="sheet-message" role="alert">
    Could not open spreadsheet: {{ error instanceof Error ? error.message : String(error) }}. Saving is disabled.
    <Button variant="secondary" @click="reload">Retry</Button>
  </div>
  <div v-if="calculationError" class="sheet-message" role="alert">
    {{ calculationError }}
    <Button variant="secondary" @click="retryCalculation">Retry calculation</Button>
  </div>
  <div v-if="saveError" class="sheet-message" role="alert">
    {{ saveError }}
    <Button variant="secondary" @click="save">Retry save</Button>
  </div>
</template>

<style scoped>
.sheet-message { padding: 8px 12px; color: var(--danger-11); font-size: var(--font-size-sm); overflow: auto; max-height: 30%; flex-shrink: 0; }
</style>
