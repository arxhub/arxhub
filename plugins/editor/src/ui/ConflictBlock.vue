<script setup lang="ts">
import { Button } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import type { Node } from 'prosemirror-model'
import { computed } from 'vue'
import type { ArxEditorControlProps } from '../control-views'
import { versionText } from '../document-history'

const props = defineProps<ArxEditorControlProps>()
const buttonSize = useShellFrame() === 'mobile' ? 'md' : 'sm'

function side(name: 'local' | 'remote'): Node | null {
  let found: Node | null = null
  props.node.forEach((child) => {
    if (child.attrs.side === name) found = child
  })
  return found
}
const localSide = computed(() => side('local'))
const remoteSide = computed(() => side('remote'))
const localText = computed(() => (localSide.value?.childCount ? versionText(localSide.value) : ''))
const remoteText = computed(() => (remoteSide.value?.childCount ? versionText(remoteSide.value) : ''))

function blocksOf(container: Node | null): Node[] {
  const blocks: Node[] = []
  container?.forEach((child) => {
    blocks.push(child)
  })
  return blocks
}

function keep(pick: 'local' | 'remote' | 'both') {
  if (props.mode !== 'editable') return
  const nodes =
    pick === 'both'
      ? [...blocksOf(localSide.value), ...blocksOf(remoteSide.value)]
      : blocksOf(pick === 'local' ? localSide.value : remoteSide.value)
  props.replace(nodes)
}
</script>

<template>
  <div class="conflict-block">
    <p class="conflict-header">Conflict · this device / other device</p>
    <div class="conflict-side">
      <span class="conflict-label">This device</span>
      <p v-if="localText">{{ localText }}</p>
      <p v-else class="conflict-empty">Deleted on this device</p>
    </div>
    <div class="conflict-side">
      <span class="conflict-label">Other device</span>
      <p v-if="remoteText">{{ remoteText }}</p>
      <p v-else class="conflict-empty">Deleted on the other device</p>
    </div>
    <div v-if="mode === 'editable'" class="conflict-actions">
      <Button variant="secondary" size="sm" @click="keep('local')">Keep this device's</Button>
      <Button variant="secondary" size="sm" @click="keep('remote')">Keep other device's</Button>
      <Button variant="secondary" size="sm" @click="keep('both')">Keep both</Button>
    </div>
  </div>
</template>

<style scoped>
.conflict-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  margin-block: 12px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
}
.conflict-header {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--gray-11);
}
.conflict-side {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.conflict-label {
  font-size: var(--font-size-xs);
  color: var(--gray-10);
}
.conflict-side p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--gray-12);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.conflict-empty {
  color: var(--gray-9);
  font-style: italic;
}
.conflict-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
