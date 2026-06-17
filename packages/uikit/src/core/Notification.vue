<script setup lang="ts">
import Icon from './Icon.vue'

defineProps<{
  title: string
  subtitle?: string
  icon?: string
  variant?: 'success' | 'error' | 'info'
}>()

defineEmits<(e: 'close') => void>()
</script>

<template>
  <div class="notification" :class="variant || 'info'">
    <div class="content">
      <div class="icon-wrapper" v-if="icon">
        <Icon :name="icon" :size="20" />
      </div>
      <div class="text-content">
        <div class="title">{{ title }}</div>
        <div v-if="subtitle" class="subtitle">{{ subtitle }}</div>
      </div>
    </div>
    <button class="close-btn" @click="$emit('close')">
      <Icon name="lu:x" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.notification {
  width: 100%;
  background-color: var(--gray-1);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-lg);
  padding: 0.75rem; /* p-3 */
  box-shadow: var(--shadow-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-left-width: 2px;
}

.notification.info {
  border-left-color: var(--accent-9);
}
.notification.info .icon-wrapper {
  color: var(--accent-9);
}

.notification.success {
  border-left-color: var(--green-9);
}
.notification.success .icon-wrapper {
  color: var(--green-9);
}

.notification.error {
  border-left-color: var(--red-9);
}
.notification.error .icon-wrapper {
  color: var(--red-9);
}

.content {
  display: flex;
  align-items: center;
  gap: 0.75rem; /* gap-3 */
}

.text-content {
  font-size: 0.6875rem; /* text-[11px] */
}

.title {
  color: var(--gray-12);
  font-weight: 700;
}

.subtitle {
  color: var(--gray-10);
}

.close-btn {
  background: none;
  border: none;
  color: var(--gray-10);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
