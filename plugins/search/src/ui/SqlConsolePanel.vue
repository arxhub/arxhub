<script setup lang="ts">
import { formatNumber } from '@arxhub/i18n'
import { CodeEditor } from '@arxhub/plugin-codemirror/ui'
// biome-ignore lint/correctness/noUnusedImports: ScrollArea is used in template
import { EmptyState, modals, ScrollArea, Strip } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { t } from '../i18n/messages'
import { SearchExtension } from '../search-extension'
import { rejectionText } from '../search-texts'
import SqlConsoleActions from './SqlConsoleActions.vue'
import SqlSchemaReference from './SqlSchemaReference.vue'
import { createSqlConsoleController, formatCell, type SqlCell } from './sql-console-controller'
import { SQL_CONSOLE_EXAMPLE, useConsoleQuery } from './sql-console-state'

const arxhub = useArxHub()
const search = arxhub.extensions.get(SearchExtension)

// The text survives the panel: closing the console must not cost a half-written question (FR-236).
const query = useConsoleQuery()
const controller = createSqlConsoleController({ readOnly: (sql) => search.readOnly(sql) })
const schemaOpen = ref(false)
// SQL, not interface text: the same in every language, like the table names it reaches for.
const QUERY_PLACEHOLDER = 'SELECT path, title FROM document LIMIT 10'

const limits = computed(() => search.settings.value)
const meta = computed(() => [
  t('console.readOnly'),
  t('console.rowLimit', { count: formatNumber(limits.value.maxRows) }),
  t('console.timeLimit', { ms: formatNumber(limits.value.timeoutMs) }),
])

const canRun = computed(() => !controller.running.value && query.value.trim() !== '')

function run(): void {
  if (!canRun.value) return
  void controller.run(query.value)
}

// An example over typed text is a loss the owner did not ask for, so it is confirmed first (FE 8). An
// empty editor — or one that already holds the example — has nothing to lose and is filled straight in.
function useExample(): void {
  const current = query.value.trim()
  if (current === '' || current === SQL_CONSOLE_EXAMPLE) {
    query.value = SQL_CONSOLE_EXAMPLE
    return
  }
  modals.openConfirmModal({
    title: t('console.replaceTitle'),
    children: t('console.replaceBody'),
    labels: { confirm: t('console.replace'), cancel: t('console.keep') },
    onConfirm: () => {
      query.value = SQL_CONSOLE_EXAMPLE
    },
  })
}

// Formatted once per run rather than per cell per render: calling formatCell from the template would run it
// three times for every value on screen, on every unrelated re-render.
const table = computed((): { fields: { name: string; type: string }[]; rows: SqlCell[][] } | null => {
  const result = controller.result.value
  if (result == null) return null
  return {
    fields: result.fields.map((field) => ({ name: field.name, type: field.type })),
    rows: result.rows.map((row) => result.fields.map((field) => formatCell(row[field.name]))),
  }
})

const summary = computed(() => {
  const result = controller.result.value
  if (result == null) return null
  return `${t('console.rows', { count: result.rowCount })} · ${t('console.duration', { ms: formatNumber(Math.round(result.durationMs)) })}`
})
</script>

