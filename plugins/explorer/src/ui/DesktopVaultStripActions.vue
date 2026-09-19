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
</script>

<template>
  <IconButton size="lg" icon="lu:folder-plus" tooltip="New folder" @click="newFolder" />
  <IconButton size="lg" icon="lu:file-plus" tooltip="New file" @click="newFile" />
  <IconButton size="lg" icon="lu:file-up" tooltip="Add files…" @click="addFiles" />
  <IconButton size="lg" icon="lu:refresh-cw" tooltip="Refresh" @click="actions.runAction(explorer.loadRoot(), 'refresh the files')" />
  <IconButton size="lg" icon="lu:chevrons-down-up" tooltip="Collapse tree" @click="explorer.collapseAll()" />
  <IconButton
    v-if="navHost != null"
    size="lg"
    :icon="navHost.icon"
    data-testid="nav-toggle"
    :tooltip="navHost.label"
    @click="navHost.dismiss()"
  />
</template>
