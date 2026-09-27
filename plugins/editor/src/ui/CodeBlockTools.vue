<script setup lang="ts">
import { Button, Icon, Strip } from '@arxhub/uikit/core'
import { toaster, useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { MAX_HIGHLIGHT_LENGTH } from '../code-highlighting'
import type { ArxEditorControlProps } from '../control-views'
import { t } from '../i18n/messages'

const props = defineProps<ArxEditorControlProps>()
const language = computed(() => props.node.attrs.language || t('settings.plainText'))
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'sm'
const glyph = touch ? 16 : 14

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.node.textContent)
    toaster.create({ title: t('codeBlock.copied'), type: 'success' })
  } catch {
    toaster.create({ title: t('codeBlock.copyFailed'), description: t('codeBlock.copyFailedDetail'), type: 'error' })
  }
}
</script>

<template>
  <Strip v-if="mode === 'editable' && settings">
    <Button :size="buttonSize" variant="ghost" :aria-label="t('codeBlock.languageAria', { language })" @click="settings()">
      {{ language }}
      <Icon name="lu:chevron-down" :size="glyph" />
    </Button>
    <template #actions>
      <Button :size="buttonSize" variant="ghost" @click="copy">
        <Icon name="lu:copy" :size="glyph" />
        {{ t('codeBlock.copy') }}
      </Button>
    </template>
  </Strip>
  <Strip v-else :title="language">
    <template #actions>
      <Button :size="buttonSize" variant="ghost" @click="copy">
        <Icon name="lu:copy" :size="glyph" />
        {{ t('codeBlock.copy') }}
      </Button>
    </template>
  </Strip>
  <p v-if="node.content.size > MAX_HIGHLIGHT_LENGTH" class="code-notice">{{ t('codeBlock.highlightingPaused') }}</p>
</template>

<style scoped>
.code-notice { margin: 0; padding: 8px 16px 0; font-size: var(--font-size-xs); color: var(--gray-11); }
</style>
