<script setup lang="ts">
import { Button, Checkbox, Dropdown, Icon, Input, MenuItem } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref, watch } from 'vue'
import type { ArxEditorControlProps } from '../control-views'
import { reconfigureSelect, selectedLabel, selectOptions } from '../editor-mode'

const props = defineProps<ArxEditorControlProps>()
const buttonSize = useShellFrame() === 'mobile' ? 'md' : 'sm'
const configuring = ref(false)
const label = ref('')
const options = ref('')
const choices = computed(() => selectOptions(props.node))
const chosen = computed(() => selectedLabel(props.node))
const lines = computed(() => options.value.split('\n').filter((line) => line.trim()))

watch(
  () => props.mode,
  () => {
    configuring.value = false
  },
)

function configure() {
  label.value = props.node.attrs.label
  options.value = choices.value.map((option) => option.label).join('\n')
  configuring.value = true
}

function apply() {
  if (props.mode !== 'editable' || !label.value.trim() || !lines.value.length) return
  props.change({ label: label.value.trim(), ...reconfigureSelect(props.node, lines.value) })
  configuring.value = false
}
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
      <Button v-if="mode === 'editable' && !configuring" :size="buttonSize" variant="ghost" @click="configure">Configure</Button>
    </div>
    <form v-if="configuring && mode === 'editable'" class="select-config" @submit.prevent="apply" @keydown.stop>
      <label>Label<Input v-model="label" aria-label="Dropdown label" /></label>
      <label>Options, one per line<textarea v-model="options" aria-label="Dropdown options" rows="4" /></label>
      <div class="select-value">
        <Button :size="buttonSize" variant="secondary" type="submit" :disabled="!label.trim() || !lines.length">Apply</Button>
        <Button :size="buttonSize" variant="ghost" @click="configuring = false">Cancel</Button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.select-block { display: flex; flex-direction: column; gap: 8px; margin: 8px 0; }
.select-value { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.select-config { display: flex; flex-direction: column; gap: 8px; max-width: 360px; }
.select-config label { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-size-sm); }
.select-config textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-sm);
  background: var(--gray-1);
  color: var(--gray-12);
  font: inherit;
  resize: vertical;
}
.select-config textarea:focus-visible { outline: 2px solid var(--accent-8); outline-offset: -1px; }
</style>
