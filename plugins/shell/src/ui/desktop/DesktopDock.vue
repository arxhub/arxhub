<script setup lang="ts">
import { Button, Strip } from '@arxhub/uikit/core'
import type { Component } from 'vue'
import type { TabTypeCreate } from '../tab-type'

// The band between the tab strip and the content. It holds two things:
//
// 1. The dock of the active tab: the type declares it once, the active object fills it.
// 2. Creating, when the type has nowhere else to put it. The button normally lives in the navigation
//    column's own strip, but a type may declare `create` without declaring `nav` — and then the role it
//    declared would be unreachable. There are no unreachable roles.
//
// No band at all while there is nothing to put in it: empty chrome spends window height and reads as a
// header that forgot its title. There is never a navigation key here, unlike on the phone — the column
// is permanently on screen.
const props = defineProps<{ component: Component | null; create: TabTypeCreate | null }>()
</script>

<template>
  <Strip v-if="props.component != null || props.create != null" class="dock" data-testid="dock">
    <component :is="props.component" v-if="props.component != null" />
    <template v-if="props.create != null" #actions>
      <Button variant="secondary" size="sm" data-testid="dock-create" @click="props.create.run()">{{ props.create.title }}</Button>
    </template>
  </Strip>
</template>

<style scoped>
/* The page surface, not the panel one: the dock belongs to the document under it, and a strip on
   --gray-2 here would read as a second tab bar. */
.dock {
  background: var(--gray-1);
}
</style>
