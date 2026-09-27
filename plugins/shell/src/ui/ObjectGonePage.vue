<script setup lang="ts">
import { Button, PageLayout } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { t } from '../i18n/messages'
import { type ObjectGoneProps, objectGoneMessage, objectGoneTitle } from './object-gone'

defineProps<ObjectGoneProps>()
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
</script>

<template>
  <PageLayout :title="objectGoneTitle()" :description="objectGoneMessage()">
    <p v-if="title" class="object-name">{{ title }}</p>
    <Button v-if="onClose" :size="buttonSize" data-testid="object-gone-close" @click="onClose()">{{ t('gone.close') }}</Button>
  </PageLayout>
</template>

<style scoped>
.object-name {
  margin: 0 0 16px;
  overflow-wrap: anywhere;
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}
</style>
