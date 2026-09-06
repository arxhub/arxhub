<script setup lang="ts">
import type { SqlSchemaReferenceColumn, SqlSchemaReferenceTable } from '@arxhub/sql'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onMounted, ref, shallowRef } from 'vue'
import { SearchExtension } from '../search-extension'
import { loadSchemaReference } from './sql-schema-reference'

const arxhub = useArxHub()
const search = arxhub.extensions.get(SearchExtension)

const tables = shallowRef<SqlSchemaReferenceTable[] | null>(null)
const failure = ref<string | null>(null)

onMounted(async () => {
  const answer = await loadSchemaReference(search)
  if (answer.ok) tables.value = answer.tables
  else failure.value = answer.message
})

// Only what is true of this column, so the ordinary one reads as nothing at all. `nullable` rather than
// `not null`: almost every column is NOT NULL, and the one that can be missing is what changes a query.
function marks(column: SqlSchemaReferenceColumn): string[] {
  const found: string[] = []
  if (column.primaryKey) found.push('primary key')
  if (column.nullable) found.push('nullable')
  if (column.generated) found.push('generated')
  return found
}
</script>

<template>
  <!-- Read from the catalog of the live index, never from a description of the DDL kept beside it: a
       query is written while looking at the fields, and a second copy of the schema drifts (A-26). -->
  <section class="schema" aria-label="Index schema">
    <p v-if="failure" class="state" role="alert" data-testid="sql-schema-error">
      The schema could not be read: {{ failure }}
    </p>
    <p v-else-if="tables == null" class="state">Reading the schema from the index…</p>

    <article v-for="table in tables ?? []" :key="table.name" class="table">
      <h2 class="table-name">{{ table.name }}</h2>
      <p class="table-description">{{ table.description }}</p>
      <ul class="columns">
        <li v-for="column in table.columns" :key="column.name" class="column">
          <code class="column-name">{{ column.name }}</code>
          <code class="column-type">{{ column.type }}</code>
          <span class="column-meaning">
            <span v-if="marks(column).length" class="column-marks">{{ marks(column).join(' · ') }}</span>
            <span class="column-description">{{ column.description || 'No note for this column.' }}</span>
            <!-- What a join is written from, so it is stated rather than inferred from the name. -->
            <span v-if="column.references" class="column-reference">
              references <code>{{ column.references }}</code>
            </span>
          </span>
        </li>
      </ul>
    </article>
  </section>
</template>

<style scoped>
/* Capped and scrolled inside itself: the reference sits where the query is written, and five tables'
   worth of columns would otherwise push the answer clean off the screen. */
.schema {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 320px;
  overflow-y: auto;
  padding: 16px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  background: var(--gray-2);
}

.state {
  margin: 0;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}

.table-name {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.table-description {
  margin: 4px 0 8px;
  max-width: 62ch;
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}

.columns {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.column {
  display: grid;
  grid-template-columns: 160px 144px 1fr;
  gap: 8px;
  align-items: baseline;
  min-height: 20px;
  font-size: var(--font-size-xs);
}

.column-name {
  font-family: var(--font-mono);
  color: var(--gray-12);
}

.column-type {
  font-family: var(--font-mono);
  color: var(--gray-10);
}

.column-meaning {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  color: var(--gray-11);
  line-height: var(--line-height-normal);
}

.column-marks {
  font-family: var(--font-mono);
  color: var(--gray-10);
}

.column-reference {
  color: var(--gray-10);
}

.column-reference code {
  font-family: var(--font-mono);
  color: var(--gray-11);
}
</style>
