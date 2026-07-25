<script setup lang="ts">
defineProps<{ version: string }>()
</script>

<template>
  <div class="about">
    <h3 class="about-title">ArxHub</h3>
    <p class="about-row">
      <span class="label">Version</span>
      <code class="value" data-testid="app-version">{{ version }}</code>
    </p>
    <p class="hint">Quote this version when reporting a problem — the session log records it too.</p>
  </div>
</template>

<style scoped>
.about {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  font-family: var(--font-sans);
}

.about-title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.about-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}

.label {
  font-size: var(--font-size-xs);
  color: var(--gray-11);
}

.value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-12);
}

.hint {
  margin: 0;
  max-width: 60ch;
  font-size: var(--font-size-xs);
  color: var(--gray-11);
}
</style>
