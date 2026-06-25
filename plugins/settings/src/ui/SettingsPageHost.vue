<script setup lang="ts">
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { SettingsExtension } from '../settings-extension'
import SchemaSettingsPage from './SchemaSettingsPage.vue'

const props = defineProps<{ sectionId: string }>()

const arxhub = useArxHub()
const settings = arxhub.extensions.get(SettingsExtension)

const section = computed(() => settings.sections.value.find((s) => s.id === props.sectionId))
</script>

<template>
  <component :is="section.component" v-if="section?.component" />
  <SchemaSettingsPage
    v-else-if="section?.schema && section?.config"
    :section-id="section.id"
    :title="section.title"
    :schema="section.schema"
    :config="section.config"
  />
  <div v-else class="settings-missing">Unknown settings section: {{ sectionId }}</div>
</template>

<style scoped>
.settings-missing {
  padding: 1rem;
  font-size: var(--font-size-sm);
  font-family: var(--font-sans);
  color: var(--gray-10);
}
</style>
