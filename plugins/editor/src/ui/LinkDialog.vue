<script setup lang="ts">
import { Button, Dialog, Input } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import type { EditorView } from 'prosemirror-view'
import { computed, ref, useId } from 'vue'
import type { ArxDocumentLinks } from '../document-links'
import { linkAtSelection, safeLink, setLink } from '../link-commands'
import DocumentPicker from './DocumentPicker.vue'

const props = defineProps<{ view: EditorView; links?: ArxDocumentLinks | null; path?: string }>()
const emit = defineEmits<{ close: [] }>()
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const formId = useId()
const existing = linkAtSelection(props.view.state)
const href = ref(existing?.href ?? '')
const valid = computed(() => safeLink(href.value) !== null)
const browsing = ref(false)
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
    <Button v-if="links" :size="buttonSize" variant="secondary" @click="browsing = !browsing">Choose document or block</Button>
    <DocumentPicker v-if="browsing && links" :links="links" :path="path ?? ''" :view="view" @choose="href = $event; browsing = false" />
    <template #footer>
      <Button v-if="existing" :size="buttonSize" variant="ghost" @click="apply(null)">Remove link</Button>
      <Button :size="buttonSize" variant="ghost" @click="emit('close')">Cancel</Button>
      <Button :size="buttonSize" variant="secondary" type="submit" :form="formId" :disabled="!valid">Apply link</Button>
    </template>
  </Dialog>
</template>

<style scoped>
label { display: flex; flex-direction: column; gap: 8px; }
.link-error { color: var(--danger-11); }
</style>
