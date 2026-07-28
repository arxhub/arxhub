<script setup lang="ts">
import { Button, CheckboxGroup, ChipInput, Icon, Input, NumberInput, RadioGroup, Segmented, Slider, Switch } from '@arxhub/uikit/core'
import { toaster } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { type FieldModel, isInline } from './field-model'

const props = defineProps<{ field: FieldModel; modelValue: unknown; error: string | null }>()
const emit = defineEmits<(e: 'update:modelValue', value: unknown) => void>()

const inline = computed(() => isInline(props.field.kind))

const asText = computed(() => (props.modelValue == null ? '' : String(props.modelValue)))
const asNumber = computed(() => (typeof props.modelValue === 'number' ? props.modelValue : Number(props.modelValue ?? 0)))
const asList = computed(() => (Array.isArray(props.modelValue) ? (props.modelValue as string[]) : []))

// A write-only value starts hidden: it is on screen because the field exists, not because anyone
// asked to read it.
const revealed = ref(false)

const remaining = computed(() => (props.field.maxLength ?? 0) - asText.value.length)

function set(value: unknown): void {
  emit('update:modelValue', value)
}

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(asText.value)
    toaster.create({ title: `${props.field.label} copied`, type: 'success' })
  } catch (error) {
    toaster.create({ title: 'Could not copy', description: String(error), type: 'error' })
  }
}
</script>

<template>
  <div class="field" :class="{ inline, disabled: field.disabled, invalid: !!error }">
    <div class="head">
      <div class="title-row">
        <span class="label">{{ field.label }}</span>
        <span v-if="field.disabled" class="tag">Unavailable</span>
        <span v-else-if="field.required" class="tag required">Required</span>
      </div>
      <p v-if="field.description" class="description">{{ field.description }}</p>
      <p v-if="field.disabled && field.disabledBy" class="description">Available once “{{ field.disabledBy }}” is on.</p>
      <!-- Inline rows put the signature under the label; stacked rows put it under the control, which
           is where the eye lands last. -->
      <code v-if="inline" class="signature">{{ field.signature }}</code>
    </div>

    <div class="control">
      <Switch
        v-if="field.kind === 'switch'"
        :model-value="modelValue === true"
        :disabled="field.disabled"
        @update:model-value="set($event)"
      />

      <Segmented
        v-else-if="field.kind === 'segmented'"
        :model-value="asText"
        :options="field.choices"
        :disabled="field.disabled"
        :aria-label="field.label"
        @update:model-value="set($event)"
      />

      <RadioGroup
        v-else-if="field.kind === 'radio-list'"
        :model-value="asText"
        :options="field.choices"
        :disabled="field.disabled"
        :aria-label="field.label"
        @update:model-value="set($event)"
      />

      <CheckboxGroup
        v-else-if="field.kind === 'checkbox-list'"
        :model-value="asList"
        :options="field.choices"
        :disabled="field.disabled"
        :aria-label="field.label"
        @update:model-value="set($event)"
      />

      <ChipInput
        v-else-if="field.kind === 'chips'"
        :model-value="asList"
        :disabled="field.disabled"
        :aria-label="field.label"
        @update:model-value="set($event)"
      />

      <Slider
        v-else-if="field.kind === 'slider'"
        :model-value="asNumber"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :unit="field.unit"
        :disabled="field.disabled"
        :aria-label="field.label"
        @update:model-value="set($event)"
      />

      <NumberInput
        v-else-if="field.kind === 'stepper'"
        :model-value="asNumber"
        :min="field.min"
        :max="field.max"
        :step="field.step"
        :unit="field.unit"
        :disabled="field.disabled"
        :aria-label="field.label"
        @update:model-value="set($event)"
      />

      <div v-else-if="field.kind === 'readonly'" class="readonly">
        <code class="readonly-value">{{ asText || '—' }}</code>
        <Button size="sm" variant="secondary" @click="copy">Copy</Button>
      </div>

      <div v-else-if="field.kind === 'secret'" class="secret">
        <Input
          class="secret-input"
          :type="revealed ? 'text' : 'password'"
          :model-value="asText"
          :disabled="field.disabled"
          :aria-label="field.label"
          @update:model-value="set($event)"
        />
        <Button size="sm" variant="secondary" :disabled="field.disabled" @click="revealed = !revealed">
          {{ revealed ? 'Hide' : 'Show' }}
        </Button>
      </div>

      <div v-else-if="field.kind === 'textarea'" class="textarea-wrap">
        <textarea
          class="textarea"
          rows="3"
          :value="asText"
          :disabled="field.disabled"
          :aria-label="field.label"
          @input="set(($event.target as HTMLTextAreaElement).value)"
        />
        <div v-if="field.maxLength" class="counter" :class="{ over: remaining < 0 }">{{ remaining }}</div>
      </div>

      <Input
        v-else
        class="text-input"
        :model-value="asText"
        :disabled="field.disabled"
        :aria-label="field.label"
        @update:model-value="set($event)"
      />
    </div>

    <div v-if="error" class="error">
      <Icon name="lu:x" :size="12" />
      <span>{{ error }}</span>
    </div>
    <code v-if="!inline" class="signature">{{ field.signature }}</code>
  </div>
</template>

<style scoped>
/* A stacked row: label, description, control, signature. Inline rows re-flow this into two columns
   below — the same markup either way, so a control can change kind without moving in the DOM. */
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 1px solid var(--gray-4);
}

.field:last-child {
  border-bottom: none;
}

.field.inline {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
  column-gap: 28px;
}

.field.inline .head {
  grid-column: 1;
}

.field.inline .control {
  grid-column: 2;
  grid-row: 1;
  justify-self: end;
}

.field.inline .error {
  grid-column: 1 / -1;
}

.head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.label {
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--gray-12);
}

.field.disabled .label {
  color: var(--gray-10);
}

.tag {
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.045em;
  text-transform: uppercase;
  color: var(--gray-9);
}

.tag.required {
  color: var(--danger-11);
}

.description {
  margin: 0;
  max-width: 62ch;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}

.field.disabled .description {
  color: var(--gray-9);
}

.signature {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-9);
  overflow-wrap: anywhere;
}

.control {
  display: flex;
  min-width: 0;
}

.text-input,
.secret-input,
.textarea {
  max-width: 520px;
}

.secret {
  display: flex;
  gap: 8px;
  width: 100%;
  max-width: 520px;
}

.readonly {
  display: flex;
  align-items: center;
  gap: 12px;
}

.readonly-value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-11);
}

.textarea-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  max-width: 520px;
}

.textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-sm);
  background: var(--gray-1);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--gray-12);
  resize: vertical;
  outline: none;
}

.textarea:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
  border-color: var(--accent-8);
}

.textarea:disabled {
  background: var(--gray-2);
  color: var(--gray-9);
  cursor: not-allowed;
}

.counter {
  align-self: flex-end;
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-9);
}

.counter.over {
  color: var(--danger-11);
}

/* An invalid control tints its own border rather than being wrapped in a red box — the message
   below already names the problem. */
.field.invalid :deep(input),
.field.invalid .textarea {
  border-color: var(--danger-7);
  background: var(--danger-2);
}

.error {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--danger-11);
}
</style>
