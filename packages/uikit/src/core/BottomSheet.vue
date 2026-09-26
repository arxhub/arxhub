<script setup lang="ts">
import { Dialog } from '@ark-ui/vue'
import { computed, nextTick, onBeforeUnmount, ref, useSlots, watch } from 'vue'
import { useBackStack } from '../hooks/useBackStack'
import { useKeyboardInset } from '../hooks/useKeyboardInset'
import IconButton from './IconButton.vue'
import ScrollArea from './ScrollArea.vue'
import Strip from './Strip.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title?: string
    label?: string
    restoreFocus?: boolean
    // `full` takes the whole screen above the keyboard — a place of its own (the vault, a picker), not
    // a menu raised over the page.
    variant?: 'auto' | 'full'
    // `end` opens scrolled to the bottom: a list ordered oldest-to-newest keeps its newest entry under
    // the thumb, which is the one the sheet was raised for.
    anchor?: 'start' | 'end'
    closeLabel?: string
    // A footer that is a small form — a name and the button that confirms it — stands off the sheet's edges;
    // one that is a band of its own (a flush SearchField) fills them.
    footerInset?: boolean
    // A body of prose and controls rather than a list: it stands off the sheet's edges (16px, a 16px
    // column gap) at the touch text size. A list of rows leaves it off and runs edge to edge.
    inset?: boolean
  }>(),
  { restoreFocus: true, variant: 'auto', anchor: 'start', closeLabel: 'Close' },
)
// `scroll` is the owner moving the body by hand — never a scroll the sheet made itself (the end anchor, a
// focused row brought into view), so a consumer may take it as "done typing" and let the keyboard go.
const emit = defineEmits<{ close: []; scroll: [] }>()
const slots = useSlots()

const keyboardInset = useKeyboardInset()
const heading = computed(() => props.title ?? props.label)

let opener: HTMLElement | null = null
watch(
  () => props.open,
  (open) => {
    if (open) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
  },
  { flush: 'sync', immediate: true },
)
const finalFocus = () => (opener?.isConnected && opener.getClientRects().length ? opener : null)

// ScrollArea exposes its viewport; a template ref reads it unwrapped.
const body = ref<{ viewport: HTMLElement | null } | null>(null)
// A sheet opened to type into puts the caret there: the field is what it was raised for.
const top = ref<HTMLElement | null>(null)
const footer = ref<HTMLElement | null>(null)
const TABBABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
// Ark's default would land on the header's close button now that the header comes first; focus goes to
// the content the sheet was opened for, and for an end-anchored list to its last entry, so the focus
// does not scroll the list back to the top it was not opened at.
// A field marked `autofocus` wins wherever it sits: a footer holding the one field of a small form (a
// rename) is raised to type into, while a footer finder under a list is not.
function initialFocus(): HTMLElement | null {
  const marked = footer.value?.querySelector<HTMLElement>('[autofocus]') ?? body.value?.viewport?.querySelector<HTMLElement>('[autofocus]')
  if (marked != null) return marked
  const field = top.value?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])')
  if (field != null) return field
  const items = body.value?.viewport?.querySelectorAll<HTMLElement>(TABBABLE)
  if (items == null || items.length === 0) return null
  return (props.anchor === 'end' ? items[items.length - 1] : items[0]) ?? null
}

// Content often arrives after the sheet opens (a list read from storage, rows measured late), so the end
// anchor holds until the owner touches the list — from then on where they scrolled to is theirs.
let pinned = false
let observer: ResizeObserver | null = null
function toEnd(): void {
  const el = body.value?.viewport
  if (el != null && pinned) el.scrollTop = el.scrollHeight
}
function release(): void {
  pinned = false
  observer?.disconnect()
  observer = null
}
watch(
  () => props.open && props.anchor === 'end',
  async (anchored) => {
    release()
    if (!anchored) return
    pinned = true
    await nextTick()
    const content = body.value?.viewport?.firstElementChild
    if (!pinned || content == null) return
    toEnd()
    observer = new ResizeObserver(toEnd)
    observer.observe(content)
  },
  { immediate: true, flush: 'post' },
)
onBeforeUnmount(release)

// Back closes the sheet instead of leaving the app — an overlay has no navigation of its own.
useBackStack(
  () => props.open,
  () => emit('close'),
)
</script>

