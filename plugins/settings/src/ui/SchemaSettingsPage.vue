<script setup lang="ts">
import { readConfig, writeConfig } from '@arxhub/config'
import { ConfigForm } from '@arxhub/config/ui'
import { VfsExtension } from '@arxhub/plugin-vfs/ui'
import { useArxHub } from '@arxhub/uikit/hooks'
import type { TObject } from '@sinclair/typebox'
import { onMounted, ref } from 'vue'

const props = defineProps<{
  sectionId: string
  title: string
  schema: TObject
}>()

const arxhub = useArxHub()
const { vfs } = arxhub.extensions.get(VfsExtension)

const values = ref<Record<string, unknown>>({})

onMounted(async () => {
  const cfg = await readConfig(vfs, props.sectionId, props.schema)
  values.value = cfg as Record<string, unknown>
})

async function onSave(data: Record<string, unknown>) {
  await writeConfig(vfs, props.sectionId, props.schema, data)
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
