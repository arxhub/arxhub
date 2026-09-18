<script setup lang="ts">
import { useHotkeys } from '@arxhub/plugin-hotkeys/ui'
import { typeLayerId, useHotkeysExtension } from '@arxhub/plugin-shell/ui'
import { Button, StatusDot } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, watch } from 'vue'
import { SETTINGS_TYPE_ID } from '../contributions'
import { SettingsExtension } from '../settings-extension'

const arxhub = useArxHub()
const settings = arxhub.extensions.get(SettingsExtension)
const changes = settings.changes
const mobile = useShellFrame() === 'mobile'
const buttonSize = mobile ? 'md' : 'sm'

const fields = computed(() => changes.fieldCount.value)
const sections = computed(() => changes.sectionCount.value)

const summary = computed(() => {
  if (changes.saving.value) return 'Applying…'
  const field = `${fields.value} unsaved change${fields.value === 1 ? '' : 's'}`
  return sections.value > 1 ? `${field} across ${sections.value} sections` : field
})

const tone = computed(() => {
  if (changes.saving.value) return 'accent' as const
  return changes.invalid.value ? ('danger' as const) : ('warning' as const)
})

async function apply(): Promise<void> {
  const applied = fields.value
  await changes.saveAll()
  if (changes.sectionCount.value === 0) toaster.create({ title: `Applied ${applied} change${applied === 1 ? '' : 's'}`, type: 'success' })
}

// A save failure is a condition on the shared pending-changes state, not an outcome only this
// function's caller finds out about — `SettingsExtension` already logs it, and this is the one place
// it also reaches the user, so any future path that calls saveAll() is covered too.
watch(
  () => changes.lastError.value,
  (failure) => {
    if (!failure) return
    toaster.create({ title: `Could not save ${failure.title}`, description: String(failure.error), type: 'error' })
  },
)

// ⌘S applies the whole pending set from anywhere in settings, which is the point of staging them —
// and from NOWHERE else, which the window listener this replaced could not manage. That listener was
// added in onMounted and removed in onBeforeUnmount, but a type's stage is never unmounted (it is
// v-show, so an editor's buffer and a staged draft survive a switch), so one visit to Settings left
// ⌘S intercepted app-wide for the rest of the session — and applied the whole set from a screen that
// was not Settings.
//
// The layer is what fixes it, and fixes it by construction rather than by remembering to unregister:
// a type's layer is only on the stack while its stage is on screen, so this binding cannot win from
// behind another type however long the component stays alive.
//
// `when` rather than a guard inside `run`: with nothing staged the chord is claimed by nobody at all,
// so ⌘S reaches the browser instead of being swallowed for no result.
const hotkeys = useHotkeysExtension()
useHotkeys(hotkeys, [
  {
    id: 'settings.save-all',
    chord: 'Mod-s',
    layer: typeLayerId(SETTINGS_TYPE_ID),
    title: 'Save & apply settings',
    when: () => sections.value > 0 && !changes.invalid.value,
    run: () => void apply(),
  },
])
</script>

<template>
  <div v-if="sections > 0" class="bar" :class="{ compact: mobile }" role="status">
    <StatusDot :tone="tone" :pulse="changes.saving.value" />
    <div class="summary">
      <span class="headline">{{ summary }}</span>
      <span v-if="!mobile" class="detail">{{ changes.staged.value.map((c) => `${c.title}: ${c.keys.join(', ')}`).join(' · ') }}</span>
    </div>
    <span v-if="changes.invalid.value" class="blocked">Fix the highlighted fields to apply</span>
    <!-- Drawn per platform from the one function that knows how (F-02): the sign used to be typed
         in, and read "⌘S" on Linux and Windows, where it is Ctrl. A phone has no Mod key. -->
    <kbd v-else-if="!mobile" class="shortcut">{{ hotkeys.label('Mod-s') }}</kbd>
    <Button :size="buttonSize" variant="secondary" :disabled="changes.saving.value" @click="changes.revertAll()">Revert</Button>
    <Button :size="buttonSize" variant="primary" :disabled="changes.saving.value || changes.invalid.value" @click="apply">
      Save &amp; apply
    </Button>
  </div>
</template>

<style scoped>
/* Pinned across the whole mini-app rather than per page: the set being applied spans sections, so
   the control that applies it cannot belong to any one of them. */
.bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  padding: 12px 24px;
  border-top: 1px solid var(--gray-6);
  background: var(--gray-2);
  font-family: var(--font-sans);
}

/* Phone: one line, no Mod hint, less padding — the type row already spends 48px below. */
.bar.compact {
  gap: 8px;
  padding: 8px 12px;
}

.summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.headline {
  font-size: var(--font-size-sm);
  color: var(--gray-12);
}

.bar.compact .headline {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-10);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.blocked {
  font-size: var(--font-size-xs);
  color: var(--danger-11);
}

.shortcut {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-9);
}
</style>
