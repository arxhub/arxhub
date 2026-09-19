<script setup lang="ts">
import type { PluginConfig } from '@arxhub/config'
import { ConfigForm } from '@arxhub/config/ui'
import { PageLayout } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import type { TObject } from '@sinclair/typebox'
import { ref, watch } from 'vue'
import { SettingsExtension } from '../settings-extension'

const props = defineProps<{
  sectionId: string
  title: string
  schema: TObject
  config: PluginConfig
}>()

const arxhub = useArxHub()
const settings = arxhub.extensions.get(SettingsExtension)

const values = ref<Record<string, unknown>>({})
const draft = ref<Record<string, unknown> | undefined>(undefined)
const form = ref<{ revert: () => void } | null>(null)

// Reload whenever the section changes (not just on mount) — the host may reuse this component
// for a different section. immediate:true covers the initial load.
watch(
  () => props.sectionId,
  async (sectionId) => {
    // Read once, inside the callback, so restoring the draft does not become a reactive dependency
    // that would re-seed the form from its own output on every keystroke.
    const staged = settings.changes.draftFor(sectionId)
    let cfg: Record<string, unknown>
    try {
      cfg = (await props.config.read(props.schema)) as Record<string, unknown>
    } catch (error) {
      arxhub.logger.error(`[settings] failed to load config for ${sectionId}:`, error)
      cfg = {}
    }
    // Drop a stale resolution: if the active section changed while this load was in flight, applying
    // it would show (and let a save persist) the wrong section's values into the new section's file.
    if (sectionId !== props.sectionId) return
    values.value = cfg
    draft.value = staged
  },
  { immediate: true },
)

// The page holds no Save of its own: it hands the draft to the shared set of pending changes, and
// the settings frame applies every section's at once.
function onChange(next: { values: Record<string, unknown>; changedKeys: string[]; invalid: boolean }): void {
  settings.changes.stage({
    sectionId: props.sectionId,
    title: props.title,
    values: next.values,
    keys: next.changedKeys,
    invalid: next.invalid,
    commit: async () => {
      const snapshot = settings.changes.draftFor(props.sectionId)
      if (!snapshot) return
      await props.config.write(props.schema, snapshot)
      values.value = { ...snapshot }
      draft.value = undefined
    },
    revert: () => form.value?.revert(),
  })
}
</script>

<template>
  <PageLayout :title="title" :description="schema.description">
    <ConfigForm ref="form" :schema="schema" :values="values" :draft="draft" @change="onChange" />
  </PageLayout>
</template>
