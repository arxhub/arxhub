<script setup lang="ts">
import { useNavHost } from '@arxhub/plugin-shell/ui'
import { TreeView, type TreeViewNode } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { SettingsExtension, type SettingsSection } from '../settings-extension'

// The list of sections, one implementation for both places it is shown: under the desktop column's strip
// (SettingsNav) and as the whole body of the phone's second-tap sheet, which has a header of its own.
// `marked` is the phone's sheet: a list of choices there carries the check every other second-tap sheet does.
const props = defineProps<{ marked?: boolean }>()
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
  <TreeView class="settings-nav" :nodes="nodes" label="Settings sections" :selected-id="settings.activeId.value" :mark-selected="props.marked" @activate="activate" />
</template>
