<script setup lang="ts">
import { Button, Dialog } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { versionText } from '../document-history'
import type { ArxEditorKit } from '../editor-extension'
import { deserialize } from '../editor-format'

const props = defineProps<{ kit: ArxEditorKit; saved: string; draft: string; conflict: boolean; busy: boolean; error: string }>()
const emit = defineEmits<{ choose: [action: 'draft' | 'saved' | 'both'] }>()
const buttonSize = useShellFrame() === 'mobile' ? 'md' : 'sm'
function preview(raw: string) {
  try {
    return versionText(deserialize(props.kit.schema, raw, props.kit.format))
  } catch {
    return raw
  }
}
const savedText = computed(() => preview(props.saved))
const draftText = computed(() => preview(props.draft))
</script>

<template>
  <Dialog open :title="conflict ? 'File changed outside this editor' : 'Recover unsaved draft'" size="lg" :close-on-escape="false" :close-on-interact-outside="false">
    <p>{{ conflict ? 'The saved file differs from the version your draft started from. Choose which content to keep.' : 'This device has edits that did not reach the file before the editor closed.' }}</p>
    <p>Saved file</p><pre aria-label="Saved file preview">{{ savedText }}</pre>
    <p>Your draft</p><pre aria-label="Draft preview">{{ draftText }}</pre>
    <p v-if="error" role="alert">{{ error }}</p>
    <template #footer>
      <Button :size="buttonSize" variant="ghost" :disabled="busy" @click="emit('choose', 'saved')">Keep saved file</Button>
      <Button :size="buttonSize" variant="secondary" :disabled="busy" @click="emit('choose', 'both')">Keep both</Button>
      <Button :size="buttonSize" :disabled="busy" @click="emit('choose', 'draft')">{{ conflict ? 'Replace saved file with draft' : 'Recover draft' }}</Button>
    </template>
  </Dialog>
</template>

<style scoped>
pre { max-height: 180px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; background: var(--gray-1); border: 1px solid var(--gray-6); border-radius: var(--radius-sm); font-size: var(--font-size-sm); font-family: var(--font-mono); }
p { margin-block: 8px; color: var(--gray-11); font-size: var(--font-size-sm); }
</style>
