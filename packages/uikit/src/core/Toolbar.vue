<script setup lang="ts">
withDefaults(
  defineProps<{
    gap?: number
    wrap?: boolean
    bordered?: boolean
  }>(),
  { gap: 4, wrap: false, bordered: true },
)
</script>

<template>
  <div
    class="toolbar"
    :class="{ bordered, wrap }"
    :style="{ gap: `${gap}px` }"
  >
    <slot />
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  flex-shrink: 0;
  background: var(--gray-1);
}

.toolbar.bordered {
  border-bottom: 1px solid var(--gray-6);
}

.toolbar.wrap {
  flex-wrap: wrap;
}
</style>
