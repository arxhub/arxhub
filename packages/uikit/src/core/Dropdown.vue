<script setup lang="ts">
import Menu from './Menu.vue'
import type { Placement } from './placement'

withDefaults(defineProps<{ placement?: Placement }>(), { placement: 'bottom-start' })
</script>

<template>
  <Menu trigger="click" :placement="placement">
    <template #trigger>
      <slot name="trigger" />
    </template>
    <slot />
  </Menu>
</template>
