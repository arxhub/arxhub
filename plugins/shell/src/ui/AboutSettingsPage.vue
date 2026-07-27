<script setup lang="ts">
import { PageLayout } from '@arxhub/uikit/core'

defineProps<{ version: string }>()
</script>

<template>
  <PageLayout
    title="About"
    description="Quote this version when reporting a problem — the session log records it too."
  >
    <div class="about-row">
      <span class="label">Version</span>
      <code class="value" data-testid="app-version">{{ version }}</code>
    </div>
  </PageLayout>
</template>

<style scoped>
.about-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  font-size: var(--font-size-sm);
  color: var(--gray-11);
}

.value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-12);
}
</style>
