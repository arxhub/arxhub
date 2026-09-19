<script setup lang="ts">
import { computed } from 'vue'
import type { StatusRegistry } from '../status'
import type { Workspace } from '../workspace'

// The global background line: it is there exactly while something is running, and not there the rest of
// the time. It is a projection of the status items' `busy` field, never a second source — a separate
// extension point would mean two registrations and two states that drift apart.
const props = defineProps<{ status: StatusRegistry; workspace: Workspace }>()

const first = computed(() => props.status.busy.value[0])
const rest = computed(() => Math.max(0, props.status.busy.value.length - 1))

// Work with an owner leads to its own object. Indexing has no owner, and then the line simply does not
// take a tap — there is nowhere to lead, and pretending otherwise would be dishonest.
function goToOwner(): void {
  const owner = first.value?.owner
  if (owner == null) return
  props.workspace.activateObject(owner.typeId, owner.objectKey)
}
</script>

<template>
  <component
    :is="first?.owner != null ? 'button' : 'div'"
    v-if="first != null"
    class="background-bar"
    :class="{ tappable: first.owner != null }"
    :type="first.owner != null ? 'button' : undefined"
    data-testid="background-bar"
    @click="goToOwner"
  >
    <span class="label">{{ first.label }}</span>
    <span v-if="rest > 0" class="rest">and {{ rest }} more</span>
    <span class="track" aria-hidden="true">
      <span
        class="fill"
        :class="{ indeterminate: first.progress == null }"
        :style="first.progress != null ? { width: `${Math.round(first.progress * 100)}%` } : undefined"
      />
    </span>
  </component>
</template>

<style scoped>
/* A line with no owner is a caption. A line with an owner leads to its object, which makes it a touch
   target and obliges it to reach the touch minimum: the size follows whether it can be tapped, not
   whichever is easier to draw. */
.background-bar {
  position: relative;
  display: flex;
  width: 100%;
  height: var(--size-2xs);
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: none;
  border-top: 1px solid var(--gray-6);
  background: var(--gray-3);
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  text-align: left;
}

.background-bar.tappable {
  height: var(--size-xl);
  cursor: pointer;
}

.background-bar:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.label {
  overflow: hidden;
  flex: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rest {
  flex-shrink: 0;
  color: var(--gray-10);
}

.track {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  background: var(--gray-5);
}

.fill {
  display: block;
  height: 100%;
  background: var(--accent-9);
}

/* Work with no foreseeable end: the bar travels rather than grows. No fake fraction. */
.fill.indeterminate {
  width: 30%;
  animation: slide 1.2s ease-in-out infinite;
}

@keyframes slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(333%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .fill.indeterminate {
    width: 100%;
    animation: none;
  }
}
</style>
