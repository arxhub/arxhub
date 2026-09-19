<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import TypeStageView from './TypeStageView.vue'
import type { TabTypeRegistry } from './tab-type-registry'
import { stagesOf } from './type-stage'
import type { Workspace } from './workspace'

const props = defineProps<{
  workspace: Workspace
  types: TabTypeRegistry
  // What to say when the active type has nothing to draw — where to look differs per frame, and this is
  // the only thing about the stage that does.
  empty: string
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
  <p v-if="nothing" class="nothing">{{ empty }}</p>
</template>

<style scoped>
.nothing {
  margin: 0;
  padding: 24px 16px;
  color: var(--gray-10);
  text-align: center;
}
</style>
