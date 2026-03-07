<script setup lang="ts">
import Icon from '../ui/Icon.vue'

defineProps<{
  title: string
  subtitle?: string
  icon?: string
  variant?: 'success' | 'error' | 'info'
}>()

defineEmits<{
  (e: 'close'): void
}>()
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
      <Icon name="close" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.notification {
  width: 100%;
  background-color: var(--radix-gray-1);
  border: 1px solid var(--border-cold);
  border-radius: var(--radius-lg);
  padding: 0.75rem; /* p-3 */
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); /* shadow-2xl */
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-left-width: 2px;
}

.notification.info {
  border-left-color: var(--primary);
}
.notification.info .icon-wrapper {
  color: var(--primary);
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
  color: var(--text-main);
  font-weight: 700;
}

.subtitle {
  color: var(--text-muted);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
