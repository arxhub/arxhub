<script setup lang="ts">
import { Dialog, Row } from '@arxhub/uikit/core'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { computed, nextTick } from 'vue'
import { focusDocument } from '../document-navigation'
import { documentHeadings } from '../document-search'
import { t } from '../i18n/messages'

const props = defineProps<{ view: EditorView; revision: number }>()
const emit = defineEmits<{ close: [] }>()
const headings = computed(() => {
  void props.revision
  return documentHeadings(props.view.state.doc)
})
async function reveal(pos: number) {
  emit('close')
  await nextTick()
  requestAnimationFrame(() => {
    if (props.view.isDestroyed) return
    props.view.dispatch(props.view.state.tr.setSelection(TextSelection.create(props.view.state.doc, pos)).scrollIntoView())
    focusDocument(props.view)
  })
}
</script>

<template>
  <Dialog open :title="t('tools.outline')" size="sm" @update:open="$event || emit('close')">
    <nav :aria-label="t('outline.nav')">
      <Row v-for="heading in headings" :key="heading.pos" as="button" type="button" :style="{ paddingLeft: `${8 + (Math.min(6, heading.level) - 1) * 16}px` }" @click="reveal(heading.pos)">{{ heading.title }}</Row>
      <p v-if="!headings.length">{{ t('outline.empty') }}</p>
    </nav>
  </Dialog>
</template>
