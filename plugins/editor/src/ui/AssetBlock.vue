<script setup lang="ts">
import { Button, Dropdown, Icon, Input, MenuItem } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useAssetSession } from '../asset-session'
import { type ArxAsset, isImageAsset } from '../assets'
import type { ArxEditorControlProps } from '../control-views'

const props = defineProps<ArxEditorControlProps>()
const buttonSize = useShellFrame() === 'mobile' ? 'md' : 'sm'
const session = useAssetSession()
const image = computed(() => props.node.type.name === 'image_block')
const fileInput = ref<HTMLInputElement>()
const url = ref('')
const loadError = ref('')
const loading = ref(false)
const configuring = ref(false)
const caption = ref('')
const alt = ref('')
let ticket = 0

function release() {
  if (url.value) URL.revokeObjectURL(url.value)
  url.value = ''
}

async function load() {
  const current = ++ticket
  release()
  loadError.value = ''
  if (!props.node.attrs.path) return
  loading.value = true
  try {
    const asset: ArxAsset = {
      path: props.node.attrs.path,
      name: props.node.attrs.name,
      mime: props.node.attrs.mime,
      size: props.node.attrs.size,
    }
    const bytes = await session.store.read(asset)
    if (current !== ticket) return
    url.value = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: asset.mime }))
  } catch (error) {
    if (current === ticket) loadError.value = error instanceof Error ? error.message : 'Could not load attachment'
  } finally {
    if (current === ticket) loading.value = false
  }
}

watch(
  () => props.node.attrs.path,
  () => {
    if (image.value) void load()
    else {
      ticket++
      release()
      loadError.value = ''
      loading.value = false
    }
  },
  { immediate: true },
)
onUnmounted(() => {
  ticket++
  release()
})

async function choose(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || props.mode !== 'editable') return
  if (image.value && !isImageAsset(file.type)) {
    loadError.value = 'Choose a PNG, JPEG, GIF, WebP, AVIF or BMP image'
    return
  }
  await session.upload(file, (asset) => props.change({ ...asset })).catch(() => {})
}

function configure() {
  caption.value = props.node.attrs.caption
  alt.value = props.node.attrs.alt ?? ''
  configuring.value = true
}

function apply() {
  if (props.mode !== 'editable') return
  props.change({ caption: caption.value, ...(image.value ? { alt: alt.value } : {}) })
  configuring.value = false
}

async function download() {
  if (!url.value) await load()
  if (!url.value) return
  const link = document.createElement('a')
  link.href = url.value
  link.download = props.node.attrs.name || 'attachment'
  link.click()
}
</script>

<template>
  <figure class="asset-block" :style="image ? { width: `${node.attrs.width}%` } : undefined">
    <input v-if="mode === 'editable'" ref="fileInput" type="file" hidden :accept="image ? 'image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp' : undefined"
      :aria-label="image ? 'Choose image file' : 'Choose attachment file'" @change="choose" />
    <template v-if="node.attrs.path">
      <img v-if="image && url" :src="url" :alt="node.attrs.alt || node.attrs.name" draggable="false" loading="lazy" decoding="async" @error="loadError = 'Could not display this image'" />
      <div v-if="!image" class="asset-actions"><Icon name="lu:paperclip" /><span>{{ node.attrs.name }}</span><span class="asset-meta">{{ Math.ceil(node.attrs.size / 1024) }} KB</span></div>
      <span v-if="loading" role="status">Loading attachment…</span>
      <div v-if="loadError" class="asset-actions" role="alert"><span>{{ loadError }}</span><Button :size="buttonSize" variant="secondary" @click="load">Retry attachment</Button></div>
      <figcaption v-if="node.attrs.caption">{{ node.attrs.caption }}</figcaption>
      <div class="asset-actions">
        <Button :size="buttonSize" variant="ghost" :disabled="loading" @click="download">Download</Button>
        <template v-if="mode === 'editable'">
          <Button :size="buttonSize" variant="ghost" :disabled="session.pending.value > 0" @click="fileInput?.click()">Replace file</Button>
          <Button :size="buttonSize" variant="ghost" @click="configure">Edit caption</Button>
          <Dropdown v-if="image">
            <template #trigger><Button :size="buttonSize" variant="ghost" aria-label="Image width">{{ node.attrs.width }}%</Button></template>
            <MenuItem v-for="width in [25, 50, 75, 100]" :key="width" :value="String(width)" @select="change({ width })">{{ width }}%</MenuItem>
          </Dropdown>
        </template>
      </div>
    </template>
    <div v-else class="asset-empty">
      <Icon :name="image ? 'lu:image' : 'lu:paperclip'" />
      <Button v-if="mode === 'editable'" :size="buttonSize" variant="secondary" :disabled="session.pending.value > 0" @click="fileInput?.click()">{{ image ? 'Choose image' : 'Choose file' }}</Button>
      <span v-else>{{ image ? 'No image selected' : 'No file selected' }}</span>
      <span v-if="loadError" role="alert">{{ loadError }}</span>
    </div>
    <form v-if="configuring && mode === 'editable'" class="asset-config" @submit.prevent="apply" @keydown.stop>
      <label>Caption<Input v-model="caption" aria-label="Attachment caption" /></label>
      <label v-if="image">Alternative text<Input v-model="alt" aria-label="Image alternative text" /></label>
      <div class="asset-actions"><Button :size="buttonSize" type="submit" variant="secondary">Apply caption</Button><Button :size="buttonSize" variant="ghost" @click="configuring = false">Cancel</Button></div>
    </form>
  </figure>
</template>

<style scoped>
.asset-block { margin: 8px 0; max-width: 100%; min-width: min(160px, 100%); }
.asset-block img { display: block; width: 100%; height: auto; border-radius: var(--radius-sm); }
.asset-block figcaption, .asset-meta { color: var(--gray-11); font-size: var(--font-size-sm); }
.asset-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.asset-empty { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 16px; border: 1px dashed var(--gray-6); border-radius: var(--radius-sm); }
.asset-config { display: flex; flex-direction: column; gap: 8px; padding-block: 8px; }
.asset-config label { display: flex; flex-direction: column; gap: 4px; font-size: var(--font-size-sm); }
</style>
