<script setup lang="ts">
import { Button, ChipInput, Icon, IconButton, Input } from '@arxhub/uikit/core'
import type { ArxEditorControlProps } from '../control-views'
import { usePropertiesBlock } from './use-properties-block'

const props = defineProps<ArxEditorControlProps>()
const { attrs, editable, canFavorite, setTags, onFavoriteToggle, updateField, addFieldRow, removeFieldRow } = usePropertiesBlock(props)
</script>

<template>
  <section class="properties-block" aria-label="Document properties">
    <div class="properties-row">
      <ChipInput
        class="tags"
        :model-value="attrs.tags"
        :disabled="!editable"
        placeholder="Add tag…"
        aria-label="Tags"
        @update:model-value="setTags"
      />
      <IconButton
        size="xl"
        :icon="attrs.favorite ? 'lu:star' : 'lu:star-off'"
        :active="attrs.favorite"
        :disabled="!canFavorite"
        tooltip="Favorite"
        aria-label="Favorite"
        @click="onFavoriteToggle"
      />
    </div>

    <div v-if="attrs.fields.length || editable" class="fields">
      <div v-for="(field, index) in attrs.fields" :key="index" class="field-row">
        <Input
          :model-value="field.key"
          :disabled="!editable"
          aria-label="Field name"
          placeholder="Field"
          @update:model-value="updateField(index, { key: $event })"
        />
        <Input
          :model-value="field.value"
          :disabled="!editable"
          aria-label="Field value"
          placeholder="Value"
          @update:model-value="updateField(index, { value: $event })"
        />
        <IconButton v-if="editable" size="xl" icon="lu:x" aria-label="Remove field" @click="removeFieldRow(index)" />
      </div>
      <Button v-if="editable" size="lg" variant="ghost" @click="addFieldRow">
        <Icon name="lu:plus" :size="14" />
        Add field
      </Button>
    </div>

    <p v-if="attrs.subject?.path" class="subject">for {{ attrs.subject.path }}</p>
  </section>
</template>

<style scoped>
.properties-block {
  display: flex;
  flex-direction: column;
  gap: 8px;

  background: var(--gray-2);
  border-radius: var(--radius-sm);
}
.properties-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tags {
  flex: 1;
  min-width: 0;
}
.fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.field-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}
.field-row > :first-child { grid-column: 1; grid-row: 1; min-width: 0; }
.field-row > :nth-child(2) { grid-column: 1 / -1; grid-row: 2; min-width: 0; }
.field-row > :nth-child(3) { grid-column: 2; grid-row: 1; }
.subject {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: var(--font-size-sm);
  color: var(--gray-10);
  font-family: var(--font-mono);
}
</style>
