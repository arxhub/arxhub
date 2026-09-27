<script setup lang="ts">
import { Button, Dialog, IconButton, Input } from '@arxhub/uikit/core'
import { onUnmounted, ref } from 'vue'
import { useAssetSession } from '../asset-session'
import { isImageAsset } from '../assets'
import type { DocumentAppearance } from '../document-appearance'
import { reasonText } from '../errors'
import { t } from '../i18n/messages'

const props = defineProps<{ appearance: DocumentAppearance }>()
const emit = defineEmits<{ apply: [appearance: DocumentAppearance]; close: [] }>()
const session = useAssetSession()
const icon = ref(props.appearance.icon ?? '')
const emoji = ref(icon.value.startsWith('lu:') ? '' : icon.value)
const cover = ref(props.appearance.cover)
const input = ref<HTMLInputElement | null>(null)
const error = ref('')
onUnmounted(() => {
  if (error.value && session.error.value === error.value) session.dismiss()
})
const choices = [
  { icon: 'lu:file-text', label: () => t('appearance.icons.document') },
  { icon: 'lu:book-open', label: () => t('appearance.icons.book') },
  { icon: 'lu:lightbulb', label: () => t('appearance.icons.idea') },
  { icon: 'lu:star', label: () => t('appearance.icons.star') },
  { icon: 'lu:heart', label: () => t('appearance.icons.favorite') },
  { icon: 'lu:briefcase', label: () => t('appearance.icons.work') },
  { icon: 'lu:code', label: () => t('appearance.icons.code') },
  { icon: 'lu:calendar', label: () => t('appearance.icons.calendar') },
]
async function upload(event: Event) {
  const el = event.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file) return
  error.value = ''
  if (!isImageAsset(file.type)) {
    error.value = t('asset.wrongType')
    return
  }
  await session
    .upload(file, (asset) => {
      cover.value = asset
    })
    .catch((reason: unknown) => {
      error.value = reasonText(reason)
    })
}
</script>
<template>
  <Dialog open :title="t('tools.appearance')" size="sm" :close-on-escape="!session.pending.value" :close-on-interact-outside="!session.pending.value" @update:open="!$event && !session.pending.value && emit('close')">
    <label class="appearance-field">{{ t('appearance.emoji') }}<Input v-model="emoji" :aria-label="t('appearance.emojiAria')" maxlength="32" :placeholder="t('appearance.emojiPlaceholder')" @update:model-value="icon = $event ?? ''" /></label>
    <div class="appearance-icons"><IconButton v-for="choice in choices" :key="choice.icon" :icon="choice.icon" :tooltip="choice.label()" :active="icon === choice.icon" @click="icon = choice.icon; emoji = ''" /></div>
    <Button variant="ghost" @click="icon = ''; emoji = ''">{{ t('appearance.removeIcon') }}</Button>
    <div class="appearance-cover">
      <input ref="input" type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp" :aria-label="t('appearance.chooseCover')" @change="upload" />
      <span>{{ cover?.name ?? t('appearance.noCover') }}</span>
      <Button :disabled="!!session.pending.value" @click="input?.click()">{{ cover ? t('appearance.changeCover') : t('appearance.addCover') }}</Button>
      <Button v-if="cover" variant="ghost" :disabled="!!session.pending.value" @click="cover = null">{{ t('appearance.removeCover') }}</Button>
    </div>
    <p v-if="session.pending.value" role="status">{{ t('appearance.uploadingCover') }}</p>
    <p v-if="error" class="appearance-error" role="alert">{{ error }}</p>
    <template #footer>
      <Button variant="ghost" :disabled="!!session.pending.value" @click="emit('close')">{{ t('appearance.cancel') }}</Button>
      <Button :disabled="!!session.pending.value" @click="emit('apply', { icon: icon.trim() || null, cover })">{{ t('appearance.apply') }}</Button>
    </template>
  </Dialog>
</template>
<style scoped>
.appearance-field { display: flex; flex-direction: column; gap: 8px; }
.appearance-icons, .appearance-cover { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 16px; }
.appearance-cover span { width: 100%; overflow-wrap: anywhere; }
.appearance-error { color: var(--danger-11); }
</style>
