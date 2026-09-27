<script setup lang="ts">
import { EmptyState } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { DocumentsExtension } from '../documents-extension'
import { t } from '../i18n/messages'

// A wrapper with a permanent identity. The type is registered once and for good, while its navigation
// is put in by the explorer — a plugin that can be switched off and that configures later. Putting the
// component in directly is not an option: the type registry keeps its entries `markRaw`, and swapping
// a field there would go unnoticed.
const documents = useArxHub().extensions.get(DocumentsExtension)
</script>

<template>
  <component :is="documents.nav.value" v-if="documents.nav.value != null" />
  <!-- No tree means the explorer is off. That state is reachable (the plugin is switchable) and
       staying quiet about it is not an option: an empty column reads as broken. -->
  <EmptyState v-else icon="lu:folder-x" :text="t('nav.off')" :hint="t('nav.offHint')" />
</template>
