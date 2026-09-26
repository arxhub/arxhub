<script setup lang="ts">
import { EmptyState } from '@arxhub/uikit/core'
import { computed, ref, watch } from 'vue'
import TypeStageView from './TypeStageView.vue'
import type { TabTypeRegistry } from './tab-type-registry'
import { stagesOf } from './type-stage'
import type { Workspace } from './workspace'

const props = defineProps<{
  workspace: Workspace
  types: TabTypeRegistry
  // Where to look when the active type has nothing to draw — that differs per frame, and it is the only
  // thing about the stage that does.
  hint: string
}>()

const activeTypeId = computed(() => props.workspace.activeTypeId.value)

// The order of first visit. A type is mounted by being entered, keeps its instance for as long as it is
// open, and gets a fresh one if it is closed and entered again — closing a type is the person saying
// they are done with it. Ids leave this list when the type leaves the row (SF-01), so a closed type
// unmounts and cannot remount on a stale key order.
const mounted = ref<string[]>([])
watch(
  activeTypeId,
  (id) => {
    if (id != null && !mounted.value.includes(id)) mounted.value = [...mounted.value, id]
  },
  { immediate: true },
)
// `stagesOf` already skips types no longer in the row; dropping them here too keeps the mounted list
// honest — a closed type unmounts AND leaves no stale id that would remount on the wrong key order.
watch(
  () => props.workspace.openTypeIds.value,
  (open) => {
    const live = new Set(open)
    const pruned = mounted.value.filter((id) => live.has(id))
    if (pruned.length !== mounted.value.length) mounted.value = pruned
  },
)

const stages = computed(() => stagesOf(props.workspace, props.types, mounted.value))
const nothing = computed(() => !stages.value.some((it) => it.typeId === activeTypeId.value))
</script>

<template>
  <TypeStageView v-for="stage in stages" :key="stage.typeId" :view="stage.view" :type-id="stage.typeId" :visible="stage.typeId === activeTypeId" />
  <EmptyState v-if="nothing" fill icon="lu:layers" text="Nothing is open." :hint="hint" />
</template>
