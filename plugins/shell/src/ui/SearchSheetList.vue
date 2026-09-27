<script setup lang="ts">
import { EmptyState, IconButton, Row, SectionLabel } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed, nextTick, ref, watch } from 'vue'
import { t } from '../i18n/messages'
import { useSheetLayer } from './hotkeys'
import { chooseEntry, type SheetEntry, type SheetSection, sheetSections } from './search-sheet'
import type { TabTypeRegistry } from './tab-type-registry'
import type { Workspace } from './workspace'

// The body of the search sheet, and the only place the two sections are described. The frames differ in
// what CONTAINS it — a dialog on the desktop, a bottom sheet on the phone — and not in what it says, so
// the list itself is one component rather than the same two sections written out twice.
// `sections` is how a frame asks for a different level of the same two sections — the phone lists types,
// not every object inside them (see `typeSections`). Unset — the objects, as ⌘K has them.
const props = defineProps<{ open: boolean; workspace: Workspace; types: TabTypeRegistry; sections?: SheetSection[] }>()
const emit = defineEmits<{ chosen: [] }>()

const listed = computed(() => props.sections ?? sheetSections(props.workspace, props.types))
const listEl = ref<HTMLElement | null>(null)

// While the sheet is up it is the only thing the keyboard talks to: ⌘B must not collapse the column
// from under an open dialog. Pushed from the list rather than from its container, because the
// container is a uikit control and uikit may not depend on a plugin — the frame owns the layer.
useSheetLayer(listEl)

// A dialog pads its body and a bottom sheet deliberately does not: on the phone the rows run edge to edge
// and keep their own touch inset, the way every other sheet's rows do. Read once — the frame never changes.
const touch = useShellFrame() === 'mobile'

// Focus lands on the first row as the sheet opens, so the whole sheet is operable from the keyboard
// without a pointer ever touching it. Driven by the prop rather than by mounting: whether the container
// keeps its content mounted while closed is the container's business, and the two of them answer it
// differently.
watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    rows()[0]?.focus()
  },
  { immediate: true },
)

function rows(): HTMLElement[] {
  return [...(listEl.value?.querySelectorAll<HTMLElement>('button.row, button.row-main') ?? [])]
}

// The arrows walk both sections as ONE list, and wrap. The section headings are a reading aid — someone
// holding Down is looking for a row, and stopping them at a heading would make the aid an obstacle.
function step(delta: number): void {
  const all = rows()
  if (all.length === 0) return
  const from = all.indexOf(document.activeElement as HTMLElement)
  const next = from === -1 ? 0 : (from + delta + all.length) % all.length
  all[next]?.focus()
}

// Only a type the row does not hold for good can be put away; a pinned one would stand straight back.
// Nor the one you are standing in: closing it from here would pull the floor out from under the sheet.
function closable(section: SheetSection, entry: SheetEntry): boolean {
  return section.id === 'open' && entry.objectKey == null && entry.current !== true && props.types.get(entry.typeId)?.pinned === false
}

function choose(entry: SheetEntry): void {
  chooseEntry(props.workspace, entry)
  emit('chosen')
}
</script>

<template>
  <div ref="listEl" class="sheet-list" :class="{ touch }" @keydown.down.prevent="step(1)" @keydown.up.prevent="step(-1)">
    <section v-for="section in listed" :key="section.id" class="sheet-section">
      <SectionLabel :inset="touch" :class="{ 'sheet-heading': !touch }">{{ section.title }}</SectionLabel>
      <EmptyState v-if="section.entries.length === 0" compact :text="section.empty" />
      <Row
        v-for="entry in section.entries"
        :key="entry.id"
        as="button"
        type="button"
        :data-testid="`sheet:${entry.id}`"
        :icon="entry.icon"
        :label="entry.title"
        :detail="entry.detail"
        :checked="entry.current"
        :selected="entry.current"
        :aria-current="entry.current ? 'true' : undefined"
        @click="choose(entry)"
      >
        <span v-if="entry.meta" class="sheet-row-meta">{{ entry.meta }}</span>
        <template v-if="closable(section, entry)" #trailing>
          <IconButton icon="lu:x" size="row" :aria-label="t('sheet.close', { title: entry.title })" @click="workspace.closeType(entry.typeId)" />
        </template>
      </Row>
    </section>
  </div>
</template>

<style scoped>
.sheet-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* Its own inset: a dialog pads its body and a bottom sheet deliberately does not, and the rows must
     not sit against the edge of the phone's sheet. */
  padding: 0 8px;
}

.sheet-list.touch {
  gap: 0;
  padding: 0;
}

.sheet-section {
  display: flex;
  flex-direction: column;
}

.sheet-heading {
  padding: 0 8px 8px;
}

/* Pushed to the trailing edge so the titles read as a column: which type a row belongs to is the answer
   to a second question, and it must not step in and out with the length of the name in front of it. */
.sheet-row-meta {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--gray-10);
  font-size: var(--font-size-xs);
}
</style>
