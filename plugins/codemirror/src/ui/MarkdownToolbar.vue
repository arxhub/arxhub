<script setup lang="ts">
import { FormattingToolbar } from '@arxhub/uikit/core'
import type { EditorView } from '@codemirror/view'
import { computed } from 'vue'
import { markdownActions } from '../markdown-actions'

// `revision` is bumped by CodeMirrorEditor's own update listener on every selection/doc change. `view`
// is a shallowRef holding a live object CodeMirror mutates in place (never reassigned), so without this
// Vue would never see a reason to recompute `active` below.
const props = defineProps<{ view: EditorView | null; revision?: number }>()

const actions = computed(() => {
  void props.revision
  return markdownActions(props.view)
})
</script>

<template>
  <FormattingToolbar :actions="actions" />
</template>
