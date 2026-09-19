<script setup lang="ts">
import { ConfigForm } from '@arxhub/config/ui'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { Button, PageLayout, StatusDot } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, onMounted, ref } from 'vue'
import { SEARCH_SETTINGS_SECTION } from '../contributions'
import { type SearchConfig, SearchConfigSchema, toSearchSettings } from '../search-config'
import { SearchExtension } from '../search-extension'
import { useIndexStatus } from './use-index-status'

const arxhub = useArxHub()
const search = arxhub.extensions.get(SearchExtension)
const settings = arxhub.extensions.get(SettingsExtension)
const index = useIndexStatus()
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const values = ref<Record<string, unknown>>({})
const draft = ref<Record<string, unknown> | undefined>(undefined)
const form = ref<{ revert: () => void } | null>(null)
const loadError = ref<string | null>(null)

const fieldCount = computed(() => Object.keys(SearchConfigSchema.properties).length)
const meta = computed(() => [`${fieldCount.value} fields`, 'storage/search/config.toml'])

// Read once, on mount. The staged draft is read inside the same step rather than watched: reading it
// reactively would re-seed the form from its own output on every keystroke.
onMounted(async () => {
  const staged = settings.changes.draftFor(SEARCH_SETTINGS_SECTION)
  try {
    values.value = (await search.config.read(SearchConfigSchema)) as Record<string, unknown>
  } catch (error) {
    // A section that cannot read its file must not offer to write one: a form seeded from defaults would
    // save those defaults over settings it never saw.
    arxhub.logger.error('[search] could not load the search settings', error)
    loadError.value = error instanceof Error ? error.message : String(error)
  }
  draft.value = staged
})

// No Save of its own (the OpenWrt model): the draft goes to the shared set of pending changes and one
// action applies every section at once.
function onChange(next: { values: Record<string, unknown>; changedKeys: string[]; invalid: boolean }): void {
  settings.changes.stage({
    sectionId: SEARCH_SETTINGS_SECTION,
    title: 'Search',
    values: next.values,
    keys: next.changedKeys,
    invalid: next.invalid,
    commit: async () => {
      await search.config.write(SearchConfigSchema, next.values as Partial<SearchConfig>)
      values.value = { ...next.values }
      draft.value = undefined
      // Every value takes effect from here on. Two of them decide what the index CONTAINS rather than how
      // it is read, and no query can recover rows the old rule kept out — so those rebuild it.
      const rebuild = search.applySettings(toSearchSettings(next.values as SearchConfig))
      if (!rebuild) return
      toaster.create({
        title: 'Rebuilding the index',
        description: 'What the index covers changed, so it is being built again from the content store.',
        type: 'info',
      })
      // search.reindex(), not the status view's control: the control is inert while a walk runs, and a
      // rebuild the settings demand must happen even then — the engine cancels the walk in flight, clears
      // the tables and starts over. Not awaited either: a walk of the whole store takes minutes, and the
      // apply that triggered it spans every section, so holding it open would look like a hung button.
      search.reindex().catch((error: unknown) => {
        arxhub.logger.error('[search] the rebuild after a settings change failed', error)
        toaster.create({ title: 'Could not rebuild the index', description: String(error), type: 'error' })
      })
    },
    revert: () => form.value?.revert(),
  })
}
</script>

<template>
  <PageLayout title="Search" :description="SearchConfigSchema.description" :meta="meta">
    <div class="index-state">
      <div class="state-line">
        <StatusDot :tone="index.tone.value" :pulse="index.scanning.value" />
        <span :class="{ danger: index.unavailable.value }">{{ index.text.value }}</span>
      </div>
      <!-- Immediate, not staged: a rebuild is an action on the index, and there is nothing about it to
           collect into a change set that Save would apply (FE 11). -->
      <Button
        variant="secondary"
        :size="buttonSize"
        :disabled="index.unavailable.value || index.busy.value"
        data-testid="search-settings-reindex"
        @click="index.reindex()"
      >
        Reindex
      </Button>
    </div>

    <p v-if="loadError" class="load-error" role="alert">
      The settings file could not be read, so nothing here can be saved over it: {{ loadError }}
    </p>
    <ConfigForm v-else ref="form" :schema="SearchConfigSchema" :values="values" :draft="draft" @change="onChange" />
  </PageLayout>
</template>

<style scoped>
.index-state {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: var(--size-xl);
  margin-top: 4px;
  padding: 8px 16px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
}

.state-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}

.state-line span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.danger {
  color: var(--danger-11);
}

.load-error {
  margin: 16px 0 0;
  padding: 8px 12px;
  border: 1px solid var(--danger-6);
  border-radius: var(--radius-sm);
  background: var(--danger-2);
  color: var(--danger-11);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}
</style>
