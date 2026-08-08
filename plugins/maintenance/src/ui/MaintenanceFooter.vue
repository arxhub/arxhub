<script setup lang="ts">
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { useArxHub } from '@arxhub/uikit/hooks'

const arxhub = useArxHub()
const shell = arxhub.extensions.get(ShellExtension)
const settings = arxhub.extensions.get(SettingsExtension)

function openPlugins(): void {
  settings.open('plugins')
  shell.sidebar.setActive('arxhub.settings')
}
</script>

<template>
  <button class="maintenance" type="button" title="Only essential plugins are running" @click="openPlugins">
    Maintenance mode
  </button>
</template>

<style scoped>
.maintenance {
  align-self: center;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: var(--radius-xs);
  background: var(--warning-3);
  color: var(--warning-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.maintenance:hover {
  background: var(--warning-4);
}

.maintenance:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: 1px;
}
</style>
