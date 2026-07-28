<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { TagsInput } from '@ark-ui/vue'

defineProps<{
  modelValue?: string[]
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
}>()

defineEmits<(e: 'update:modelValue', value: string[]) => void>()
</script>

<template>
  <TagsInput.Root
    class="root"
    :model-value="modelValue"
    :disabled="disabled"
    @value-change="$emit('update:modelValue', $event.value)"
  >
    <TagsInput.Context v-slot="api">
      <TagsInput.Control class="control">
        <TagsInput.Item
          v-for="(entry, index) in api.value"
          :key="`${entry}-${index}`"
          class="chip"
          :index="index"
          :value="entry"
        >
          <TagsInput.ItemPreview class="chip-preview">
            <TagsInput.ItemText class="chip-text">{{ entry }}</TagsInput.ItemText>
            <TagsInput.ItemDeleteTrigger class="chip-remove" :aria-label="`Remove ${entry}`">✕</TagsInput.ItemDeleteTrigger>
          </TagsInput.ItemPreview>
          <TagsInput.ItemInput class="chip-edit" />
        </TagsInput.Item>
        <TagsInput.Input class="draft" :placeholder="placeholder ?? 'Add…'" :aria-label="ariaLabel" />
      </TagsInput.Control>
    </TagsInput.Context>
    <TagsInput.HiddenInput />
  </TagsInput.Root>
</template>

<style scoped>
.root {
  max-width: 560px;
}

.control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: var(--size-xs);
  padding: 4px;
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-xs);
  background: var(--gray-1);
}

.control:focus-within {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
  border-color: var(--accent-8);
}

.root[data-disabled] .control {
  background: var(--gray-2);
  border-color: var(--gray-6);
}

.chip-preview {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 24px;
  padding: 0 4px 0 8px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-xs);
  background: var(--gray-2);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-12);
}

.chip[data-highlighted] .chip-preview {
  border-color: var(--accent-8);
  background: var(--accent-3);
}

.chip-remove {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--gray-10);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-none);
  cursor: pointer;
}

.chip-remove[data-hover] {
  background: var(--gray-4);
  color: var(--gray-12);
}

.chip-edit {
  height: 24px;
  padding: 0 8px;
  border: 1px solid var(--accent-8);
  border-radius: var(--radius-xs);
  background: var(--gray-1);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-12);
  outline: none;
}

.draft {
  flex: 1;
  min-width: 96px;
  height: 24px;
  padding: 0 4px;
  border: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--gray-12);
  outline: none;
}

.draft::placeholder {
  color: var(--gray-10);
}
</style>
