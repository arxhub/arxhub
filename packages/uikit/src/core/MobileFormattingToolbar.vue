<script setup lang="ts">
// `row` keys: this band stands where the object band stood, and its keys take the same 48px box and 16px
// glyph (DS-8) so swapping one for the other does not change the band.
import { computed, ref } from 'vue'
import { useOverflowActions } from '../hooks/useOverflowActions'
import { t } from '../i18n/messages'
import { actionMenu } from './action-menu/action-menu'
import type { FormattingAction } from './formatting-action'
import IconButton from './IconButton.vue'
import Separator from './Separator.vue'

const props = withDefaults(
  defineProps<{
    actions: FormattingAction[]
    /** Undo and redo, drawn first: they matter only while editing, which is exactly when this band is up. */
    history?: FormattingAction[]
    /** Ends the band with a key that puts the keyboard away — the band stands in for the type row while it is up. */
    dismissKeyboard?: boolean
    variant?: 'strip' | 'bubble'
  }>(),
  { history: () => [], dismissKeyboard: false, variant: 'strip' },
)

const container = ref<HTMLElement | null>(null)
const item = ref<HTMLElement | null>(null)
const leading = ref<HTMLElement | null>(null)
const trailing = ref<HTMLElement | null>(null)
const primary = computed(() => props.actions.filter((action) => action.primary))
// Only the band that fills the screen's width has a width to fit into; a bubble is as wide as its keys.
const fitted = useOverflowActions(primary, {
  container: () => (props.dismissKeyboard ? container.value : null),
  item,
  leading,
  trailing,
  reserveOverflow: () => props.actions.some((action) => !action.primary),
})
const shown = computed(() => (props.dismissKeyboard ? fitted.visible.value : primary.value))
// A primary key the width could not hold is still one tap away, ahead of the ones that never had a key.
const rest = computed(() => [
  ...primary.value.filter((action) => !shown.value.includes(action)),
  ...props.actions.filter((action) => !action.primary),
])

function more(): void {
  actionMenu.open(
    rest.value.map((action) => ({
      id: action.id,
      label: action.label,
      icon: action.icon,
      disabled: action.disabled,
      onSelect: action.run,
    })),
    { title: t('formatting.title') },
  )
}

// The keyboard belongs to whatever editable holds focus, and the band never takes focus (mousedown is
// prevented), so letting go of that focus is what closes the keyboard on every platform.
function hideKeyboard(): void {
  const focused = document.activeElement
  if (focused instanceof HTMLElement) focused.blur()
}
</script>

<template>
  <div ref="container" class="formatting" :class="{ fill: dismissKeyboard }" role="toolbar" :aria-label="t('formatting.title')" @mousedown.prevent>
    <span ref="item" class="measure" aria-hidden="true" />
    <div v-if="history.length" ref="leading" class="pinned">
      <IconButton v-for="action in history" :key="action.id" size="row" :icon="action.icon" :tooltip="action.label" :disabled="action.disabled" @click="action.run()" />
      <Separator />
    </div>
    <IconButton
      v-for="action in shown"
      :key="action.id"
      size="row"
      :icon="action.icon"
      :tooltip="action.label"
      :active="action.active"
      :disabled="action.disabled"
      @click="action.run()"
    />
    <!-- A code file has undo and redo and nothing to format: a More key there would open an empty menu. -->
    <IconButton v-if="rest.length" size="row" icon="lu:ellipsis" :tooltip="t('formatting.more')" @click="more" />
    <div v-if="dismissKeyboard" ref="trailing" class="pinned end">
      <IconButton size="row" icon="lu:keyboard-off" :tooltip="t('formatting.hideKeyboard')" data-testid="hide-keyboard" @click="hideKeyboard" />
    </div>
  </div>
</template>

<style scoped>
.formatting {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.formatting.fill {
  flex: 1;
  min-width: 0;
}

.pinned {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

/* Hide keyboard leaves the editing it closes, so it stands apart the way a band's keys do from its name:
   a hairline the band's full height, not the short rule between groups of formatting. */
.pinned.end {
  align-self: stretch;
  margin-left: auto;
  border-left: 1px solid var(--gray-4);
}

.measure {
  position: absolute;
  visibility: hidden;
  width: var(--size-xl);
}
</style>
