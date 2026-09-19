<script setup lang="ts">
import { Button, Dialog, Icon, IconButton } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { BudgetExtension } from '../budget-extension'
import type { BudgetTransaction } from '../model'

type Attachment = BudgetTransaction['attachments'][number]

const props = defineProps<{
  existing: Attachment[]
  files: File[]
  disabled?: boolean
}>()
const emit = defineEmits<{
  'update:files': [files: File[]]
  'remove-existing': [attachment: Attachment]
}>()

const arxhub = useArxHub()
const budget = arxhub.extensions.get(BudgetExtension)
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'md'
const iconSize = touch ? 'xl' : 'md'
const glyphSize = touch ? 16 : 14
const cameraInput = ref<HTMLInputElement>()
const fileInput = ref<HTMLInputElement>()
const objectUrls = new Map<File, string>()
const existingUrls = ref(new Map<string, string>())
const previewPhoto = ref<{ name: string; url: string } | null>(null)
let previewRun = 0

const newPhotos = computed(() => props.files.map((file) => ({ file, url: objectUrls.get(file) ?? rememberUrl(file) })))

function rememberUrl(file: File): string {
  const url = URL.createObjectURL(file)
  objectUrls.set(file, url)
  return url
}

watch(
  () => props.files,
  (files) => {
    for (const [file, url] of objectUrls) {
      if (files.includes(file)) continue
      if (previewPhoto.value?.url === url) previewPhoto.value = null
      URL.revokeObjectURL(url)
      objectUrls.delete(file)
    }
  },
)

watch(
  () => props.existing,
  async (attachments) => {
    const run = ++previewRun
    const next = new Map<string, string>()
    const discardNext = () => {
      for (const url of next.values()) URL.revokeObjectURL(url)
    }
    for (const attachment of attachments) {
      try {
        const blob = await budget.readReceiptPhoto(attachment)
        if (run !== previewRun) {
          discardNext()
          return
        }
        next.set(attachment.id, URL.createObjectURL(blob))
      } catch (cause) {
        arxhub.logger.warn('[budget] could not preview receipt photo', cause)
      }
    }
    if (run !== previewRun) {
      discardNext()
      return
    }
    for (const url of existingUrls.value.values()) {
      if (previewPhoto.value?.url === url) previewPhoto.value = null
      URL.revokeObjectURL(url)
    }
    existingUrls.value = next
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  previewRun++
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  for (const url of existingUrls.value.values()) URL.revokeObjectURL(url)
})

function choose(input: HTMLInputElement | undefined): void {
  input?.click()
}

function selected(event: Event): void {
  const input = event.currentTarget as HTMLInputElement
  const chosen = [...(input.files ?? [])]
  emit('update:files', [...new Set([...props.files, ...chosen])])
  input.value = ''
}

function removeFile(file: File): void {
  emit(
    'update:files',
    props.files.filter((entry) => entry !== file),
  )
}

function showPhoto(name: string, url: string | undefined): void {
  if (url) previewPhoto.value = { name, url }
}
</script>

<template>
  <section class="photos" aria-labelledby="receipt-photos-heading">
    <div>
      <h3 id="receipt-photos-heading">Receipt photos</h3>
      <p>Optional. Keep a photo with this transaction.</p>
    </div>
    <input ref="cameraInput" type="file" accept="image/*" capture="environment" aria-label="Take receipt photo" hidden @change="selected" />
    <input ref="fileInput" type="file" accept="image/*" aria-label="Choose receipt photo" hidden multiple @change="selected" />
    <div class="photo-actions">
      <Button :size="buttonSize" variant="secondary" :disabled="disabled" @click="choose(cameraInput)">
        <Icon name="lu:camera" :size="glyphSize" />
        Take photo
      </Button>
      <Button :size="buttonSize" variant="secondary" :disabled="disabled" @click="choose(fileInput)">
        <Icon name="lu:image-plus" :size="glyphSize" />
        Choose photo
      </Button>
    </div>
    <ul v-if="existing.length || newPhotos.length" class="photo-list">
      <li v-for="attachment in existing" :key="attachment.id" class="photo-row">
        <IconButton
          v-if="existingUrls.get(attachment.id)"
          class="photo-preview-button"
          :size="iconSize"
          :tooltip="`View ${attachment.name}`"
          :aria-label="`View ${attachment.name}`"
          :disabled="disabled"
          @click="showPhoto(attachment.name, existingUrls.get(attachment.id))"
        >
          <img :src="existingUrls.get(attachment.id)" alt="" />
        </IconButton>
        <Icon v-else name="lu:image" :size="glyphSize" />
        <span>{{ attachment.name }}</span>
        <IconButton
          icon="lu:x"
          :size="iconSize"
          tooltip="Remove receipt photo"
          :aria-label="`Remove ${attachment.name}`"
          :disabled="disabled"
          @click="emit('remove-existing', attachment)"
        />
      </li>
      <li v-for="photo in newPhotos" :key="photo.url" class="photo-row">
        <IconButton
          class="photo-preview-button"
          :size="iconSize"
          :tooltip="`View ${photo.file.name}`"
          :aria-label="`View ${photo.file.name}`"
          :disabled="disabled"
          @click="showPhoto(photo.file.name, photo.url)"
        >
          <img :src="photo.url" alt="" />
        </IconButton>
        <span>{{ photo.file.name }}</span>
        <IconButton
          icon="lu:x"
          :size="iconSize"
          tooltip="Remove receipt photo"
          :aria-label="`Remove ${photo.file.name}`"
          :disabled="disabled"
          @click="removeFile(photo.file)"
        />
      </li>
    </ul>
    <Dialog
      :open="!!previewPhoto"
      :title="previewPhoto?.name ?? 'Receipt photo'"
      size="lg"
      @update:open="previewPhoto = $event ? previewPhoto : null"
    >
      <img v-if="previewPhoto" class="large-preview" :src="previewPhoto.url" :alt="previewPhoto.name" />
    </Dialog>
  </section>
</template>

<style scoped>
.photos {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

h3,
.photos p {
  margin: 0;
}

h3 {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
}

.photos p {
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}

.photo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.photo-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.photo-row {
  display: flex;
  align-items: center;
  min-height: var(--size-2xs);
  gap: 8px;
  color: var(--gray-12);
}

.photo-preview-button {
  padding: 0;
  overflow: hidden;
  border-radius: var(--radius-xs);
}

.photo-preview-button img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-row span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.large-preview {
  display: block;
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
}
</style>
