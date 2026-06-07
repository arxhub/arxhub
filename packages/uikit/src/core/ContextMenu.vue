<script setup lang="ts">
import Menu from './Menu.vue'
</script>

<template>
  <Menu trigger="context">
    <template #trigger>
      <slot name="trigger" />
    </template>
    <slot />
  </Menu>
</template>
