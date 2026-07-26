<script setup lang="ts">
import { Button, StatusDot } from '@arxhub/uikit/core'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { SettingsExtension } from '../settings-extension'

const arxhub = useArxHub()
const settings = arxhub.extensions.get(SettingsExtension)
const changes = settings.changes

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
  else toaster.create({ title: 'Some changes could not be applied', description: 'They are still pending — see the log.', type: 'error' })
}

// ⌘S applies the whole pending set from anywhere in settings, which is the point of staging them.
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 's' || !(event.metaKey || event.ctrlKey)) return
  event.preventDefault()
  if (sections.value > 0 && !changes.invalid.value) void apply()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Transition name="rise">
    <div v-if="sections > 0" class="bar" role="status">
      <StatusDot :tone="tone" :pulse="changes.saving.value" />
      <div class="summary">
        <span class="headline">{{ summary }}</span>
        <span class="detail">{{ changes.staged.value.map((c) => `${c.title}: ${c.keys.join(', ')}`).join(' · ') }}</span>
      </div>
      <span v-if="changes.invalid.value" class="blocked">Fix the highlighted fields to apply</span>
      <kbd v-else class="shortcut">⌘S</kbd>
      <Button size="sm" variant="secondary" :disabled="changes.saving.value" @click="changes.revertAll()">Revert</Button>
      <Button size="sm" variant="primary" :disabled="changes.saving.value || changes.invalid.value" @click="apply">
        Save &amp; apply
      </Button>
    </div>
  </Transition>
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

.summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.headline {
  font-size: 13px;
  color: var(--gray-12);
}

.detail {
  font-family: var(--font-mono);
  font-size: 11px;
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
  font-size: 11px;
  color: var(--gray-9);
}

.rise-enter-active,
.rise-leave-active {
  transition: transform var(--duration-fast) ease, opacity var(--duration-fast) ease;
}

.rise-enter-from,
.rise-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .rise-enter-active,
  .rise-leave-active {
    transition: none;
  }
}
</style>
