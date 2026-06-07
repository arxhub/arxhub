<script setup lang="ts">
import { computed } from 'vue'
import './default-icons'
import { resolveIcon } from './icons'

const props = withDefaults(
  defineProps<{
    name: string
    size?: number
    ariaLabel?: string
  }>(),
  { size: 20 },
)

const resolved = computed(() => resolveIcon(props.name))
</script>

<template>
  <component
    :is="resolved.component"
    v-if="resolved.component"
    :size="size"
    :aria-label="ariaLabel"
    :aria-hidden="ariaLabel ? undefined : true"
    :role="ariaLabel ? 'img' : undefined"
  />
  <span
    v-else
    class="icon-glyph"
    :style="{ fontSize: `${size}px`, width: `${size}px`, height: `${size}px` }"
    :aria-label="ariaLabel"
    :aria-hidden="ariaLabel ? undefined : true"
    :role="ariaLabel ? 'img' : undefined"
  >{{ resolved.glyph }}</span>
</template>

<style scoped>
.icon-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  user-select: none;
}
</style>
