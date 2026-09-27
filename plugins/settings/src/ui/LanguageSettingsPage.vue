<script setup lang="ts">
import { useLanguage } from '@arxhub/i18n'
import { PageLayout, RadioGroup } from '@arxhub/uikit/core'
import { computed } from 'vue'
import { t } from '../i18n/messages'
import { isLanguagePreference, languageOptions } from '../language-section'

// Applied on the spot, like a theme pick: it is device-local and not schema-backed config, so it has no
// place in the staged set Save applies.
const { preference, setPreference } = useLanguage()
const options = computed(() => languageOptions())

function select(value: string) {
  if (isLanguagePreference(value)) setPreference(value)
}
</script>

<template>
  <PageLayout :title="t('language.title')" :description="t('language.description')">
    <RadioGroup
      :model-value="preference"
      :options="options"
      :aria-label="t('language.label')"
      data-testid="language-choice"
      @update:model-value="select"
    />
  </PageLayout>
</template>
