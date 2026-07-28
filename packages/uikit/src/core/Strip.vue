<script setup lang="ts">
// The one band above content: a header, a tab bar, a formatting row, a filter row. Geometry lives here
// and nowhere else (DS-1) — a consumer passes content, never a height, a padding, a surface or a border.
// A strip with a title and a strip with only controls are the SAME role (DS-2 in .claude/rules/design.md),
// which is why the title is a slot rather than a second component: eight implementations with five
// paddings, two surfaces and two border steps is what the second component produced.
withDefaults(
  defineProps<{
    title?: string
    // A strip divides two regions and says so with a rule. The exception is a strip that is already
    // inside a bordered box (a dialog closes its own edge), not a matter of taste.
    bordered?: boolean
  }>(),
  { bordered: true },
)
</script>

<template>
  <div class="strip" :class="{ bordered }">
    <span v-if="title || $slots.title" class="strip-title">
      <slot name="title">{{ title }}</slot>
    </span>
    <div class="strip-content">
      <slot />
    </div>
    <div v-if="$slots.actions" class="strip-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  height: var(--size-md);
  padding: 0 8px;
  background: var(--gray-2);
  font-size: var(--font-size-sm);
}

.strip.bordered {
  border-bottom: 1px solid var(--gray-6);
}

/* 8px more than the strip's own inset, so a title reads as a label of the region rather than as the
   first control in a row of them. */
.strip-title {
  flex-shrink: 0;
  padding-left: 8px;
  color: var(--gray-12);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.strip-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.strip-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: auto;
}
</style>
