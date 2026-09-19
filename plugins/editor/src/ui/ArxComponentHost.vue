<script setup lang="ts">
import { Button, Card } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { onErrorCaptured, ref } from 'vue'
import type { ControlView } from '../control-views'
import DocumentControl from './DocumentControl.vue'

const props = defineProps<{ control: ControlView }>()
const arxhub = useArxHub()
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const failed = ref(false)
onErrorCaptured((error) => {
  failed.value = true
  arxhub.logger.error(`[ArxEditor] component ${props.control.node.type.name} failed:`, error)
  return false
})
</script>

<template>
  <Card v-if="failed" role="alert" title="This block couldn't load">
    <span>Its content is kept. You can continue working on the document.</span>
    <Button :size="buttonSize" variant="secondary" @click="failed = false">Retry block</Button>
  </Card>
  <component v-else :is="control.component ?? DocumentControl" :node="control.node" :mode="control.mode" :change="control.change" :replace="control.replace" />
</template>
