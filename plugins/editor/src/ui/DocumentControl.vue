<script setup lang="ts">
import { Button, Checkbox, Dropdown, Icon, Input, MenuItem } from '@arxhub/uikit/core'
import { computed, ref, watch } from 'vue'
import type { ArxEditorControlProps } from '../control-views'
import { selectOptions } from '../editor-mode'

const props = defineProps<ArxEditorControlProps>()
const configuring = ref(false)
const label = ref('')
const options = ref('')
const choices = computed(() => selectOptions(props.node))
const parsedOptions = computed(() => [
  ...new Set(
    options.value
      .split('\n')
      .map((value) => value.trim())
      .filter(Boolean),
  ),
])

watch(
  () => props.mode,
  () => {
    configuring.value = false
  },
)

function configure() {
  label.value = props.node.attrs.label
  options.value = choices.value.join('\n')
  configuring.value = true
}

function apply() {
  if (props.mode !== 'editable' || !label.value.trim() || !parsedOptions.value.length) return
  props.change({
    label: label.value.trim(),
    options: parsedOptions.value,
    value: parsedOptions.value.includes(props.node.attrs.value) ? props.node.attrs.value : null,
  })
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
          <Button variant="secondary" :disabled="mode === 'readonly'" :aria-label="node.attrs.label">
            {{ node.attrs.value ?? 'Choose…' }}
            <Icon name="lu:chevron-down" />
          </Button>
        </template>
        <MenuItem value="clear" @select="change({ value: null })">Clear selection</MenuItem>
        <MenuItem v-for="(option, index) in choices" :key="option" :value="String(index)" @select="change({ value: option })">
          {{ option }}
        </MenuItem>
      </Dropdown>
      <Button v-if="mode === 'editable' && !configuring" variant="ghost" @click="configure">Configure</Button>
    </div>
    <form v-if="configuring && mode === 'editable'" class="select-config" @submit.prevent="apply" @keydown.stop>
      <label>Label<Input v-model="label" aria-label="Dropdown label" /></label>
      <label>Options, one per line<textarea v-model="options" aria-label="Dropdown options" rows="4" /></label>
      <div class="select-value">
        <Button variant="secondary" type="submit" :disabled="!label.trim() || !parsedOptions.length">Apply</Button>
        <Button variant="ghost" @click="configuring = false">Cancel</Button>
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
