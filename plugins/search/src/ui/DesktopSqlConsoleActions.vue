<script setup lang="ts">
import { Button } from '@arxhub/uikit/core'
import { t } from '../i18n/messages'

defineProps<{
  canRun: boolean
  running: boolean
  schemaOpen: boolean
  onRun: () => void
  onExample: () => void
  onToggleSchema: () => void
}>()
</script>

<template>
  <Button size="sm" :disabled="!canRun" @click="onRun()">{{ running ? t('console.running') : t('console.run') }}</Button>
  <Button size="sm" variant="secondary" @click="onExample()">{{ t('console.example') }}</Button>
  <Button size="sm" variant="secondary" :active="schemaOpen" :aria-pressed="schemaOpen" @click="onToggleSchema()">{{ t('console.schema') }}</Button>
</template>
