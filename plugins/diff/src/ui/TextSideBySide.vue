<script setup lang="ts">
import { computed } from 'vue'
import { alignLines, type SideRow } from '../align'
import type { FoldEntry } from '../fold'
import type { DiffLine, DiffTextModel } from '../model'
import DiffFold from './DiffFold.vue'
import DiffGlyph from './DiffGlyph.vue'
import DiffInline from './DiffInline.vue'
import { foldLabel } from './labels'
import { useDiffViewContext, useFolds } from './use-diff-view'

const props = defineProps<{ model: DiffTextModel; leftLabel: string; rightLabel: string }>()
const { controller, settings } = useDiffViewContext()

// Folded as lines, with the stream's scope, then zipped: a pair never straddles a fold, because folds only hide
// equal lines, so each visible run can be aligned on its own.
const entries = useFolds(() => props.model.lines, {
  isChange: (line) => line.change !== 'equal',
  context: () => settings.value.contextLines,
  scope: () => 'lines',
  targetsOf: (line) => (line.stop == null ? [] : [line.id]),
})

type Piece = { kind: 'fold'; fold: Extract<FoldEntry<DiffLine>, { kind: 'fold' }> } | { kind: 'row'; row: SideRow<DiffLine> }

const pieces = computed<Piece[]>(() => {
  const out: Piece[] = []
  let run: DiffLine[] = []
  const flush = (): void => {
    for (const row of alignLines(run)) out.push({ kind: 'row', row })
    run = []
  }
  for (const entry of entries.value) {
    if (entry.kind === 'fold') {
      flush()
      out.push({ kind: 'fold', fold: entry })
    } else run.push(entry.item)
  }
  flush()
  return out
})
</script>

<template>
  <div class="text-side">
    <div class="head">{{ leftLabel }}</div>
    <div class="head right">{{ rightLabel }}</div>
    <template v-for="piece in pieces" :key="piece.kind === 'fold' ? piece.fold.id : piece.row.id">
      <div v-if="piece.kind === 'fold'" class="full">
        <DiffFold :label="foldLabel(piece.fold.count, 'lines')" @expand="controller.expand(piece.fold.id)" />
      </div>
      <template v-else>
        <template v-for="(cell, column) in [piece.row.left, piece.row.right]" :key="column">
          <div
            v-if="cell.kind === 'item'"
            class="line"
            :data-change="cell.item.change"
            :data-diff-stop="cell.item.stop == null ? undefined : cell.item.id"
            :tabindex="cell.item.stop == null ? undefined : -1"
          >
            <span class="number">{{ column === 0 ? cell.item.oldNumber : cell.item.newNumber }}</span>
            <span class="sign"><DiffGlyph v-if="cell.item.change !== 'equal'" :change="cell.item.change" /></span>
            <span class="content"><DiffInline :segments="cell.item.segments" /><span v-if="cell.item.note" class="line-note">{{ cell.item.note }}</span></span>
          </div>
          <div v-else class="line blank" aria-hidden="true" />
        </template>
      </template>
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

.text-side {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  padding: 0 0 8px;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
}

.head {
  margin-bottom: 8px;
  padding: 8px 20px 4px;
  border-bottom: 1px solid var(--gray-4);
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
}

.head.right {
  border-left: 1px solid var(--gray-4);
}

.full {
  grid-column: 1 / -1;
}

.line {
  display: grid;
  grid-template-columns: 40px 20px minmax(0, 1fr);
  align-items: start;
  min-height: 20px;
  line-height: 20px;
}

/* Hatched, not merely empty: the absence of a line has to read without its colour. */
.line.blank {
  background: repeating-linear-gradient(135deg, transparent 0 4px, var(--gray-4) 4px 5px);
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
