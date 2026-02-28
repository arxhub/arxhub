<script setup lang="ts">
import { Avatar } from '@ark-ui/vue'

defineProps<{
  src: string
  alt?: string
}>()
</script>

<template>
  <Avatar.Root class="root">
    <Avatar.Image class="image" :src="src" :alt="alt || 'Avatar'" />
    <Avatar.Fallback class="fallback">{{ (alt || 'A').charAt(0).toUpperCase() }}</Avatar.Fallback>
  </Avatar.Root>
</template>

<style scoped>
.root {
  width: var(--size-xs);
  height: var(--size-xs);
  border-radius: var(--radius-full);
  border: 1px solid var(--gray-6);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--gray-3);
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  font-weight: 600;
}
</style>
