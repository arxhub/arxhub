<script setup lang="ts">
import { SectionLabel } from '@arxhub/uikit/core'
import type { TObject } from '@sinclair/typebox'
import { computed, reactive, ref, watch } from 'vue'
import ConfigField from './ConfigField.vue'
import { buildFields, groupFields, validate } from './field-model'

const props = defineProps<{
  schema: TObject
  // What is on disk. Everything "changed" and "revert" is measured against this.
  values: Record<string, unknown>
  // An edit staged earlier and not yet applied, to re-open the form with. Set once per section load
  // by the host — the form must not read its own staged state back, or it would never settle.
  draft?: Record<string, unknown>
}>()

// The form does not save. It reports its draft and lets the host decide when to write — settings
// edits are staged across sections and applied together, so a per-form Save would fight that.
const emit = defineEmits<{
  change: [draft: { values: Record<string, unknown>; changedKeys: string[]; invalid: boolean }]
}>()

const local = reactive<Record<string, unknown>>({})
// A field only shows its error once it has been edited. An empty required field is what is actually
// on disk, so complaining about it before anyone has typed would flag the file, not a mistake.
const touched = ref(new Set<string>())

// Back to what is on disk, dropping any staged edit.
function revert(): void {
  for (const key of Object.keys(local)) delete local[key]
  Object.assign(local, props.values)
  touched.value = new Set()
}

// Re-opening the section: the saved values, with a staged edit laid over them if one survived.
// Fields already edited are kept on top — the section's file is read asynchronously, so a baseline
// arriving after the first keystroke would otherwise wipe what was just typed.
function load(): void {
  const edited = Object.fromEntries([...touched.value].map((key) => [key, local[key]]))
  revert()
  Object.assign(local, props.draft ?? {}, edited)
  touched.value = new Set(Object.keys(edited))
}

watch([() => props.values, () => props.draft], load, { immediate: true, deep: true })

// Fields are rebuilt from the live values, not the saved ones — a boolean that gates other fields
// has to disable them the moment it is switched, not after a save.
const fields = computed(() => buildFields(props.schema, local))
const groups = computed(() => groupFields(fields.value))

const errors = computed(() => {
  const found: Record<string, string> = {}
  for (const field of fields.value) {
    const message = validate(field, local[field.key])
    if (message) found[field.key] = message
  }
  return found
})

// Measured against what is on disk, so setting a value and setting it back leaves the form clean
// rather than permanently dirty.
const changedKeys = computed(() =>
  fields.value.filter((f) => JSON.stringify(local[f.key]) !== JSON.stringify(props.values[f.key])).map((f) => f.key),
)

watch(
  [changedKeys, errors],
  ([keys, found]) => emit('change', { values: { ...local }, changedKeys: [...keys], invalid: Object.keys(found).length > 0 }),
  { immediate: true },
)

function edit(key: string, value: unknown): void {
  local[key] = value
  touched.value = new Set(touched.value).add(key)
}

defineExpose({ revert })
</script>

<template>
  <div class="config-form">
    <section v-for="(group, index) in groups" :key="group.title ?? `ungrouped-${index}`" class="group">
      <SectionLabel v-if="group.title" class="group-title">{{ group.title }}</SectionLabel>
      <ConfigField
        v-for="field in group.fields"
        :key="field.key"
        :field="field"
        :model-value="local[field.key]"
        :error="touched.has(field.key) ? (errors[field.key] ?? null) : null"
        @update:model-value="edit(field.key, $event)"
      />
    </section>
  </div>
</template>

<style scoped>
.config-form {
  font-family: var(--font-sans);
}

.group-title {
  padding: 24px 0 8px;
  border-bottom: 1px solid var(--gray-6);
}

/* The first group has no header, so its first row's top padding would open a gap under the page
   description rather than sit against it. */
.group:first-child > :deep(.field:first-child) {
  padding-top: 0;
}
</style>
