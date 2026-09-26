<script setup lang="ts">
import { BottomSheet } from '@arxhub/uikit/core'
import type { TabType } from '../tab-type'

// A type's navigation over the whole screen — the vault behind Documents. Reached from the type's second-tap
// sheet rather than from a key of its own: the phone has one road into a type's second level, and the
// tree is a step further down it, not a third control in the row.
const props = defineProps<{ open: boolean; type: TabType | null }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <BottomSheet
    :open="props.open && props.type?.nav != null"
    variant="full"
    :title="props.type?.nav?.title ?? props.type?.title ?? ''"
    @close="emit('close')"
  >
    <component :is="props.type.nav.component" v-if="props.type?.nav != null" />
  </BottomSheet>
</template>

