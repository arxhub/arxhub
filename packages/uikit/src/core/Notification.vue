<script setup lang="ts">
import Icon from './Icon.vue'
import IconButton from './IconButton.vue'

defineProps<{
  title: string
  subtitle?: string
  icon?: string
  variant?: 'success' | 'warning' | 'danger' | 'info'
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
    <IconButton icon="lu:x" size="xs" aria-label="Dismiss" @click="$emit('close')" />
  </div>
</template>

<style scoped>
.notification {
  width: 100%;
  background-color: var(--gray-1);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-lg);
  padding: 0.75rem;
  box-shadow: var(--shadow-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.notification.info .icon-wrapper {
  color: var(--info-9);
}
.notification.success .icon-wrapper {
  color: var(--success-9);
}
.notification.warning .icon-wrapper {
  color: var(--warning-9);
}
.notification.danger .icon-wrapper {
  color: var(--danger-9);
}

.content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.text-content {
  font-size: var(--font-size-xs);
}

.title {
  color: var(--gray-12);
  font-weight: var(--font-weight-bold);
}

.subtitle {
  color: var(--gray-10);
}
</style>
