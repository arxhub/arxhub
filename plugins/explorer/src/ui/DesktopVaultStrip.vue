<script setup lang="ts">
import { useNavHost } from '@arxhub/plugin-shell/ui'
import { type ActionItem, actionMenu, IconButton, OverflowActions, Strip } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { ExplorerExtension } from '../explorer-extension'
import { useFileActions } from './use-file-actions'

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const navHost = useNavHost()
const actions = useFileActions()

function newFile(event: MouseEvent): void {
  const parent = explorer.selectedPath.value ?? explorer.root
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (explorer.fileTemplates.value.length) actionMenu.open(actions.getCreationActions(parent), { x: box.left, y: box.bottom })
  else actions.runAction(actions.createFile(parent), 'create the file')
}

function newFolder(): void {
  const parent = explorer.selectedPath.value ?? explorer.root
  actions.runAction(explorer.createDir(parent, 'new-folder'), 'create the folder')
}

function addFiles(): void {
  actions.runAction(actions.addFiles(explorer.selectedPath.value ?? explorer.root), 'add the files')
}

const secondary: ActionItem[] = [
  { id: 'new-folder', label: 'New folder', icon: 'lu:folder-plus', onSelect: newFolder },
  { id: 'add-files', label: 'Add files…', icon: 'lu:file-up', onSelect: addFiles },
  { id: 'collapse', label: 'Collapse tree', icon: 'lu:chevrons-down-up', onSelect: () => explorer.collapseAll() },
  { id: 'refresh', label: 'Refresh', icon: 'lu:refresh-cw', onSelect: () => actions.runAction(explorer.loadRoot(), 'refresh the files') },
]
</script>

<template>
  <Strip flush>
    <OverflowActions :actions="secondary" more-label="More vault actions" more-title="Vault">
      <template #leading>
        <IconButton size="lg" icon="lu:file-plus" tooltip="New file" @click="newFile" />
      </template>
      <template v-if="navHost != null" #trailing>
        <IconButton
          size="lg"
          :icon="navHost.icon"
          data-testid="nav-toggle"
          :tooltip="navHost.label"
          @click="navHost.dismiss()"
        />
      </template>
    </OverflowActions>
  </Strip>
</template>
