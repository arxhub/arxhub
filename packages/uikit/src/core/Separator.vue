<script setup lang="ts">
withDefaults(
  defineProps<{
    orientation?: 'horizontal' | 'vertical'
    // When true, acts as a flexible spacer that pushes following items apart.
    grow?: boolean
  }>(),
  { orientation: 'vertical', grow: false },
)
</script>

<template>
  <span
    class="separator"
    :class="[orientation, { grow }]"
    role="separator"
    :aria-orientation="orientation"
  />
</template>

<style scoped>
.separator {
  flex-shrink: 0;
  background: var(--gray-4);
}

/* No margin of its own: every call site places this inside a flex row that already has `gap`, and a
   margin here on top of that gap doubled the space around a separator versus between two plain icons. */
.separator.vertical {
  width: 1px;
  height: 16px;
}

.separator.horizontal {
  width: 100%;
  height: 1px;
}

.separator.grow {
  flex: 1;
  background: transparent;
  margin: 0;
}
</style>
