<script setup lang="ts">
import { Button, PageLayout } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { OBJECT_GONE_MESSAGE, OBJECT_GONE_TITLE, type ObjectGoneProps } from './object-gone'

defineProps<ObjectGoneProps>()
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
</script>

<template>
  <PageLayout :title="OBJECT_GONE_TITLE" :description="OBJECT_GONE_MESSAGE">
    <p v-if="title" class="object-name">{{ title }}</p>
    <Button v-if="onClose" :size="buttonSize" data-testid="object-gone-close" @click="onClose()">Close tab</Button>
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
