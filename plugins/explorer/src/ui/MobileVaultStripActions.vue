<script setup lang="ts">
import { useNavHost } from '@arxhub/plugin-shell/ui'
import { actionMenu, IconButton } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { ExplorerExtension } from '../explorer-extension'
import { useFileActions } from './use-file-actions'

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const navHost = useNavHost()
const actions = useFileActions()

function newFile(event: MouseEvent): void {
  const parent = explorer.selectedPath.value ?? explorer.root
  if (explorer.fileTemplates.value.length) actionMenu.open(actions.getCreationActions(parent), { x: event.clientX, y: event.clientY })
  else actions.runAction(actions.createFile(parent), 'create the file')
}

function newFolder(): void {
  const parent = explorer.selectedPath.value ?? explorer.root
  actions.runAction(explorer.createDir(parent, 'new-folder'), 'create the folder')
}

function addFiles(): void {
  actions.runAction(actions.addFiles(explorer.selectedPath.value ?? explorer.root), 'add the files')
}

function more(event: MouseEvent): void {
  actionMenu.open(
    [
      { id: 'new-folder', label: 'New folder', icon: 'lu:folder-plus', onSelect: newFolder },
      { id: 'add-files', label: 'Add files…', icon: 'lu:file-up', onSelect: addFiles },
      { id: 'refresh', label: 'Refresh', icon: 'lu:refresh-cw', onSelect: () => actions.runAction(explorer.loadRoot(), 'refresh the files') },
      { id: 'collapse', label: 'Collapse tree', icon: 'lu:chevrons-down-up', onSelect: () => explorer.collapseAll() },
    ],
    { x: event.clientX, y: event.clientY, title: 'Vault' },
  )
}
</script>

<template>
  <!-- Frequent: New file. Occasional: behind More. Frame close stays edge-reachable. -->
  <IconButton size="lg" icon="lu:file-plus" tooltip="New file" @click="newFile" />
  <IconButton size="lg" icon="lu:ellipsis" tooltip="More vault actions" ariaLabel="More vault actions" @click="more" />
  <IconButton
    v-if="navHost != null"
    size="lg"
    :icon="navHost.icon"
    data-testid="nav-toggle"
    :tooltip="navHost.label"
    @click="navHost.dismiss()"
  />
</template>
