<script setup lang="ts">
import { PageLayout } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { ThemeExtension } from '../theme-extension'

const emit = defineEmits<{ select: [id: string] }>()

const arxhub = useArxHub()
const themes = arxhub.extensions.get(ThemeExtension)
const active = computed(() => themes.activeId.value)
</script>

<template>
  <PageLayout
    title="Appearance"
    description="A theme is a whole unit — a dark theme is a different theme, not a switch on this one."
  >
    <div class="grid" role="radiogroup" aria-label="Theme">
      <button
        v-for="theme in themes.themes.value"
        :key="theme.id"
        type="button"
        role="radio"
        class="card"
        :class="{ active: theme.id === active }"
        :aria-checked="theme.id === active"
        :data-testid="`theme-${theme.id}`"
        @click="emit('select', theme.id)"
      >
        <!-- Swatches read from the theme's own scope, so each card previews itself rather than the
             theme currently applied. Both attributes, exactly as apply() sets them on the root: a
             theme that maps the shared scales rather than naming colours resolves them off the base. -->
        <span class="swatches" :data-arxhub-theme="theme.id" :data-theme="theme.base" aria-hidden="true">
          <span class="swatch bg" />
          <span class="swatch surface" />
          <span class="swatch border" />
          <span class="swatch accent" />
          <span class="swatch text" />
        </span>
        <span class="title">{{ theme.title }}</span>
      </button>
    </div>
  </PageLayout>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(176px, 1fr));
  gap: 12px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-md);
  background: var(--gray-2);
  color: var(--gray-12);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  text-align: left;
  cursor: pointer;
}

.card:hover {
  background: var(--gray-4);
}

.card.active {
  border-color: var(--accent-9);
  box-shadow: 0 0 0 1px var(--accent-9);
}

.swatches {
  display: flex;
  height: var(--size-xs);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.swatch {
  flex: 1;
}

.bg {
  background: var(--gray-1);
}

.surface {
  background: var(--gray-4);
}

.border {
  background: var(--gray-7);
}

.accent {
  background: var(--accent-9);
}

.text {
  background: var(--gray-12);
}

.title {
  font-weight: var(--font-weight-medium);
}
</style>
