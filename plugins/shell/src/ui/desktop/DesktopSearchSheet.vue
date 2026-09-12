<script setup lang="ts">
import { Dialog } from '@arxhub/uikit/core'
import SearchSheetList from '../SearchSheetList.vue'
import type { TabTypeRegistry } from '../tab-type-registry'
import type { Workspace } from '../workspace'

// No status block here, unlike the phone's: the desktop keeps status permanently in the bar at the foot
// of the window, and repeating it inside a dialog would state the same thing twice on one screen.
const props = defineProps<{ open: boolean; workspace: Workspace; types: TabTypeRegistry }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Dialog :open="props.open" title="Open or switch to" @update:open="$event || emit('close')">
    <SearchSheetList :open="props.open" :workspace="props.workspace" :types="props.types" @chosen="emit('close')" />
  </Dialog>
</template>
