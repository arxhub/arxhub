<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { FooterItem } from '../extension'
import type { StatusRegistry } from '../status'
import type { Workspace } from '../workspace'

// The status bar: states on the left, actions on the right, and nothing else ever.
//
// It reads BOTH registries on purpose. `status` is the grammar a plugin declares WHAT it contributes
// in ('status' | 'action'), and it is where the fifteen existing registrations are going (F-11); until
// they move, `footer.register({ region })` is what every one of them still uses, and dropping it here
// would empty the bar. Two sources, one bar — and the bar is the thing that ends up with one of them.
//
// There is no background line on the desktop: the bar is permanently on screen, and a second strip over
// it would repeat it one row down. But `busy` IS read here, and not as a strip — as a road. The phone's
// background line leads to the object the work belongs to, and a desktop that led nowhere would be a
// divergence in MEANING rather than in layout.
const props = defineProps<{
  status: StatusRegistry
  workspace: Workspace
  left: FooterItem[]
  right: FooterItem[]
}>()

// Only work that has an owner: indexing and sync legitimately have none, and pretending there is
// somewhere to go would be a lie.
const owned = computed(() => props.status.busy.value.filter((it) => it.owner != null))
</script>

<template>
  <footer class="status-bar" data-testid="shell-footer">
    <div class="states">
      <component :is="item.component" v-for="item in props.left" :key="item.id" />
      <component :is="item.component" v-for="item in props.status.statuses.value" :key="item.id" />

      <!-- A target of its own rather than a click on the whole item: the component comes from a
           plugin and may hold a button, and wrapping someone else's control in a button gives a
           button inside a button. -->
      <button
        v-for="work in owned"
        :key="`owner:${work.id}`"
        type="button"
        class="owner"
        :data-testid="`busy-owner-${work.id}`"
        :aria-label="`Go to what is running: ${work.label}`"
        @click="work.owner && props.workspace.activateObject(work.owner.typeId, work.owner.objectKey)"
      >
        <Icon name="lu:arrow-right" :size="14" />
        <span>{{ work.label }}</span>
      </button>
    </div>
    <span class="spacer" />
    <div class="actions">
      <component :is="item.component" v-for="item in props.right" :key="item.id" />
      <component :is="item.component" v-for="item in props.status.actions.value" :key="item.id" />
    </div>
  </footer>
</template>

<style scoped>
.status-bar {
  /* var(--size-md), not the Control role's --size-xs: the type rail's own keys are size="lg" (40px),
     and a shorter bar left a jog where the two met instead of one level seam. */
  height: var(--size-md);
  width: 100%;
  background-color: var(--gray-2);
  border-top: 1px solid var(--gray-6);
  display: flex;
  align-items: stretch;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  flex-shrink: 0;
  z-index: var(--z-index-docked);
  user-select: none;
}

.states,
.actions {
  display: flex;
  min-width: 0;
  align-items: stretch;
  height: 100%;
  overflow: hidden;
  white-space: nowrap;
}

.spacer {
  flex: 1;
  min-width: 8px;
}

.owner {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.owner:hover {
  background: var(--gray-4);
  color: var(--gray-12);
}

.owner:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}
</style>
