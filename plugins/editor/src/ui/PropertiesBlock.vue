<script setup lang="ts">
import { Button, ChipInput, Icon, IconButton, Input } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import type { ArxEditorControlProps } from '../control-views'
import { addField, type PropertiesAttrs, withField, withoutField } from '../properties'

const props = defineProps<ArxEditorControlProps>()
const iconSize = useShellFrame() === 'mobile' ? 'xl' : 'sm'
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'

// The node's own attrs are already validated by the schema (properties-block.ts), so this just gives
// them a stable shape to read — never a second source of truth for what they mean.
const attrs = computed<PropertiesAttrs>(() => ({
  tags: Array.isArray(props.node.attrs.tags) ? props.node.attrs.tags : [],
  favorite: props.node.attrs.favorite === true,
  fields: Array.isArray(props.node.attrs.fields) ? props.node.attrs.fields : [],
  subject: props.node.attrs.subject ?? undefined,
}))

const editable = computed(() => props.mode === 'editable')
// `favorite` is the block's one "use" action (like a task's checked or a dropdown's value) and stays
// reachable in interactive mode; tags and fields reshape the block and need `editable` (see the control
// policy in properties-block.ts).
const canFavorite = computed(() => props.mode !== 'readonly')

function setTags(tags: string[]) {
  const next = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))]
  props.change({ tags: next })
}

// Each handler passes `change()` only the ONE key it actually means to touch, never the whole object
// `withField`/`addField`/… happen to return — `change()` merges onto the node's LIVE attrs (read fresh
// from the view at call time), and a merge from a possibly-lagging local snapshot of `attrs.value` (this
// component's own computed, refreshed only on Vue's next render) would silently reassert stale tags or
// fields alongside the one field this call means to change.
function onFavoriteToggle() {
  if (!canFavorite.value) return
  props.change({ favorite: !attrs.value.favorite })
}

function updateField(index: number, patch: Partial<{ key: string; value: string }>) {
  props.change({ fields: withField(attrs.value, index, patch).fields })
}

function addFieldRow() {
  props.change({ fields: addField(attrs.value).fields })
}

function removeFieldRow(index: number) {
  props.change({ fields: withoutField(attrs.value, index).fields })
}
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
        :size="iconSize"
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
        <IconButton v-if="editable" :size="iconSize" icon="lu:x" aria-label="Remove field" @click="removeFieldRow(index)" />
      </div>
      <Button v-if="editable" :size="buttonSize" variant="ghost" @click="addFieldRow">
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
  padding: 12px;
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
}
.fields {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field-row > :first-child {
  flex: 0 0 140px;
}
.field-row > :nth-child(2) {
  flex: 1;
}
.subject {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--gray-10);
  font-family: var(--font-mono);
}
</style>
