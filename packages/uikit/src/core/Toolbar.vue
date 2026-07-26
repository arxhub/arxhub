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
  min-height: 32px;
  padding: 4px;
  flex-shrink: 0;
  background: var(--gray-2);
}

/* A hairline, not a structural rule: a toolbar sits inside a region, it doesn't divide two of them. */
.toolbar.bordered {
  border-bottom: 1px solid var(--gray-4);
}

.toolbar.wrap {
  flex-wrap: wrap;
}
</style>
