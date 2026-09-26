<script setup lang="ts">
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
function more(): void {
  actionMenu.open(
    props.actions
      .filter((action) => !action.primary)
      .map((action) => ({
        id: action.id,
        label: action.label,
        icon: action.icon,
        disabled: action.disabled,
        onSelect: action.run,
      })),
    { title: 'Formatting' },
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
  <div class="formatting" :class="{ fill: dismissKeyboard }" role="toolbar" aria-label="Formatting" @mousedown.prevent>
    <template v-if="history.length">
      <IconButton v-for="action in history" :key="action.id" size="xl" :icon="action.icon" :tooltip="action.label" :disabled="action.disabled" @click="action.run()" />
      <Separator />
    </template>
    <IconButton
      v-for="action in actions.filter((item) => item.primary)"
      :key="action.id"
      size="xl"
      :icon="action.icon"
      :tooltip="action.label"
      :active="action.active"
      :disabled="action.disabled"
      @click="action.run()"
    />
    <IconButton size="xl" icon="lu:ellipsis" tooltip="More formatting" @click="more" />
    <template v-if="dismissKeyboard">
      <Separator grow />
      <IconButton size="xl" icon="lu:keyboard-off" tooltip="Hide keyboard" data-testid="hide-keyboard" @click="hideKeyboard" />
    </template>
  </div>
</template>

<style scoped>
.formatting {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.formatting.fill {
  flex: 1;
  min-width: 0;
}
</style>
