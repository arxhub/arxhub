<script setup lang="ts">
import { PanelsLayout } from '@arxhub/plugin-panels/ui'
import { MiniAppShell } from '@arxhub/plugin-shell/ui'
import FileTreeView from './FileTreeView.vue'
</script>

<template>
  <MiniAppShell>
    <template #rail>
      <FileTreeView />
    </template>
    <PanelsLayout />
  </MiniAppShell>
</template>
