<script setup lang="ts">
import { Button, Checkbox, IconButton, Input } from '@arxhub/uikit/core'
import { revealDocumentMatch } from '../document-search'
import { t } from '../i18n/messages'
import { type DocumentFindProps, useDocumentFind } from './use-document-find'

const props = defineProps<DocumentFindProps>()
const emit = defineEmits<{ close: [] }>()
const { root, query, matchCase, replacement, search, replace } = useDocumentFind(props)
</script>

<template>
  <section ref="root" class="document-find" role="search" :aria-label="t('tools.find')" @keydown.esc.stop.prevent="emit('close')">
    <div class="find-row">
      <Input v-model="query" class="find-input" :aria-label="t('find.aria')" :placeholder="t('tools.find')" @keydown.enter.prevent="revealDocumentMatch(view, $event.shiftKey ? -1 : 1)" />
      <span class="find-count" role="status">{{ search?.matches.length ? t('find.count', { index: search.index + 1, total: search.matches.length }) : t('find.none') }}</span>
      <IconButton size="lg" icon="lu:chevron-up" :tooltip="t('find.previous')" :disabled="!search?.matches.length" @click="revealDocumentMatch(view, -1)" />
      <IconButton size="lg" icon="lu:chevron-down" :tooltip="t('find.next')" :disabled="!search?.matches.length" @click="revealDocumentMatch(view, 1)" />
      <IconButton size="lg" icon="lu:x" :tooltip="t('find.close')" @click="emit('close')" />
    </div>
    <div class="find-row"><Checkbox v-model="matchCase" :label="t('find.matchCase')" /></div>
    <div v-if="mode === 'editable'" class="find-row">
      <Input v-model="replacement" class="find-input" :aria-label="t('find.replaceWith')" :placeholder="t('find.replaceWith')" @keydown.enter.prevent="replace()" />
      <Button variant="secondary" size="sm" :disabled="!search?.matches.length" @click="replace()">{{ t('find.replace') }}</Button>
      <Button variant="secondary" size="sm" :disabled="!search?.matches.length" @click="replace(true)">{{ t('find.replaceAll') }}</Button>
    </div>
  </section>
</template>

<style scoped>
.document-find { padding: 8px 12px; border-bottom: 1px solid var(--gray-6); background: var(--gray-2); }
.find-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-block: 4px; }
.find-input { flex: 1; min-width: 140px; }
.find-count { font-size: var(--font-size-xs); color: var(--gray-11); }
</style>
