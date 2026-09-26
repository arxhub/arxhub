<script setup lang="ts">
import { BottomSheet, Row } from '@arxhub/uikit/core'
import type { ObjectBar } from '../tab-type'

// The parts of a composite object — the sheets of a workbook, the pages of a PDF — raised from the name in
// the band. Described as data by the type, like the band itself, so every composite object lists its
// parts the same way.
const props = defineProps<{ open: boolean; bar: ObjectBar | null }>()
const emit = defineEmits<{ close: [] }>()

function pick(id: string): void {
  props.bar?.parts?.pick(id)
  emit('close')
}

function add(): void {
  props.bar?.parts?.add?.onSelect()
  emit('close')
}
</script>

<template>
  <BottomSheet :open="props.open && props.bar?.parts != null" :title="props.bar?.parts ? `${props.bar.name} · ${props.bar.parts.title}` : ''" @close="emit('close')">
    <template v-if="props.bar?.parts != null">
      <Row
        v-for="part in props.bar.parts.items"
        :key="part.id"
        as="button"
        type="button"
        :icon="part.icon ?? props.bar.icon"
        :label="part.title"
        :detail="part.subtitle"
        :selected="part.selected"
        :checked="part.selected"
        :tone="part.tone"
        :depth="part.depth"
        :aria-current="part.selected ? 'true' : undefined"
        :data-testid="`part:${part.id}`"
        @click="pick(part.id)"
      />
      <Row
        v-if="props.bar.parts.add"
        as="button"
        type="button"
        :icon="props.bar.parts.add.icon ?? 'lu:plus'"
        :label="props.bar.parts.add.label"
        :disabled="props.bar.parts.add.disabled"
        @click="add"
      />
    </template>
  </BottomSheet>
</template>
