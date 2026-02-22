<script setup lang="ts">
defineProps<{
  value: number
  max?: number
}>()
</script>

<template>
  <div class="progress-bar">
    <div 
      class="progress-fill" 
      :style="{ width: `${(value / (max || 100)) * 100}%` }"
    ></div>
  </div>
</template>

<style scoped>
.progress-bar {
  width: 100%;
  height: 0.375rem; /* h-1.5 */
  background-color: var(--radix-gray-3);
  border-radius: 9999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: var(--primary);
  border-radius: 9999px;
  transition: width 0.3s ease;
}
</style>
