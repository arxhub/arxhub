<script setup lang="ts">
import { useArxHub } from '@arxhub/uikit/hooks'
import { AiWorkspaceExtension } from '../ai-workspace-extension'
import AiWorkspacePage from './AiWorkspacePage.vue'
import { aiWorkspaceState } from './use-ai-workspace'

const arxhub = useArxHub()
const extension = arxhub.extensions.get(AiWorkspaceExtension)
const state = aiWorkspaceState(extension)
</script>

<template>
  <AiWorkspacePage
    :load-sessions="extension.loadSessions"
    :accept="extension.accept"
    :reject="extension.reject"
    :compare="extension.compare"
    :open-overlay="extension.openOverlay"
    :open-source="extension.openSource"
    :state="state"
  />
</template>
