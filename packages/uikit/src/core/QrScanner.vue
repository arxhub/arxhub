<script setup lang="ts">
import { ref } from 'vue'
import { useQrScanner } from '../hooks/useQrScanner'

// The camera, pointed at a QR code, inside the page — for a browser or a desktop webview that has no
// native scanner of its own. Reports the first code it reads, or why it cannot show a picture at all.
const emit = defineEmits<{
  detected: [text: string]
  unavailable: [reason: string]
}>()

defineProps<{
  // Under the viewfinder: what to point the camera at.
  hint?: string
}>()

const video = ref<HTMLVideoElement | null>(null)
const { state } = useQrScanner(video, {
  onDetected: (text) => emit('detected', text),
  onUnavailable: (reason) => emit('unavailable', reason),
})
</script>

<template>
  <div class="qr-scanner" :data-state="state">
    <div class="viewport">
      <!-- muted + playsinline: the only combination every mobile webview autoplays inline. -->
      <video ref="video" class="video" muted playsinline aria-hidden="true" />
      <span class="finder" aria-hidden="true"><i /><i /><i /><i /></span>
    </div>
    <p v-if="hint" class="hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.qr-scanner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

/* The camera picture is not themed: it is what the lens sees, so its frame and the marks over it are
   the fixed light-on-dark of any viewfinder, whatever the theme (DS-2 is about chrome colours). */
.viewport {
  position: relative;
  width: 100%;
  max-width: 320px;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--black-a12);
}

.video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.finder {
  position: absolute;
  inset: 20%;
}

.finder i {
  position: absolute;
  width: 24px;
  height: 24px;
  border: 0 solid var(--white-a12);
}

.finder i:nth-child(1) { top: 0; left: 0; border-top-width: 4px; border-left-width: 4px; }
.finder i:nth-child(2) { top: 0; right: 0; border-top-width: 4px; border-right-width: 4px; }
.finder i:nth-child(3) { bottom: 0; left: 0; border-bottom-width: 4px; border-left-width: 4px; }
.finder i:nth-child(4) { bottom: 0; right: 0; border-bottom-width: 4px; border-right-width: 4px; }

.hint {
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
  color: var(--gray-11);
  text-align: center;
}
</style>
