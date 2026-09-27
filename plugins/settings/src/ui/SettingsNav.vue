<script setup lang="ts">
import { useNavHost } from '@arxhub/plugin-shell/ui'
import { IconButton, Strip } from '@arxhub/uikit/core'
import { t } from '../i18n/messages'
import SettingsSectionList from './SettingsSectionList.vue'

const navHost = useNavHost()
</script>

<template>
  <div class="settings-navigation">
    <Strip :title="t('type.sections')" flush-actions>
      <template #actions>
        <IconButton v-if="navHost" size="lg" :icon="navHost.icon" :tooltip="navHost.label" @click="navHost.dismiss()" />
      </template>
    </Strip>
    <SettingsSectionList />
  </div>
</template>

<style scoped>
.settings-navigation {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
</style>
