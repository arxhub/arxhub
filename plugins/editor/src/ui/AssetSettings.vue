<script setup lang="ts">
import { Button, Dropdown, Input, MenuItem } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { useAssetSession } from '../asset-session'
import { isImageAsset } from '../assets'
import type { ArxEditorControlProps } from '../control-views'
import { t } from '../i18n/messages'

const props = defineProps<ArxEditorControlProps>()
const session = useAssetSession()
const image = computed(() => props.node.type.name === 'image_block')
const fileInput = ref<HTMLInputElement>()
const error = ref('')
const size = useShellFrame() === 'mobile' ? 'lg' : 'sm'
async function choose(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || props.mode !== 'editable') return
  if (image.value && !isImageAsset(file.type)) {
    error.value = t('asset.wrongType')
    return
  }
  error.value = ''
  // Capture this block's change callback before awaiting: changing the inspector target must not redirect an upload.
  const change = props.change
  await session.upload(file, (asset) => change({ ...asset })).catch(() => {})
}
</script>
<template>
  <input ref="fileInput" type="file" hidden :accept="image ? 'image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp' : undefined" :aria-label="image ? t('asset.chooseImageFile') : t('asset.chooseAttachmentFile')" @change="choose" />
  <Button :size="size" variant="secondary" :disabled="session.pending.value > 0" @click="fileInput?.click()">{{ node.attrs.path ? t('asset.replaceFile') : t('asset.chooseFile') }}</Button>
  <p v-if="error" role="alert">{{ error }}</p>
  <label>{{ t('asset.caption') }}<Input :model-value="node.attrs.caption" :aria-label="t('asset.captionAria')" @update:model-value="change({ caption: $event })" /></label>
  <label v-if="image">{{ t('asset.alt') }}<Input :model-value="node.attrs.alt" :aria-label="t('asset.altAria')" @update:model-value="change({ alt: $event })" /></label>
  <Dropdown v-if="image"><template #trigger><Button :size="size" variant="secondary" :aria-label="t('asset.width')">{{ node.attrs.width }}%</Button></template><MenuItem v-for="width in [25, 50, 75, 100]" :key="width" :value="String(width)" @select="change({ width })">{{ width }}%</MenuItem></Dropdown>
</template>
<style scoped>
label { display: flex; flex-direction: column; gap: 4px; }
</style>
