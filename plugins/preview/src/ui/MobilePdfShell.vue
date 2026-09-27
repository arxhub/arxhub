<script setup lang="ts">
import { formatNumber } from '@arxhub/i18n'
import { DocumentsExtension } from '@arxhub/plugin-documents'
import { stepZoomValue } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onUnmounted } from 'vue'
import { t } from '../i18n/messages'
import { DEFAULT_ZOOM, formatPageOf, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP } from '../pdf'

const props = defineProps<{
  path: string
  meta: string
  zoom: number
  onZoom: (value: number) => void
  page: number
  pageCount: number
  onPage: (index: number) => void
}>()

const documents = useArxHub().extensions.get(DocumentsExtension)
const scale = { min: MIN_ZOOM, max: MAX_ZOOM, step: ZOOM_STEP }

// The phone's PDF has no chrome of its own: the name, the pages and zoom are the object band's, so the
// page fills the screen and the thumb finds every control in the one band it already knows.
onUnmounted(
  documents.registerViewBar(
    () => props.path,
    () => ({
      icon: 'lu:file-text',
      sub: props.pageCount > 0 ? formatPageOf(props.page, props.pageCount) : props.meta || undefined,
      parts:
        props.pageCount > 0
          ? {
              title: t('pdf.pages'),
              items: Array.from({ length: props.pageCount }, (_, i) => ({
                id: String(i + 1),
                title: t('pdf.page', { page: i + 1 }),
                selected: i + 1 === props.page,
              })),
              pick: (id: string) => props.onPage(Number(id)),
            }
          : undefined,
      actions: [
        {
          id: 'preview.zoom-out',
          label: t('pdf.zoomOut'),
          icon: 'lu:zoom-out',
          disabled: props.zoom <= MIN_ZOOM,
          onSelect: () => props.onZoom(stepZoomValue(props.zoom, -1, scale)),
        },
        {
          id: 'preview.zoom-in',
          label: t('pdf.zoomIn'),
          icon: 'lu:zoom-in',
          disabled: props.zoom >= MAX_ZOOM,
          onSelect: () => props.onZoom(stepZoomValue(props.zoom, 1, scale)),
        },
      ],
      menu: [
        {
          id: 'preview.zoom-reset',
          label: t('pdf.zoomReset', { percent: formatNumber(Math.round(props.zoom * 100) / 100, { style: 'percent' }) }),
          icon: 'lu:maximize-2',
          disabled: props.zoom === DEFAULT_ZOOM,
          onSelect: () => props.onZoom(DEFAULT_ZOOM),
        },
      ],
    }),
  ),
)
</script>

<template>
  <div class="pdf-shell">
    <slot />
  </div>
</template>

<style scoped>
.pdf-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
</style>
