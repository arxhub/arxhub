<script setup lang="ts">
import { Icon } from '@arxhub/uikit/core'
import type { Component } from 'vue'
import type { TabTypeCreate } from '../tab-type'

// The band directly above the type row — the most reachable part of the screen. It holds three
// different things, deliberately:
//
// 1. The key that opens the type's navigation. The FRAME puts it there, not the type: navigation
//    belongs to many types, and making each draw its own button would give seven different ones. The
//    left-edge swipe does the same thing, but a gesture is invisible — and the only road to the tree
//    has no right to be.
// 2. Creating, but only for a type WITHOUT navigation: the button normally lives in the navigation
//    layer, and two buttons for one action would be worse than one. A type may declare `create` and no
//    `nav`, and then the role would be unreachable.
// 3. The dock of the active tab: the type declares it, the active object fills it.
//
// None of the three — no band at all: an empty one would spend 48px on nothing, on the frame with the
// least room to spare.
const props = defineProps<{ component: Component | null; navTitle: string | null; create: TabTypeCreate | null }>()
const emit = defineEmits<{ nav: [] }>()
</script>

<template>
  <div v-if="props.component != null || props.navTitle != null || props.create != null" class="dock" data-testid="dock">
    <button
      v-if="props.navTitle != null"
      type="button"
      class="key"
      data-testid="arxhub.shell.rail"
      :aria-label="props.navTitle"
      @click="emit('nav')"
    >
      <Icon name="lu:panel-bottom" :size="16" />
      <span class="key-label">{{ props.navTitle }}</span>
    </button>

    <button
      v-if="props.create != null && props.navTitle == null"
      type="button"
      class="key"
      data-testid="dock-create"
      :aria-label="props.create.title"
      @click="props.create.run()"
    >
      <Icon :name="props.create.icon ?? 'lu:plus'" :size="16" />
    </button>

    <div v-if="props.component != null" class="tools">
      <component :is="props.component" />
    </div>
  </div>
</template>

<style scoped>
.dock {
  display: flex;
  height: var(--size-xl);
  flex-shrink: 0;
  align-items: stretch;
  /* The rule above is a shadow rather than a border: a border would take a pixel off the content's
     own height, and the navigation key would come out one below the touch minimum — on the target
     that is the main road to a type's tree. */
  box-shadow: inset 0 1px 0 var(--gray-6);
  background: var(--gray-2);
}

.key {
  display: flex;
  min-width: var(--size-xl);
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border: none;
  border-right: 1px solid var(--gray-6);
  background: transparent;
  color: var(--gray-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.key:active {
  background: var(--gray-4);
}

.key:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.key-label {
  overflow: hidden;
  max-width: 12ch;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The object's tools scroll sideways rather than wrapping: wrapping would make the band two storeys
   tall and eat the content the screen is open for. */
.tools {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}

.tools::-webkit-scrollbar {
  display: none;
}
</style>
