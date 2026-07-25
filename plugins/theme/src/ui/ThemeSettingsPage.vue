<script setup lang="ts">
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { ThemeExtension } from '../theme-extension'

const emit = defineEmits<{ select: [id: string] }>()

const arxhub = useArxHub()
const themes = arxhub.extensions.get(ThemeExtension)
const active = computed(() => themes.activeId.value)
</script>

<template>
  <div class="themes">
    <p class="hint">
      A theme is a whole unit — a dark theme is a different theme, not a switch on this one.
    </p>
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
             theme currently applied. -->
        <span class="swatches" :data-arxhub-theme="theme.id" aria-hidden="true">
          <span class="swatch bg" />
          <span class="swatch surface" />
          <span class="swatch border" />
          <span class="swatch accent" />
          <span class="swatch text" />
        </span>
        <span class="title">{{ theme.title }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.themes {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  font-family: var(--font-sans);
}

.hint {
  margin: 0;
  max-width: 60ch;
  font-size: var(--font-size-xs);
  color: var(--gray-11);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 0.75rem;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
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
  height: 2rem;
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
