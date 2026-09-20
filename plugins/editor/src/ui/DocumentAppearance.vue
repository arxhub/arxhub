<script setup lang="ts">
import { Button, Dialog, IconButton, Input } from '@arxhub/uikit/core'
import { onUnmounted, ref } from 'vue'
import { useAssetSession } from '../asset-session'
import { isImageAsset } from '../assets'
import type { DocumentAppearance } from '../document-appearance'

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
  { icon: 'lu:file-text', label: 'Document' },
  { icon: 'lu:book-open', label: 'Book' },
  { icon: 'lu:lightbulb', label: 'Idea' },
  { icon: 'lu:star', label: 'Star' },
  { icon: 'lu:heart', label: 'Favorite' },
  { icon: 'lu:briefcase', label: 'Work' },
  { icon: 'lu:code', label: 'Code' },
  { icon: 'lu:calendar', label: 'Calendar' },
]
async function upload(event: Event) {
  const el = event.target as HTMLInputElement
  const file = el.files?.[0]
  el.value = ''
  if (!file) return
  error.value = ''
  if (!isImageAsset(file.type)) {
    error.value = 'Choose a PNG, JPEG, GIF, WebP, AVIF or BMP image'
    return
  }
  await session
    .upload(file, (asset) => {
      cover.value = asset
    })
    .catch((reason: unknown) => {
      error.value = String(reason instanceof Error ? reason.message : reason)
    })
}
</script>
<template>
  <Dialog open title="Page icon and cover" size="sm" :close-on-escape="!session.pending.value" :close-on-interact-outside="!session.pending.value" @update:open="!$event && !session.pending.value && emit('close')">
    <label class="appearance-field">Emoji<Input v-model="emoji" aria-label="Page emoji" maxlength="32" placeholder="Type or paste an emoji" @update:model-value="icon = $event ?? ''" /></label>
    <div class="appearance-icons"><IconButton v-for="choice in choices" :key="choice.icon" :icon="choice.icon" :tooltip="choice.label" :active="icon === choice.icon" @click="icon = choice.icon; emoji = ''" /></div>
    <Button variant="ghost" @click="icon = ''; emoji = ''">Remove icon</Button>
    <div class="appearance-cover">
      <input ref="input" type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp" aria-label="Choose page cover" @change="upload" />
      <span>{{ cover?.name ?? 'No cover' }}</span>
      <Button :disabled="!!session.pending.value" @click="input?.click()">{{ cover ? 'Change cover' : 'Add cover' }}</Button>
      <Button v-if="cover" variant="ghost" :disabled="!!session.pending.value" @click="cover = null">Remove cover</Button>
    </div>
    <p v-if="session.pending.value" role="status">Uploading cover…</p>
    <p v-if="error" class="appearance-error" role="alert">{{ error }}</p>
    <template #footer>
      <Button variant="ghost" :disabled="!!session.pending.value" @click="emit('close')">Cancel</Button>
      <Button :disabled="!!session.pending.value" @click="emit('apply', { icon: icon.trim() || null, cover })">Apply</Button>
    </template>
  </Dialog>
</template>
<style scoped>
.appearance-field { display: flex; flex-direction: column; gap: 8px; }
.appearance-icons, .appearance-cover { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 16px; }
.appearance-cover span { width: 100%; overflow-wrap: anywhere; }
.appearance-error { color: var(--danger-11); }
</style>
