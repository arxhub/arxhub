<script setup lang="ts">
defineProps<{
  title?: string
  description?: string
  // Mono facts about where the page comes from — a file name, a field count. Joined with a rule.
  meta?: string[]
}>()
</script>

<template>
  <div class="page">
    <header v-if="title || description || meta?.length || $slots.actions" class="header">
      <div class="title-row">
        <h1 v-if="title" class="title">{{ title }}</h1>
        <div v-if="$slots.actions" class="actions">
          <slot name="actions" />
        </div>
      </div>
      <p v-if="description" class="description">{{ description }}</p>
      <div v-if="meta?.length" class="meta">
        <template v-for="(entry, index) in meta" :key="entry">
          <span v-if="index > 0" class="sep">|</span>
          <span>{{ entry }}</span>
        </template>
      </div>
    </header>

    <div class="body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
/* One frame for every full-height page — settings sections, mini-app screens — so padding and heading
   weight cannot drift page by page. No measure: a page fills the width it is given, and the pages that
   are lists or tables were the ones a prose column starved. */
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-family: var(--font-sans);
}

.header {
  flex-shrink: 0;
  padding: 24px 24px 20px;
}

.title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.title {
  margin: 0;
  font-size: 20px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--letter-spacing-tight);
  color: var(--gray-12);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.description {
  margin: 8px 0 0;
  max-width: 62ch;
  font-size: 13px;
  line-height: var(--line-height-relaxed);
  color: var(--gray-11);
}

.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--gray-9);
}

.sep {
  color: var(--gray-6);
}

.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 24px 32px;
}

/* Pinned, so a long page never hides its own actions below the fold. */
.footer {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  padding: 12px 24px;
  border-top: 1px solid var(--gray-6);
  background: var(--gray-2);
}
</style>
