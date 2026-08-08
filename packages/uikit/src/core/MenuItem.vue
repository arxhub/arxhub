<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { Menu } from '@ark-ui/vue'
import Row from './Row.vue'

withDefaults(
  defineProps<{
    value: string
    disabled?: boolean
    variant?: 'default' | 'danger'
  }>(),
  { variant: 'default' },
)

const emit = defineEmits<{ select: [] }>()
</script>

<template>
  <!-- as-child, so the state machine, the keyboard model and the ARIA stay with Ark while the box is the
       row role rather than a second implementation of it: Ark merges its item props onto the element Row
       renders. The highlight arrives as data-highlighted, which Row answers alongside :hover. -->
  <Menu.Item as-child :value="value" :disabled="disabled" @select="emit('select')">
    <Row :disabled="disabled" :tone="variant === 'danger' ? 'danger' : 'neutral'">
      <slot />
    </Row>
  </Menu.Item>
</template>
