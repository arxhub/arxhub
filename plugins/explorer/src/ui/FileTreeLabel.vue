<script setup lang="ts">
import { basename } from '@arxhub/path'
import { InlineNameInput } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed, ref, watch } from 'vue'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'
import { useFileActions } from './use-file-actions'

const props = defineProps<{ node: TreeNode }>()
const explorer = useArxHub().extensions.get(ExplorerExtension)
const actions = useFileActions()
const displayName = computed(() => explorer.displayName(props.node))
const renaming = computed(() => explorer.renamingPath.value === props.node.entry.pathname)
const renameValue = ref('')

watch(
  renaming,
  (active) => {
    if (active) renameValue.value = displayName.value.text
  },
  { immediate: true },
)

function commitRename(editedName: string) {
  if (!renaming.value) return
  explorer.renamingPath.value = null
  // The editor displays the visible name; the domain restores any hidden extension on commit.
  const newName = displayName.value.fullName(editedName)
  if (newName !== basename(props.node.entry.pathname)) {
    actions.runAction(explorer.renameEntry(props.node.entry.pathname, newName), `rename to ${newName}`)
  }
}

function cancelRename() {
  if (renaming.value) explorer.renamingPath.value = null
}
</script>

<template>
  <InlineNameInput v-if="renaming" v-model="renameValue" label="New name" commit-on-blur @commit="commitRename" @cancel="cancelRename" />
  <template v-else>{{ displayName.text }}</template>
</template>
