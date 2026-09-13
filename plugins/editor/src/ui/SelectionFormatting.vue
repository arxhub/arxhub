<script setup lang="ts">
import { FormattingToolbar } from '@arxhub/uikit/core'
import { toggleMark } from 'prosemirror-commands'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { ArxDocumentLinks } from '../document-links'
import LinkDialog from './LinkDialog.vue'
import { MARKS } from './toolbar-actions'

const props = defineProps<{ view: EditorView; scroller: HTMLElement; revision: number; links?: ArxDocumentLinks | null; path?: string }>()
const linkOpen = ref(false)
const layoutRevision = ref(0)
const measure = () => layoutRevision.value++
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(measure)
  observer.observe(props.scroller)
  props.scroller.addEventListener('scroll', measure)
  document.addEventListener('focusin', measure)
  window.addEventListener('resize', measure)
})
onUnmounted(() => {
  observer?.disconnect()
  props.scroller.removeEventListener('scroll', measure)
  document.removeEventListener('focusin', measure)
  window.removeEventListener('resize', measure)
})
const position = computed(() => {
  void props.revision
  void layoutRevision.value
  const view = props.view
  if (view.isDestroyed) return null
  const { selection } = view.state
  const panel = props.scroller.parentElement
  if (!(selection instanceof TextSelection) || selection.empty || !panel || !panel.contains(document.activeElement)) return null
  const rect = view.coordsAtPos(selection.from)
  const scroll = props.scroller.getBoundingClientRect()
  const parent = panel.getBoundingClientRect()
  if (rect.bottom < scroll.top || rect.top > scroll.bottom) return null
  const width = Math.min(320, scroll.width - 16)
  const top = rect.top - 48 >= scroll.top ? rect.top - 48 : rect.bottom + 4
  return {
    top: `${Math.max(scroll.top, Math.min(top, scroll.bottom - 48)) - parent.top}px`,
    left: `${Math.max(scroll.left + 8, Math.min(rect.left, scroll.right - width - 8)) - parent.left}px`,
    maxWidth: `${width}px`,
  }
})
const actions = computed(() => {
  void props.revision
  const { state } = props.view
  return [
    ...MARKS.map((action) => {
      const mark = state.schema.marks[action.mark.name]
      return {
        id: action.label,
        label: action.label,
        icon: action.icon,
        primary: action.label === 'Bold',
        active: !!mark && state.doc.rangeHasMark(state.selection.from, state.selection.to, mark),
        run: () => {
          if (!mark || props.view.isDestroyed) return
          toggleMark(mark)(props.view.state, props.view.dispatch)
          props.view.focus()
        },
      }
    }),
    {
      id: 'link',
      label: 'Link',
      icon: 'lu:link',
      run: () => {
        linkOpen.value = true
      },
    },
  ]
})
</script>

<template>
  <div v-if="position" class="selection-formatting" :style="position">
    <FormattingToolbar :actions="actions" />
  </div>
  <LinkDialog v-if="linkOpen" :view="view" :links="links" :path="path" @close="linkOpen = false" />
</template>

<style scoped>
.selection-formatting {
  position: absolute;
  z-index: 2;
  padding: 4px;
  box-sizing: border-box;
  border: 1px solid var(--gray-6);
  border-radius: 8px;
  background: var(--gray-2);
  box-shadow: 0 4px 12px var(--black-a3);
}
</style>
