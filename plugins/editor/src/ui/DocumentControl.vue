<script setup lang="ts">
import { Button, Checkbox, Dropdown, Icon, MenuItem } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import type { ArxEditorControlProps } from '../control-views'
import { selectedLabel, selectOptions } from '../editor-mode'

const props = defineProps<ArxEditorControlProps>()
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const choices = computed(() => selectOptions(props.node))
const chosen = computed(() => selectedLabel(props.node))
</script>

<template>
  <Checkbox
    v-if="node.type.name === 'task_item'"
    :model-value="node.attrs.checked === true"
    :disabled="mode === 'readonly'"
    :aria-label="node.firstChild?.textContent || 'Task'"
    @update:model-value="change({ checked: $event })"
  />
  <div v-else class="select-block">
    <div class="select-value">
      <span>{{ node.attrs.label }}</span>
      <Dropdown>
        <template #trigger>
          <Button :size="buttonSize" variant="secondary" :disabled="mode === 'readonly'" :aria-label="node.attrs.label">
            {{ chosen ?? 'Choose…' }}
            <Icon name="lu:chevron-down" />
          </Button>
        </template>
        <MenuItem value="clear" @select="change({ value: null })">Clear selection</MenuItem>
        <MenuItem v-for="option in choices" :key="option.id" :value="option.id" @select="change({ value: option.id })">
          {{ option.label }}
        </MenuItem>
      </Dropdown>
    </div>

  </div>
</template>

<style scoped>
.select-block { display: flex; flex-direction: column; gap: 8px; margin: 8px 0; }
.select-value { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
</style>
