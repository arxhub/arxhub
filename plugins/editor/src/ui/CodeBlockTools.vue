<script setup lang="ts">
import { Button, Icon, Strip } from '@arxhub/uikit/core'
import { toaster, useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { MAX_HIGHLIGHT_LENGTH } from '../code-highlighting'
import type { ArxEditorControlProps } from '../control-views'
import { t } from '../i18n/messages'

const props = defineProps<ArxEditorControlProps>()
const language = computed(() => props.node.attrs.language || t('settings.plainText'))
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.node.textContent)
    toaster.create({ title: 'Code copied', type: 'success' })
  } catch {
    toaster.create({ title: 'Could not copy code', description: 'The browser did not allow clipboard access.', type: 'error' })
  }
}
</script>

<template>
  <Strip v-if="mode === 'editable' && settings">
    <Button :size="buttonSize" variant="ghost" :aria-label="`Code language: ${language}`" @click="settings()">
      {{ language }}
      <Icon name="lu:chevron-down" />
    </Button>
    <template #actions>
      <Button :size="buttonSize" variant="ghost" @click="copy">
        <Icon name="lu:copy" />
        Copy
      </Button>
    </template>
  </Strip>
  <Strip v-else :title="language">
    <template #actions>
      <Button :size="buttonSize" variant="ghost" @click="copy">
        <Icon name="lu:copy" />
        Copy
      </Button>
    </template>
  </Strip>
  <p v-if="node.content.size > MAX_HIGHLIGHT_LENGTH" class="code-notice">{{ t('codeBlock.highlightingPaused') }}</p>
</template>

<style scoped>
.code-notice { margin: 0; padding: 8px 16px 0; font-size: var(--font-size-xs); color: var(--gray-11); }
</style>
