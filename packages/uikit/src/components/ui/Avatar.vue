<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  src: string
  alt?: string
}>()

const hasError = ref(false)
</script>

<template>
  <div class="avatar">
    <img 
      v-if="!hasError"
      :src="src" 
      :alt="alt || 'Avatar'" 
      class="avatar-img" 
      @error="hasError = true"
    />
    <div v-else class="avatar-fallback">
      {{ (alt || 'A').charAt(0).toUpperCase() }}
    </div>
  </div>
</template>

<style scoped>
.avatar {
  width: 2rem; /* size-8 */
  height: 2rem;
  border-radius: 9999px;
  background-color: #334155; /* slate-700 */
  border: 1px solid var(--border-cold);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--radix-gray-3);
  color: var(--text-muted);
  font-size: 0.875rem;
  font-weight: 600;
}
</style>
