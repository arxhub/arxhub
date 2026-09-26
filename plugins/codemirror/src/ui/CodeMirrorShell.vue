<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import type { EditorView } from '@codemirror/view'
import CodeMirrorBody from './CodeMirrorBody.vue'
import DesktopCodeMirrorShell from './DesktopCodeMirrorShell.vue'

defineProps<{
  path: string
  view: EditorView | null
  revision: number
  note: boolean
  canSave: boolean
  loadError: unknown
  onSave: () => void
  onRetry: () => void
}>()

const impl = useShellFrame() === 'mobile' ? CodeMirrorBody : DesktopCodeMirrorShell
</script>

<template>
  <component
    :is="impl"
    :path="path"
    :view="view"
    :revision="revision"
    :note="note"
    :can-save="canSave"
    :load-error="loadError"
    :on-save="onSave"
    :on-retry="onRetry"
  >
    <slot />
  </component>
</template>
