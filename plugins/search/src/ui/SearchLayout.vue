<script setup lang="ts">
import { Strip } from '@arxhub/uikit/core'
import SearchRail from './SearchRail.vue'
</script>

<template>
  <div class="search-page">
    <Strip title="Search" />
    <SearchRail />
  </div>
</template>

<style scoped>
.search-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}
</style>
