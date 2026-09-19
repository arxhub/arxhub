<script setup lang="ts">
import { useShellFrame } from '../hooks/useShellFrame'
import Icon from './Icon.vue'
import IconButton from './IconButton.vue'

defineProps<{
  title: string
  subtitle?: string
  icon?: string
  variant?: 'success' | 'warning' | 'danger' | 'info'
}>()

defineEmits<(e: 'close') => void>()
const dismissSize = useShellFrame() === 'mobile' ? 'xl' : 'xs'
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
    <IconButton icon="lu:x" :size="dismissSize" aria-label="Dismiss" @click="$emit('close')" />
  </div>
</template>

<style scoped>
.notification {
  width: 100%;
  background-color: var(--gray-2);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  padding: 12px;
  box-shadow: var(--shadow-md);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-family: var(--font-sans);
}

.notification.info .icon-wrapper {
  color: var(--info-11);
}
.notification.success .icon-wrapper {
  color: var(--success-11);
}
.notification.warning .icon-wrapper {
  color: var(--warning-11);
}
.notification.danger .icon-wrapper {
  color: var(--danger-11);
}

.content {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.text-content {
  min-width: 0;
}

.title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.subtitle {
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}
</style>
