<script setup lang="ts">
import { PanelsLayout } from '@arxhub/plugin-panels/ui'
import { MiniAppShell } from '@arxhub/plugin-shell/ui'
import SearchRail from './SearchRail.vue'
</script>

<template>
  <!-- The same shape as the explorer, and for the same reason: a result is read where documents are read.
       Searching does not take the owner somewhere else and then hand them back. -->
  <MiniAppShell rail-title="Search">
    <template #rail>
      <SearchRail />
    </template>
    <PanelsLayout tab="Notes" />
  </MiniAppShell>
</template>
