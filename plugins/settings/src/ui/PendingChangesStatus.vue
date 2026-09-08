<script setup lang="ts">
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { StatusDot } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { SETTINGS_TYPE_ID } from '../contributions'
import { SettingsExtension } from '../settings-extension'

const arxhub = useArxHub()
const settings = arxhub.extensions.get(SettingsExtension)
const shell = arxhub.extensions.get(ShellExtension)

const count = computed(() => settings.changes.fieldCount.value)

// Staged edits outlive the screen you made them on, so the status bar has to carry them — otherwise
// navigating away from Settings silently hides work that has not been written yet.
function openSettings(): void {
  shell.workspace.activateType(SETTINGS_TYPE_ID)
}
</script>

<template>
  <button v-if="count > 0" type="button" class="pending" title="Unsaved settings changes" @click="openSettings">
    <StatusDot :tone="settings.changes.invalid.value ? 'danger' : 'warning'" />
    <span>{{ count }} unsaved setting{{ count === 1 ? '' : 's' }}</span>
  </button>
</template>

<style scoped>
.pending {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: var(--size-md);
  padding: 0 8px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  white-space: nowrap;
}

.pending:hover {
  background: var(--gray-4);
  color: var(--gray-12);
}

.pending:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}
</style>
