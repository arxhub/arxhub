<script setup lang="ts">
import { Button, Dialog, ScrollArea } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { versionText } from '../document-history'
import type { ArxEditorKit } from '../editor-extension'
import { deserialize } from '../editor-format'
import { t } from '../i18n/messages'

const props = defineProps<{ kit: ArxEditorKit; saved: string; draft: string; conflict: boolean; busy: boolean; error: string }>()
const emit = defineEmits<{ choose: [action: 'draft' | 'saved' | 'both'] }>()
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
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
  <Dialog open :title="conflict ? t('recovery.conflictTitle') : t('recovery.draftTitle')" size="lg" :close-on-escape="false" :close-on-interact-outside="false">
    <p>{{ conflict ? t('recovery.conflictBody') : t('recovery.draftBody') }}</p>
    <p>{{ t('recovery.saved') }}</p><ScrollArea class="preview"><pre :aria-label="t('recovery.savedAria')">{{ savedText }}</pre></ScrollArea>
    <p>{{ t('recovery.draft') }}</p><ScrollArea class="preview"><pre :aria-label="t('recovery.draftAria')">{{ draftText }}</pre></ScrollArea>
    <p v-if="error" role="alert">{{ error }}</p>
    <template #footer>
      <Button :size="buttonSize" variant="ghost" :disabled="busy" @click="emit('choose', 'saved')">{{ t('recovery.keepSaved') }}</Button>
      <Button :size="buttonSize" variant="secondary" :disabled="busy" @click="emit('choose', 'both')">{{ t('recovery.keepBoth') }}</Button>
      <Button :size="buttonSize" :disabled="busy" @click="emit('choose', 'draft')">{{ conflict ? t('recovery.replace') : t('recovery.recover') }}</Button>
    </template>
  </Dialog>
</template>

<style scoped>
.preview { max-height: 180px; margin-block: 12px; font-size: var(--font-size-sm); background: var(--gray-1); border: 1px solid var(--gray-6); border-radius: var(--radius-sm); }
pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; padding: 12px; font-size: var(--font-size-sm); font-family: var(--font-mono); }
p { margin-block: 8px; color: var(--gray-11); font-size: var(--font-size-sm); }
</style>
