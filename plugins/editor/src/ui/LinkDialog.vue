<script setup lang="ts">
import { Button, Dialog, Input } from '@arxhub/uikit/core'
import type { EditorView } from 'prosemirror-view'
import { computed, ref, useId } from 'vue'
import { linkAtSelection, safeLink, setLink } from '../link-commands'

const props = defineProps<{ view: EditorView }>()
const emit = defineEmits<{ close: [] }>()
const formId = useId()
const existing = linkAtSelection(props.view.state)
const href = ref(existing?.href ?? '')
const valid = computed(() => safeLink(href.value) !== null)
function apply(value: string | null) {
  if (props.view.isDestroyed) return
  if (setLink(value)(props.view.state, props.view.dispatch)) emit('close')
}
</script>

<template>
  <Dialog :open="true" title="Link" size="sm" @update:open="!$event && emit('close')">
    <form :id="formId" @submit.prevent="apply(href)">
      <label>Address<Input v-model="href" aria-label="Link address" placeholder="https://example.com" /></label>
      <p v-if="href && !valid" class="link-error" role="alert">Use a web address, email, phone number or relative path.</p>
    </form>
    <template #footer>
      <Button v-if="existing" variant="ghost" @click="apply(null)">Remove link</Button>
      <Button variant="ghost" @click="emit('close')">Cancel</Button>
      <Button variant="secondary" type="submit" :form="formId" :disabled="!valid">Apply link</Button>
    </template>
  </Dialog>
</template>

<style scoped>
label { display: flex; flex-direction: column; gap: 8px; }
.link-error { color: var(--danger-11); }
</style>