<template>
  <!-- A panel of the workspace is not a page: it starts with a strip, like every other panel, so
       switching tabs does not move where content begins. The page frame it used to wear cost 180px of
       header against a note's 40px. The limits stay in the strip — they are state a query is read
       against — and the description moved into the body, which is read once. -->
  <div class="sql-console" data-testid="sql-console">
    <Strip :title="t('console.title')" flush-actions>
      <template #actions>
        <SqlConsoleActions
          :can-run="canRun"
          :running="controller.running.value"
          :schema-open="schemaOpen"
          :on-run="run"
          :on-example="useExample"
          :on-toggle-schema="() => (schemaOpen = !schemaOpen)"
        />
      </template>
    </Strip>

    <ScrollArea class="console" content-class="console-content">
      <p class="limits">{{ meta.join(' · ') }}</p>
      <p class="about">{{ t('console.about') }}</p>
      <div class="editor">
        <CodeEditor
          v-model="query"
          language="sql"
          :aria-label="t('console.query')"
          :placeholder="QUERY_PLACEHOLDER"
          submit-on-mod-enter
          @submit="run"
        />
      </div>

      <!-- Under the editor, with the offset the DBMS gave, and the query text left exactly as it was: a
           refusal is something to fix in place, not a reason to retype (FE 2.2). -->
      <div v-if="controller.failure.value" class="failure" role="alert" data-testid="sql-console-error">
        <span class="failure-message">{{ rejectionText(controller.failure.value) }}</span>
        <span v-if="controller.failure.value.position != null" class="failure-where">
          {{ t('console.at', { position: controller.failure.value.position }) }}
        </span>
        <span v-if="controller.failure.value.code" class="failure-code">{{ controller.failure.value.code }}</span>
      </div>

      <!-- The whole point of the control: the tables and their columns, so a query can be written without
           reading the source (FR-236) — read from the index itself, so it cannot drift from the DDL. -->
      <SqlSchemaReference v-if="schemaOpen" />

      <div v-if="table" class="result">
        <EmptyState
          v-if="table.rows.length === 0"
          icon="lu:table"
          :text="t('console.noMatch')"
          :hint="t('console.noMatchHint')"
          data-testid="sql-console-empty"
        />
        <ScrollArea v-else axis="x" class="table-scroll">
          <table class="result-table">
            <thead>
              <tr>
                <th v-for="field in table.fields" :key="field.name" scope="col">
                  <span class="field-name">{{ field.name }}</span>
                  <span class="field-type">{{ field.type }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, index) in table.rows" :key="index">
                <!-- Interpolated as text, never as markup: every value here came out of a document. -->
                <td v-for="(cell, column) in row" :key="column">
                  <span :class="{ null: cell.nullish, blank: cell.blank }">{{ cell.text }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </ScrollArea>
      </div>
      <EmptyState v-else-if="!controller.answered.value" icon="lu:database" :text="t('console.idle')" :hint="t('console.idleHint')" />

      <!-- The page frame used to carry this in a pinned footer. A panel has no footer, and the run
           summary belongs next to the result it describes rather than at the bottom of the panel. -->
      <div class="run-summary">
        <span v-if="summary" class="summary">{{ summary }}</span>
        <!-- Rows past the limit are gone, and a table that says nothing about it reads as the whole answer. -->
        <span v-if="controller.result.value?.truncated" class="truncated" data-testid="sql-console-truncated">
          {{ t('console.cut', { count: formatNumber(limits.maxRows) }) }}
        </span>
        <span v-else-if="!summary" class="summary muted">{{ t('console.noResult') }}</span>
      </div>
    </ScrollArea>
  </div>
</template>

<style scoped>
.sql-console {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--gray-1);
}

/* Read once, so it sits in the body rather than in the strip. 62ch is this page's own measure — a
   reading limit belongs to the one surface that needs it, not to a token. */
.about {
  max-width: 62ch;
  margin: 0;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
}

.run-summary {
  display: flex;
  align-items: center;
  gap: 8px;
}

.limits {
  margin: 0;
  color: var(--gray-10);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
}

.console {
  flex: 1;
}

.console :deep(.console-content) {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Tall enough for a query with a join in it, and no taller: the result is what the panel is for. */
.editor {
  height: 180px;
  flex-shrink: 0;
}

.failure {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--danger-6);
  border-radius: var(--radius-sm);
  background: var(--danger-2);
  color: var(--danger-11);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}

.failure-message {
  font-family: var(--font-mono);
}

.failure-where,
.failure-code {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--danger-11);
  opacity: 0.85;
}

/* A wide result scrolls inside its own box; the page itself never scrolls sideways. */
.table-scroll {
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
}

.result-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.result-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 12px;
  border-bottom: 1px solid var(--gray-6);
  background: var(--gray-3);
  text-align: left;
  white-space: nowrap;
}

.field-name {
  display: block;
  font-family: var(--font-mono);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.field-type {
  display: block;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
  color: var(--gray-10);
}

.result-table td {
  max-width: 420px;
  height: var(--size-2xs);
  padding: 4px 12px;
  border-bottom: 1px solid var(--gray-4);
  overflow-wrap: anywhere;
  color: var(--gray-12);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  vertical-align: top;
}

.result-table tr:last-child td {
  border-bottom: none;
}

/* NULL and an empty string both draw as nothing otherwise, and a query cannot be debugged when the two
   look the same. */
.null,
.blank {
  color: var(--gray-9);
  font-style: italic;
}

.summary {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-11);
}

.summary.muted {
  color: var(--gray-9);
}

.truncated {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--warning-11);
}
</style>
