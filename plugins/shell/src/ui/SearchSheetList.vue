<script setup lang="ts">
import { Icon, IconButton, Row, SectionLabel } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed, nextTick, ref, watch } from 'vue'
import { useSheetLayer } from './hotkeys'
import { chooseEntry, type SheetEntry, sheetSections } from './search-sheet'
import type { TabTypeRegistry } from './tab-type-registry'
import type { Workspace } from './workspace'

// The body of the search sheet, and the only place the two sections are described. The frames differ in
// what CONTAINS it — a dialog on the desktop, a bottom sheet on the phone — and not in what it says, so
// the list itself is one component rather than the same two sections written out twice.
const props = defineProps<{ open: boolean; workspace: Workspace; types: TabTypeRegistry }>()
const emit = defineEmits<{ chosen: [] }>()

const sections = computed(() => sheetSections(props.workspace, props.types))
const listEl = ref<HTMLElement | null>(null)

// While the sheet is up it is the only thing the keyboard talks to: ⌘B must not collapse the column
// from under an open dialog. Pushed from the list rather than from its container, because the
// container is a uikit control and uikit may not depend on a plugin — the frame owns the layer.
useSheetLayer(listEl)

// DS-8: the icon's size follows the row it sits in, and the row's density is the frame's. Read once —
// the frame never changes while the app is up.
const iconSize = useShellFrame() === 'mobile' ? 16 : 14

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
  return [...(listEl.value?.querySelectorAll<HTMLElement>('button.row') ?? [])]
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

function choose(entry: SheetEntry): void {
  chooseEntry(props.workspace, entry)
  emit('chosen')
}
</script>

<template>
  <div ref="listEl" class="sheet-list" @keydown.down.prevent="step(1)" @keydown.up.prevent="step(-1)">
    <section v-for="section in sections" :key="section.id" class="sheet-section">
      <SectionLabel class="sheet-heading">{{ section.title }}</SectionLabel>
      <p v-if="section.entries.length === 0" class="sheet-empty">{{ section.empty }}</p>
      <div v-for="entry in section.entries" :key="entry.id" class="sheet-entry">
        <Row
          as="button"
          type="button"
          :data-testid="`sheet:${entry.id}`"
          @click="choose(entry)"
        >
          <Icon :name="entry.icon" :size="iconSize" />
          <span class="sheet-row-title">{{ entry.title }}</span>
          <span v-if="entry.meta" class="sheet-row-meta">{{ entry.meta }}</span>
        </Row>
        <IconButton
          v-if="section.id === 'open' && entry.objectKey == null && types.get(entry.typeId)?.pinned === false"
          icon="lu:x"
          size="lg"
          :aria-label="`Close ${entry.title}`"
          @click="workspace.closeType(entry.typeId)"
        />
      </div>
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

.sheet-entry { display: flex; align-items: center; }
.sheet-entry > .row { flex: 1; min-width: 0; }

.sheet-section {
  display: flex;
  flex-direction: column;
}

.sheet-heading {
  padding: 0 8px 8px;
}

.sheet-empty {
  margin: 0;
  padding: 0 8px 4px;
  color: var(--gray-10);
}

.sheet-row-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
