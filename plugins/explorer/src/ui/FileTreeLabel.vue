<script setup lang="ts">
import { basename } from '@arxhub/path'
import { Input } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed, nextTick, ref, watch } from 'vue'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'
import { useFileActions } from './use-file-actions'

const props = defineProps<{ node: TreeNode }>()
const explorer = useArxHub().extensions.get(ExplorerExtension)
const actions = useFileActions()
const displayName = computed(() => explorer.displayName(props.node))
const renaming = computed(() => explorer.renamingPath.value === props.node.entry.pathname)
const renameValue = ref('')
const renameWrap = ref<HTMLElement | null>(null)

watch(renaming, async (active) => {
  if (!active) return
  renameValue.value = displayName.value.text
  await nextTick()
  renameWrap.value?.querySelector('input')?.select()
})

function commitRename() {
  if (!renaming.value) return
  const editedName = renameValue.value.trim()
  explorer.renamingPath.value = null
  if (!editedName) return
  // The editor displays the visible name; the domain restores any hidden extension on commit.
  const newName = displayName.value.fullName(editedName)
  if (newName !== basename(props.node.entry.pathname)) {
    actions.runAction(explorer.renameEntry(props.node.entry.pathname, newName), `rename to ${newName}`)
  }
}
</script>

<template>
  <span v-if="renaming" ref="renameWrap">
    <Input
      v-model="renameValue"
      aria-label="New name"
      @keydown.enter.prevent.stop="commitRename"
      @keydown.escape.prevent.stop="explorer.renamingPath.value = null"
      @blur="commitRename"
      @click.stop
    />
  </span>
  <template v-else>{{ displayName.text }}</template>
</template>
