<script setup lang="ts">
import { SearchField } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { t } from '../i18n/messages'
import { logView } from '../log-view'
import { LoggerExtension } from '../logger-extension'

// Pinned at the foot of the Logs sheet, above the keyboard and under the thumb — the phone's place for the text
// filter the desktop draws above the log.
const arxhub = useArxHub()
const view = logView(arxhub.extensions.get(LoggerExtension), arxhub.logger)
</script>

<template>
  <SearchField v-model="view.search.value" flush :placeholder="t('filter.placeholder')" :aria-label="t('filter.label')" />
</template>
