<script setup lang="ts">
import { ARXHUB_KEY } from '@arxhub/uikit/hooks'
import { inject } from 'vue'
import { AiWorkspaceExtension } from '../ai-workspace-extension'
import AiWorkspacePage from './AiWorkspacePage.vue'

const arxhub = inject(ARXHUB_KEY)
if (!arxhub) throw new Error('ArxHub is not provided')
const extension = arxhub.extensions.get(AiWorkspaceExtension)
</script>

<template>
  <AiWorkspacePage
    :load-sessions="extension.loadSessions"
    :accept="extension.accept"
    :reject="extension.reject"
    :compare="extension.compare"
    :open-overlay="extension.openOverlay"
    :open-source="extension.openSource"
  />
</template>
