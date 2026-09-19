<script setup lang="ts">
import { Strip } from '@arxhub/uikit/core'
</script>

<template>
  <Strip>
    <div class="levels"><slot name="levels" /></div>
    <template #actions><slot name="actions" /></template>
  </Strip>
  <Strip><slot name="search" /><slot name="session" /></Strip>
</template>

<style scoped>
.levels { display: flex; gap: 4px; }
</style>
