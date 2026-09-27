<script setup lang="ts">
import { readText } from '@arxhub/i18n'
import { PageLayout } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { t } from '../i18n/messages'
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
    :title="readText(section.title)"
    :schema="section.schema"
    :config="section.config"
    :description="readText(section.description)"
    :messages="section.messages"
  />
  <PageLayout v-else :title="t('type.title')">
    <p class="settings-missing">{{ t('page.unknown', { id: sectionId }) }}</p>
  </PageLayout>
</template>

<style scoped>
.settings-missing {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--gray-10);
}
</style>
