<script setup lang="ts">
import { BottomSheet, Button, Field, Input, modals } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { nextTick, onMounted, ref } from 'vue'
import { DocumentsExtension } from '../documents-extension'
import { t } from '../i18n/messages'
import { renameDocument } from './rename-document'

// The band's Rename. A sheet at the bottom rather than the name at the top of the document: on the phone
// the top of the screen is not where a hand is, and a viewer need not draw a name there at all.
const props = defineProps<{ modalId: string; path: string }>()

const arxhub = useArxHub()
const documents = arxhub.extensions.get(DocumentsExtension)

const draft = ref(documents.displayName(props.path).text)
const field = ref<HTMLElement | null>(null)
const open = ref(true)

function close(): void {
  open.value = false
  modals.close(props.modalId)
}

function commit(): void {
  renameDocument(documents, arxhub.logger, props.path, draft.value)
  close()
}

onMounted(async () => {
  await nextTick()
  field.value?.querySelector('input')?.select()
})
</script>

<template>
  <!-- The field sits in the footer with its confirm: above the keyboard it opens, under the thumb. -->
  <BottomSheet :open="open" :title="t('rename.title')" footer-inset @close="close">
    <template #footer>
      <div ref="field">
        <Field :label="t('rename.name')" for="rename-document-field">
          <Input id="rename-document-field" v-model="draft" autofocus data-testid="rename-document-field" @keydown.enter.prevent="commit" />
        </Field>
      </div>
      <Button block :disabled="draft.trim() === ''" data-testid="rename-document-confirm" @click="commit">{{ t('rename.confirm') }}</Button>
    </template>
  </BottomSheet>
</template>
