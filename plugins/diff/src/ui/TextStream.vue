<script setup lang="ts">
import type { DiffTextModel } from '../model'
import DiffFold from './DiffFold.vue'
import DiffGlyph from './DiffGlyph.vue'
import DiffInline from './DiffInline.vue'
import { foldLinesLabel } from './labels'
import { useDiffViewContext, useFolds } from './use-diff-view'

const props = defineProps<{ model: DiffTextModel }>()
const { controller, settings, touch } = useDiffViewContext()

const entries = useFolds(() => props.model.lines, {
  isChange: (line) => line.change !== 'equal',
  context: () => settings.value.contextLines,
  scope: () => 'lines',
  targetsOf: (line) => (line.stop == null ? [] : [line.id]),
})
</script>

<template>
  <div class="text-stream" :class="{ touch }">
    <template v-for="entry in entries" :key="entry.kind === 'fold' ? entry.id : entry.item.id">
      <DiffFold v-if="entry.kind === 'fold'" :label="foldLinesLabel(entry.count)" @expand="controller.expand(entry.id)" />
      <div
        v-else
        class="line"
        :data-change="entry.item.change"
        :data-diff-stop="entry.item.stop == null ? undefined : entry.item.id"
        :tabindex="entry.item.stop == null ? undefined : -1"
      >
        <!-- One number on the phone: two columns of digits cost a third of its width. -->
        <span v-if="touch" class="number">{{ entry.item.newNumber ?? entry.item.oldNumber }}</span>
        <template v-else>
          <span class="number">{{ entry.item.oldNumber }}</span>
          <span class="number">{{ entry.item.newNumber }}</span>
        </template>
        <span class="sign"><DiffGlyph v-if="entry.item.change !== 'equal'" :change="entry.item.change" /></span>
        <span class="content"><DiffInline :segments="entry.item.segments" /><span v-if="entry.item.note" class="line-note">{{ entry.item.note }}</span></span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.line-note {
  margin-left: 8px;
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
}

.text-stream {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
}

.line {
  display: grid;
  grid-template-columns: 40px 40px 20px minmax(0, 1fr);
  align-items: start;
  margin: 0 8px;
  line-height: 20px;
}

.touch .line {
  grid-template-columns: 32px 20px minmax(0, 1fr);
  margin: 0;
  line-height: 24px;
}

.number {
  padding-right: 8px;
  color: var(--gray-11);
  text-align: right;
  user-select: none;
}

.sign {
  display: inline-flex;
  align-items: center;
  height: 20px;
}

.touch .sign {
  height: 24px;
}

.content {
  padding-right: 8px;
  color: var(--gray-12);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.line[data-change='added'] {
  background: var(--success-3);
}

.line[data-change='added'] .sign {
  color: var(--success-11);
}

.line[data-change='removed'] {
  background: var(--danger-3);
}

.line[data-change='removed'] .sign {
  color: var(--danger-11);
}

.line[data-diff-stop]:focus {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}
</style>
