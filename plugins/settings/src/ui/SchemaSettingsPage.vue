<script setup lang="ts">
import type { PluginConfig } from '@arxhub/config'
import { ConfigForm } from '@arxhub/config/ui'
import { useArxHub } from '@arxhub/uikit/hooks'
import type { TObject } from '@sinclair/typebox'
import { ref, watch } from 'vue'

const props = defineProps<{
  sectionId: string
  title: string
  schema: TObject
  config: PluginConfig
}>()

const arxhub = useArxHub()

const values = ref<Record<string, unknown>>({})

// Reload whenever the section changes (not just on mount) — the host may reuse this component
// for a different section. immediate:true covers the initial load.
watch(
  () => props.sectionId,
  async (sectionId) => {
    let cfg: Record<string, unknown>
    try {
      cfg = (await props.config.read(props.schema)) as Record<string, unknown>
    } catch (error) {
      arxhub.logger.error(`[settings] failed to load config for ${sectionId}:`, error)
      cfg = {}
    }
    // Drop a stale resolution: if the active section changed while this load was in flight, applying
    // it would show (and let onSave persist) the wrong section's values into the new section's file.
    if (sectionId !== props.sectionId) return
    values.value = cfg
  },
  { immediate: true },
)

async function onSave(data: Record<string, unknown>) {
  await props.config.write(props.schema, data)
  values.value = { ...values.value, ...data }
}
</script>

<template>
  <div class="schema-settings-page">
    <h3 class="title">{{ title }}</h3>
    <ConfigForm :schema="schema" :values="values" @save="onSave" />
  </div>
</template>

<style scoped>
.schema-settings-page {
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
</style>
