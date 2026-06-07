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
  background: var(--gray-5);
}

.separator.vertical {
  width: 1px;
  height: 16px;
  margin: 0 4px;
}

.separator.horizontal {
  width: 100%;
  height: 1px;
  margin: 4px 0;
}

.separator.grow {
  flex: 1;
  background: transparent;
  margin: 0;
}
</style>
