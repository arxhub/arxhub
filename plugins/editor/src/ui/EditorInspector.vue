<script setup lang="ts">
import { InspectorPanel } from '@arxhub/uikit/core'
import type { Node } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { computed, nextTick } from 'vue'
import { changeInspectedBlock, inspect, inspectorKey, replaceInspectedBlock, runInspectedCommand, settingsLabel } from '../block-settings'
import type { ArxEditorKit } from '../editor-extension'
import type { EditorMode } from '../editor-mode'
import { changePageProperties, pageProperties } from '../page-properties'
import BlockSettings from './BlockSettings.vue'
import PropertiesBlock from './PropertiesBlock.vue'

const props = defineProps<{ view: EditorView; revision: number; kit: ArxEditorKit; mode: EditorMode; path: string }>()
const target = computed(() => {
  void props.revision
  return inspectorKey.getState(props.view.state)
})
const node = computed(() => {
  void props.revision
  return target.value?.kind === 'block'
    ? props.view.state.doc.nodeAt(target.value.pos)
    : (pageProperties(props.view.state.doc) ?? props.view.state.schema.nodes.properties?.create())
})
const propertiesMode = computed(() => (props.mode === 'interactive' && !pageProperties(props.view.state.doc) ? 'readonly' : props.mode))
const title = computed(() =>
  target.value?.kind === 'page'
    ? 'Properties'
    : node.value
      ? (settingsLabel(node.value, props.kit.components) ?? 'Block settings')
      : 'Block settings',
)
const change = computed(() => {
  const pinned = target.value
  return (attrs: Record<string, unknown>) =>
    pinned?.kind === 'page' ? changePageProperties(props.view, attrs) : changeInspectedBlock(props.view, attrs, pinned)
})
function run(command: Command, inside = false) {
  runInspectedCommand(props.view, command, inside)
}
const replace = computed(() => {
  const pinned = target.value
  return (nodes: readonly Node[]) => replaceInspectedBlock(props.view, nodes, pinned)
})
async function close() {
  inspect(props.view, null)
  await nextTick()
  if (!props.view.isDestroyed) props.view.focus()
}
</script>
<template>
  <InspectorPanel v-if="target && node" :title="title" :subtitle="path" @close="close">
    <PropertiesBlock v-if="target.kind === 'page'" :node="node" :mode="propertiesMode" :change="change" :replace="replace" />
    <template v-else>
      <p v-if="mode !== 'editable'" class="settings-notice">Switch to Editable to change block settings.</p>
      <fieldset :disabled="mode !== 'editable'">
        <BlockSettings :key="`${node.type.name}:${node.attrs.arxId ?? target.pos}`" :node="node" :mode="mode" :change="change" :replace="replace" :run="run" :sources="kit.dataSources" :definition="kit.components[node.type.name]" />
      </fieldset>
    </template>
  </InspectorPanel>
</template>
<style scoped>
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.settings-notice { color: var(--gray-11); font-size: var(--font-size-sm); }
</style>
