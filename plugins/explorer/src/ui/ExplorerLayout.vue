<script setup lang="ts">
import { PanelsLayout } from '@arxhub/plugin-panels/ui'
import { MiniAppShell } from '@arxhub/plugin-shell/ui'
import FileTreeView from './FileTreeView.vue'
</script>

<template>
  <MiniAppShell rail-title="Files">
    <template #rail>
      <FileTreeView />
    </template>
    <PanelsLayout tab="Notes" />
  </MiniAppShell>
</template>
