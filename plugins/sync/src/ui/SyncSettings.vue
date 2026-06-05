<script setup lang="ts">
import { readConfig, writeConfig } from '@arxhub/config'
import { ConfigForm } from '@arxhub/config/ui'
import { VfsExtension } from '@arxhub/plugin-vfs/ui'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onMounted, ref } from 'vue'
import { SyncConfigSchema } from '../sync-plugin'

const arxhub = useArxHub()
const { vfs } = arxhub.extensions.get(VfsExtension)

const values = ref<Record<string, unknown>>({})

onMounted(async () => {
  const cfg = await readConfig(vfs, 'sync', SyncConfigSchema)
  values.value = cfg as Record<string, unknown>
})

async function onSave(data: Record<string, unknown>) {
  await writeConfig(vfs, 'sync', SyncConfigSchema, data)
  values.value = { ...values.value, ...data }
}
</script>

<template>
  <div class="sync-settings">
    <h3 class="title">Sync Settings</h3>
    <p class="hint">Changes take effect on the next sync or app restart.</p>
    <ConfigForm :schema="SyncConfigSchema" :values="values" @save="onSave" />
  </div>
</template>

<style scoped>
.sync-settings {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
}

.title {
  font-size: var(--font-size-sm);
  font-family: var(--font-sans);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
  margin: 0;
}

.hint {
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  color: var(--gray-10);
  margin: 0;
}
</style>
