<script setup lang="ts">
import { QrCode } from '@ark-ui/vue'
import { computed } from 'vue'

// A QR code to be read by another device's camera. Ark draws the pattern; this owns the plate around it.
const props = withDefaults(
  defineProps<{
    value: string
    // What the code is, for a reader that cannot see it ("Invitation QR code").
    label: string
    // Edge of the pattern in px. A measure for this one control, not a token (DS-5).
    size?: number
  }>(),
  { size: 184 },
)

// M: a quarter of the modules may be lost to glare on a laptop screen and the code still reads.
const encoding = { ecc: 'M' as const, border: 0 }
const box = computed(() => ({ width: `${props.size}px`, height: `${props.size}px` }))
</script>

<template>
  <QrCode.Root class="qr-code" :model-value="value" :encoding="encoding" :pixel-size="1">
    <QrCode.Frame class="qr-frame" :style="box" role="img" :aria-label="label">
      <QrCode.Pattern class="qr-pattern" />
    </QrCode.Frame>
  </QrCode.Root>
</template>

<style scoped>
/* A scanner needs dark modules on a light plate whatever the theme, so this is the one
   place the fixed black and white steps stand in for a surface token. */
.qr-code {
  display: inline-flex;
  align-self: center;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--white-a12);
  line-height: 0;
}

.qr-frame {
  display: block;
  shape-rendering: crispEdges;
}

.qr-pattern {
  fill: var(--black-a12);
}
</style>
