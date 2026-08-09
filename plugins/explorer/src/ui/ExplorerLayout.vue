<script setup lang="ts">
import { PanelsLayout } from '@arxhub/plugin-panels/ui'
import { MiniAppShell } from '@arxhub/plugin-shell/ui'
import { useShellFrame } from '@arxhub/uikit/hooks'
import FileTreeView from './FileTreeView.vue'
import ExplorerMobileRail from './mobile/ExplorerMobileRail.vue'

// Desktop's rail stays exactly the file tree it always was. Mobile's gets a switcher on top of it —
// Files (the same tree), Tabs (the open-documents list "Notes" used to be a separate bottom-bar key
// for), and whatever else contributes a section (Search, on mobile only) — because a phone has no room
// to spare on three destinations that all end up looking at the same vault.
const isMobile = useShellFrame() === 'mobile'
</script>

<template>
  <MiniAppShell rail-title="Files">
    <template #rail>
      <ExplorerMobileRail v-if="isMobile" />
      <FileTreeView v-else />
    </template>
    <PanelsLayout />
  </MiniAppShell>
</template>
