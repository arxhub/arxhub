<script setup lang="ts">
import { useNavHost } from '@arxhub/plugin-shell/ui'
import { type ActionItem, actionMenu, IconButton, OverflowActions, Strip } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { ExplorerExtension } from '../explorer-extension'
import { t } from '../i18n/messages'
import { useFileActions } from './use-file-actions'

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const navHost = useNavHost()
const actions = useFileActions()

function newFile(event: MouseEvent): void {
  const parent = explorer.selectedPath.value ?? explorer.root
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (explorer.fileTemplates.value.length) actionMenu.open(actions.getCreationActions(parent), { x: box.left, y: box.bottom })
  else actions.runAction(actions.createFile(parent), 'create the file', t('failed.createFile'))
}

function newFolder(): void {
  const parent = explorer.selectedPath.value ?? explorer.root
  actions.runAction(explorer.createDir(parent, t('names.newFolder')), 'create the folder', t('failed.createFolder'))
}

function addFiles(): void {
  actions.runAction(actions.addFiles(explorer.selectedPath.value ?? explorer.root), 'add the files', t('failed.addFiles'))
}

const secondary = computed((): ActionItem[] => [
  { id: 'new-folder', label: t('strip.newFolder'), icon: 'lu:folder-plus', onSelect: newFolder },
  { id: 'add-files', label: t('strip.addFiles'), icon: 'lu:file-up', onSelect: addFiles },
  { id: 'collapse', label: t('strip.collapse'), icon: 'lu:chevrons-down-up', onSelect: () => explorer.collapseAll() },
  {
    id: 'refresh',
    label: t('strip.refresh'),
    icon: 'lu:refresh-cw',
    onSelect: () => actions.runAction(explorer.loadRoot(), 'refresh the files', t('failed.refresh')),
  },
])
</script>

<template>
  <Strip flush>
    <OverflowActions :actions="secondary" :more-label="t('strip.more')" :more-title="t('vault')">
      <template #leading>
        <IconButton size="lg" icon="lu:file-plus" :tooltip="t('strip.newFile')" @click="newFile" />
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
