<script setup lang="ts">
import { Button, Strip } from '@arxhub/uikit/core'
import type { TabTypeCreate } from '../tab-type'

// The band between the tab strip and the content, for creating when the type has nowhere else to put it.
// The button normally lives in the navigation column's own strip, but a type may declare `create` without
// declaring `nav` — and then the role it declared would be unreachable. There are no unreachable roles.
//
// The object's own tools are not here: on the desktop an editor publishes them into its tab strip
// (`usePanelChrome`), and the band a type describes (`TabType.bar`) is the phone's.
//
// No band at all while there is nothing to put in it: empty chrome spends window height and reads as a
// header that forgot its title.
const props = defineProps<{ create: TabTypeCreate | null }>()
</script>

<template>
  <Strip v-if="props.create != null" class="dock" data-testid="dock">
    <template #actions>
      <Button variant="secondary" size="sm" data-testid="dock-create" @click="props.create?.run()">{{ props.create.title }}</Button>
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
