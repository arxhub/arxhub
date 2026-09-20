<script setup lang="ts">
import { useNavHost } from '@arxhub/plugin-shell/ui'
import { IconButton, Strip, TreeView, type TreeViewNode } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { SettingsExtension, type SettingsSection } from '../settings-extension'

const arxhub = useArxHub()
const navHost = useNavHost()
const settings = arxhub.extensions.get(SettingsExtension)

const nodes = computed(() =>
  [...settings.sections.value]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((section) => ({ id: section.id, label: section.title, icon: section.icon ?? 'lu:settings', data: section })),
)

function activate(node: TreeViewNode<SettingsSection>) {
  settings.open(node.id)
  navHost?.navigated?.()
}
</script>

<template>
  <div class="settings-navigation">
    <Strip title="Sections" flush-actions>
      <template #actions>
        <IconButton v-if="navHost" size="lg" :icon="navHost.icon" :tooltip="navHost.label" @click="navHost.dismiss()" />
      </template>
    </Strip>
    <TreeView class="settings-nav" :nodes="nodes" label="Settings sections" :selected-id="settings.activeId.value" @activate="activate" />
  </div>
</template>

<style scoped>
.settings-navigation {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
</style>
