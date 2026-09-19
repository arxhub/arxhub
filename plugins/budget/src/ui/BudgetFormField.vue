<script setup lang="ts">
defineProps<{
  label: string
  forId?: string
  hint?: string
  error?: string | null
}>()
</script>

<template>
  <div class="field">
    <label v-if="forId" class="label" :for="forId">{{ label }}</label>
    <div v-else class="label" :id="`${label.replaceAll(' ', '-').toLowerCase()}-label`">{{ label }}</div>
    <slot />
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.hint,
.error {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
}

.hint {
  color: var(--gray-11);
}

.error {
  color: var(--danger-11);
}
</style>
