<script setup lang="ts">
import { Button, Icon, OverflowActions, Strip } from '@arxhub/uikit/core'
import type { ObjectBar } from '../tab-type'

// The band above the type row: where I am inside the type, and what can be done to it. Every type's band
// is drawn HERE from the data it describes (`TabType.bar`), so the geometry of this band exists once —
// the defect it replaced was a bottom bar of their own in each of four plugins.
//
// Nothing interactive sits at the top of the phone's screen, so this band never hides on scroll: it is
// the only road to the object's actions.
const props = defineProps<{ bar: ObjectBar; typing: boolean; partsOpen: boolean }>()
const emit = defineEmits<{ parts: [] }>()
</script>

<template>
  <Strip below flush class="object-bar" data-testid="object-bar">
    <!-- While the keyboard is up the band is the editor's: undo and redo belong to editing, which is
         exactly when they are needed, and the type row has made room by going away. -->
    <component :is="props.bar.editing" v-if="props.typing && props.bar.editing != null" />
    <template v-else>
      <!-- The name leads somewhere only for a composite object; for a plain document a chevron would
           promise a sheet with one row in it. -->
      <Button
        v-if="props.bar.parts != null"
        variant="ghost"
        align="start"
        class="name"
        :class="{ open: props.partsOpen }"
        aria-haspopup="dialog"
        :aria-expanded="props.partsOpen"
        :aria-label="`${props.bar.name}: ${props.bar.parts.title}`"
        data-testid="object-bar-parts"
        @click="emit('parts')"
      >
        <Icon :name="props.bar.icon" :size="16" />
        <span class="text">{{ props.bar.name }}<span v-if="props.bar.sub" class="sub"> · {{ props.bar.sub }}</span></span>
        <Icon name="lu:chevron-up" :size="16" />
      </Button>
      <div v-else class="name label" data-testid="object-bar-name">
        <Icon :name="props.bar.icon" :size="16" />
        <span class="text">{{ props.bar.name }}<span v-if="props.bar.sub" class="sub"> · {{ props.bar.sub }}</span></span>
      </div>
      <OverflowActions
        align="end"
        class="actions"
        :actions="props.bar.actions ?? []"
        :menu="props.bar.menu ?? []"
        more-label="More actions"
        :more-title="props.bar.name"
      />
    </template>
  </Strip>
</template>

<style scoped>
/* The name takes whatever the fitted keys leave; the keys give way into More before the name does. */
.name {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border-radius: 0;
}

/* The same colour and weight the ghost Button draws, so only the chevron and the hover tell a name that
   leads somewhere from one that does not. */
.label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  color: var(--gray-11);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-medium);
}

/* The parts sheet is up: a raised layer, never the accent (F-17). */
.name.open {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

.text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub {
  color: var(--gray-11);
}

.actions {
  flex: 0 1 auto;
}
</style>
