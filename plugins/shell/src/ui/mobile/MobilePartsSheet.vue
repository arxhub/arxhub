<script setup lang="ts">
import { BottomSheet, Icon, Row } from '@arxhub/uikit/core'
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
        wrap
        :selected="part.selected"
        :tone="part.tone"
        :aria-current="part.selected ? 'true' : undefined"
        :data-testid="`part:${part.id}`"
        @click="pick(part.id)"
      >
        <Icon :name="part.icon ?? props.bar.icon" :size="16" />
        <span class="body">
          <span class="title">{{ part.title }}</span>
          <span v-if="part.subtitle" class="subtitle">{{ part.subtitle }}</span>
        </span>
        <Icon v-if="part.selected" class="check" name="lu:check" :size="16" />
      </Row>
      <Row v-if="props.bar.parts.add" as="button" type="button" :disabled="props.bar.parts.add.disabled" @click="add">
        <Icon :name="props.bar.parts.add.icon ?? 'lu:plus'" :size="16" />
        <span class="title">{{ props.bar.parts.add.label }}</span>
      </Row>
    </template>
  </BottomSheet>
</template>

<style scoped>
.body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtitle {
  overflow: hidden;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.check {
  flex-shrink: 0;
  margin-left: auto;
}
</style>
