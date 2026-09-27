<script setup lang="ts">
import { Strip } from '@arxhub/uikit/core'
import { t } from '../i18n/messages'
import SearchRail from './SearchRail.vue'
</script>

<template>
  <div class="search-page">
    <Strip :title="t('type.title')" />
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
