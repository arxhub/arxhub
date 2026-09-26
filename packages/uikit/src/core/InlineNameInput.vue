<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import Input from './Input.vue'

// A name typed in place of a row's label: an inline rename, a draft tree node. Enter commits, Escape
// cancels, and either one settles the field against the blur that follows it (or the unmount that
// follows either), which must not answer a second time. Only that blur is refused: a consumer may keep
// the field open after a commit (a name clash, a failed create), and Enter, the draft's own buttons and
// an edit must still work then.
const model = defineModel<string>({ default: '' })
const props = withDefaults(
  defineProps<{
    label: string
    placeholder?: string
    // A rename commits when the field loses focus; a draft with its own confirm button must not,
    // because pressing that button (or its cancel) takes the focus first.
    commitOnBlur?: boolean
  }>(),
  { commitOnBlur: false },
)
const emit = defineEmits<{ commit: [name: string]; cancel: [] }>()
const wrap = ref<HTMLElement | null>(null)
let settled = false

watch(model, () => {
  settled = false
})

async function focus() {
  await nextTick()
  const input = wrap.value?.querySelector('input')
  input?.focus({ preventScroll: true })
  input?.select()
}

onMounted(focus)

function commit() {
  const name = model.value.trim()
  if (!name) return
  settled = true
  emit('commit', name)
}

function cancel() {
  settled = true
  emit('cancel')
}

function blur() {
  if (settled || !props.commitOnBlur) return
  if (model.value.trim()) commit()
  else cancel()
}

function reset() {
  settled = false
  void focus()
}

defineExpose({ commit, cancel, reset })
</script>

<template>
  <span ref="wrap" class="inline-name-input">
    <Input
      v-model="model"
      variant="inline"
      :aria-label="label"
      :placeholder="placeholder"
      autocomplete="off"
      @keydown.enter.prevent.stop="commit"
      @keydown.escape.prevent.stop="cancel"
      @blur="blur"
      @click.stop
    />
  </span>
</template>

<style scoped>
.inline-name-input {
  display: flex;
  flex: 1;
  min-width: 0;
}
</style>