<template>
  <Dialog.Root
    :open="open"
    :restore-focus="restoreFocus"
    :initial-focus-el="initialFocus"
    :final-focus-el="finalFocus"
    @update:open="$event || emit('close')"
  >
    <Teleport to="body">
      <Dialog.Positioner v-if="open" class="sheet-backdrop" :style="{ bottom: `${keyboardInset}px` }" @click.self="emit('close')">
        <Dialog.Content class="sheet" :class="`variant-${variant}`" :aria-label="label ?? title">
          <!-- A leading full-height control needs the strip's own inset gone on that edge too. -->
          <Strip :flush="!!slots.leading" :flush-actions="!slots.leading">
            <template v-if="slots.leading" #leading><slot name="leading" /></template>
            <template v-if="heading" #title>
              <Dialog.Title class="sheet-title">{{ heading }}</Dialog.Title>
            </template>
            <template #actions>
              <slot name="actions" />
              <IconButton size="xl" icon="lu:x" :aria-label="closeLabel" data-testid="sheet-close" @click="emit('close')" />
            </template>
          </Strip>
          <!-- Pinned under the header and above what scrolls: a field the sheet is opened to type into. -->
          <div v-if="slots.top" ref="top" class="sheet-top"><slot name="top" /></div>
          <!-- A sheet that is only its footer form (a rename) has no body to scroll, nor a blank band for one. -->
          <ScrollArea
            v-if="slots.default"
            ref="body"
            class="sheet-body"
            :class="{ 'has-footer': !!slots.footer, inset }"
            content-class="sheet-body-content"
            @wheel.passive="release(); emit('scroll')"
            @touchstart.passive="release"
            @pointerdown="release"
            @keydown="release"
            @touchmove.passive="emit('scroll')"
          >
            <slot />
          </ScrollArea>
          <div v-if="slots.footer" ref="footer" class="sheet-footer" :class="{ lifted: keyboardInset > 0, inset: footerInset }">
            <slot name="footer" />
          </div>
        </Dialog.Content>
      </Dialog.Positioner>
    </Teleport>
  </Dialog.Root>
</template>

<style scoped>
.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-index-modal);
  display: flex;
  align-items: flex-end;
  background: var(--scrim-modal);
}

.sheet {
  width: 100%;
  min-width: 0;
  max-height: 80%;
  outline: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--gray-6);
  border-top-left-radius: var(--radius-md);
  border-top-right-radius: var(--radius-md);
  background: var(--gray-2);
  color: var(--gray-12);
  /* The sheet is teleported to <body>, outside the frame that sets the app's font — so it has to set
     it itself, or every sheet in the app renders in the browser's default serif. */
  font-family: var(--font-sans);
  box-shadow: var(--shadow-xl);
}

/* The backdrop already ends where the keyboard begins, so 100% is exactly the room above it. */
.sheet.variant-full {
  height: 100%;
  max-height: none;
  padding-top: env(safe-area-inset-top);
  border-top: 0;
  border-radius: 0;
  box-shadow: none;
}

.sheet-title {
  margin: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font: inherit;
}

.sheet-top {
  flex-shrink: 0;
  box-shadow: inset 0 -1px 0 var(--gray-6);
}

.sheet-body {
  flex: 0 1 auto;
}

.sheet.variant-full > .sheet-body {
  flex: 1 1 auto;
}

.sheet-body :deep(.sheet-body-content) {
  padding: 0 0 max(8px, env(safe-area-inset-bottom));
}

.sheet-body.has-footer :deep(.sheet-body-content) {
  padding-bottom: 8px;
}

.sheet-body.inset :deep(.sheet-body-content) {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 16px max(16px, env(safe-area-inset-bottom));
  font-size: var(--font-size-md);
}

.sheet-body.inset.has-footer :deep(.sheet-body-content) {
  padding-bottom: 16px;
}

.sheet-footer {
  flex-shrink: 0;
  padding-bottom: env(safe-area-inset-bottom);
  box-shadow: inset 0 1px 0 var(--gray-6);
}

/* The inset keeps its own bottom padding on top of the safe area: the confirm is not the screen's edge. */
.sheet-footer.inset {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
}

.sheet-footer.inset.lifted {
  padding-bottom: 12px;
}

/* Over the keyboard the home indicator is covered anyway; its inset would only float the field. */
.sheet-footer.lifted {
  padding-bottom: 0;
}
</style>
