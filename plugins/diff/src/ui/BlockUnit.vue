<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { DiffUnit } from '../model'
import {
  type BlockSide,
  checkedFor,
  foldUnitOf,
  glyphFor,
  noteFor,
  segmentsFor,
  shownChange,
  stopHere,
  stopTargets,
  visibleOn,
  wholeContainer,
} from './block-view'
import DiffFold from './DiffFold.vue'
import DiffGlyph from './DiffGlyph.vue'
import DiffInline from './DiffInline.vue'
import { foldLabel } from './labels'
import { useDiffViewContext, useFolds } from './use-diff-view'

const props = withDefaults(defineProps<{ unit: DiffUnit; side?: BlockSide; plain?: boolean }>(), { side: null, plain: false })

const { controller, settings, touch } = useDiffViewContext()

const change = computed(() => (props.plain ? 'equal' : shownChange(props.unit)))
const glyph = computed(() => (props.plain ? null : glyphFor(props.unit)))
const stop = computed(() => (stopHere(props.unit, props.side) ? props.unit.id : undefined))
const note = computed(() => noteFor(props.unit, props.side))
const block = computed(() => (props.unit.kind === 'block' ? props.unit : null))
const container = computed(() => (props.unit.kind === 'container' ? props.unit : null))
const segments = computed(() => (block.value == null ? [] : segmentsFor(block.value.segments, props.side)))
const checked = computed(() => (block.value == null ? undefined : checkedFor(block.value, props.side)))
// The left column names the container; the summary counts the NEW side's children, so it belongs on the right.
const tag = computed(() => (container.value == null ? '' : props.side === 'left' ? container.value.label : container.value.summary))
const childrenPlain = computed(() => props.plain || wholeContainer(props.unit))

// The stream never draws a ghost, so it folds without them — a ghost counted as a change would keep context
// around a spot where nothing is drawn. The two columns fold the full list, blanks included, so they stay row
// for row; the scopes differ because the two lists do.
const children = computed(() => {
  const all = container.value?.children ?? []
  return props.side == null ? all.filter((child) => child.ghost !== true) : all
})
const entries = useFolds(() => children.value, {
  isChange: (child) => child.change !== 'equal',
  context: () => settings.value.contextBlocks,
  scope: () => (props.side == null ? `${props.unit.id}~stream` : props.unit.id),
  targetsOf: (child) => stopTargets(child),
  foldAllWhenUnchanged: () => container.value?.change === 'equal',
})
const foldUnit = computed(() => foldUnitOf(children.value))
</script>

<template>
  <div
    class="unit"
    :class="{ touch, plain, container: container != null }"
    :data-change="change"
    :data-diff-stop="stop"
    :tabindex="stop == null ? undefined : -1"
  >
    <span class="gutter"><DiffGlyph v-if="glyph" :change="glyph" /></span>
    <div class="body">
      <span v-if="tag" class="note">{{ tag }}</span>
      <span v-if="note" class="note">{{ note }}</span>
      <template v-if="block">
        <div v-if="block.role === 'task'" class="task">
          <span class="box" :class="{ on: checked === true }" aria-hidden="true">
            <Icon v-if="checked === true" name="lu:check" :size="touch ? 16 : 14" />
          </span>
          <span class="text"><DiffInline :segments="segments" /></span>
        </div>
        <div v-else class="text" :class="block.role"><DiffInline :segments="segments" /></div>
      </template>
      <template v-else-if="container">
        <template v-if="container.head">
          <BlockUnit v-if="visibleOn(container.head, side)" :unit="container.head" :side="side" :plain="childrenPlain" />
          <div v-else class="blank" aria-hidden="true" />
        </template>
        <div class="children">
          <template v-for="entry in entries" :key="entry.kind === 'fold' ? entry.id : entry.item.id">
            <DiffFold
              v-if="entry.kind === 'fold'"
              :label="foldLabel(entry.count, foldUnit)"
              @expand="controller.expand(entry.id)"
            />
            <BlockUnit v-else-if="visibleOn(entry.item, side)" :unit="entry.item" :side="side" :plain="childrenPlain" />
            <!-- The other column draws this child; a dashed blank keeps the two columns row for row. -->
            <div v-else class="blank" aria-hidden="true" />
          </template>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.unit {
  display: grid;
  grid-template-columns: var(--size-2xs) minmax(0, 1fr);
  margin: 0 8px 4px;
  border-radius: var(--radius-xs);
  color: var(--gray-12);
}

.unit.touch {
  grid-template-columns: var(--size-xs) minmax(0, 1fr);
}

.gutter {
  display: flex;
  justify-content: center;
  padding-top: 8px;
  color: var(--gray-10);
}

.touch > .gutter {
  padding-top: 12px;
}

.body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  min-height: var(--size-2xs);
  padding: 4px 12px 4px 4px;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}

.touch > .body {
  min-height: var(--size-xl);
  padding: 8px 12px 8px 4px;
  font-size: var(--font-size-md);
}

.note {
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.text.code {
  font-family: var(--font-mono);
}

/* design-ignore: note content typography — a heading inside a document scales with the body it sits in. */
.text.heading {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

.touch .text.heading {
  font-size: var(--font-size-lg);
}

.task {
  display: flex;
  align-items: center;
  gap: 8px;
}

.box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--size-xs-half);
  height: var(--size-xs-half);
  border: 1px solid var(--gray-11);
  border-radius: var(--radius-xs);
  box-sizing: border-box;
}

.touch .box {
  width: var(--size-xl-half);
  height: var(--size-xl-half);
}

.box.on {
  background: var(--accent-9);
  border-color: var(--accent-11);
  color: var(--accent-contrast);
}

.unit[data-change='equal'] > .body {
  color: var(--gray-11);
}

.unit[data-change='added'] {
  background: var(--success-3);
}

.unit[data-change='added'] > .gutter {
  color: var(--success-11);
}

.unit[data-change='added'] > .body {
  color: var(--success-12);
}

.unit[data-change='removed'] {
  background: var(--danger-3);
}

.unit[data-change='removed'] > .gutter {
  color: var(--danger-11);
}

.unit[data-change='removed'] > .body {
  color: var(--danger-11);
  text-decoration: line-through;
}

.unit[data-change='changed'],
.unit[data-change='moved'] {
  background: var(--gray-3);
}

.unit[data-change='changed'] > .gutter,
.unit[data-change='moved'] > .gutter {
  color: var(--gray-11);
}

/* A container is structure, not a change of its own: a frame, and only its changed children are tinted —
   unless the whole container is the change, when it takes the tint like any unit. */
.unit.container {
  border: 1px solid var(--gray-6);
}

.unit.container[data-change='changed'],
.unit.container[data-change='equal'] {
  background: transparent;
}

.unit.container[data-change='changed'] > .body,
.unit.container[data-change='equal'] > .body {
  color: var(--gray-12);
}

/* Inside a container that is itself the change, the children read in the container's colour. */
.unit.plain {
  background: transparent;
  color: inherit;
}

.unit.plain > .body {
  color: inherit;
}

.children {
  display: flex;
  flex-direction: column;
  margin-top: 4px;
}

.blank {
  min-height: var(--size-2xs);
  margin-bottom: 4px;
  border: 1px dashed var(--gray-6);
  border-radius: var(--radius-xs);
  box-sizing: border-box;
}

.children > .unit,
.children > .diff-fold,
.body > .unit {
  margin-left: 0;
  margin-right: 0;
}

.unit[data-diff-stop]:focus {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}
</style>
