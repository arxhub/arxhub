<script setup lang="ts">
import { Strip } from '@arxhub/uikit/core'
</script>

<template>
  <Strip title="Logs"><template #actions><slot name="actions" /></template></Strip>
  <Strip><div class="levels"><slot name="levels" /></div></Strip>
  <Strip><slot name="search" /><slot name="session" /></Strip>
</template>

<style scoped>
.levels { display: flex; gap: 4px; width: 100%; }
</style>
