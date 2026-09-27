<script setup lang="ts">
import { type ActionItem, ActionMenuButton, Button } from '@arxhub/uikit/core'
import { t } from '../i18n/messages'

const props = defineProps<{
  canRun: boolean
  running: boolean
  schemaOpen: boolean
  onRun: () => void
  onExample: () => void
  onToggleSchema: () => void
}>()

function items(): ActionItem[] {
  return [
    { id: 'example', label: t('console.example'), icon: 'lu:sparkles', onSelect: props.onExample },
    {
      id: 'schema',
      label: props.schemaOpen ? t('console.hideSchema') : t('console.showSchema'),
      icon: 'lu:table',
      onSelect: props.onToggleSchema,
    },
  ]
}
</script>

<template>
  <!-- Run is the commit; Example/Schema are occasional — behind More on a narrow strip. -->
  <Button size="lg" :disabled="!canRun" @click="onRun()">{{ running ? t('console.running') : t('console.run') }}</Button>
  <ActionMenuButton :label="t('console.more')" :title="t('console.title')" :items="items" />
</template>
