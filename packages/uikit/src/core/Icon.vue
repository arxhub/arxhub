<script setup lang="ts">
defineProps<{
  name: string
  size?: number
  filled?: boolean
  ariaLabel?: string
}>()
</script>

<template>
  <span 
    class="material-symbols-outlined" 
    :style="{ 
      fontSize: size ? `${size}px` : '20px',
      fontVariationSettings: filled ? `'FILL' 1` : `'FILL' 0`
    }"
    :aria-hidden="!ariaLabel"
    :aria-label="ariaLabel"
    :role="ariaLabel ? 'img' : undefined"
  >
    {{ name }}
  </span>
</template>

<style scoped>
.material-symbols-outlined {
  user-select: none;
  display: inline-block;
  vertical-align: middle;
}
</style>
