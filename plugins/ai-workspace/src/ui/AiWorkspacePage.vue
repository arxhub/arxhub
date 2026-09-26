<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import AiWorkspaceDesktop from './AiWorkspaceDesktop.vue'
import AiWorkspaceMobile from './AiWorkspaceMobile.vue'
import type { AiWorkspaceProps } from './use-ai-workspace'

defineProps<AiWorkspaceProps>()
const surface = useShellFrame() === 'mobile' ? AiWorkspaceMobile : AiWorkspaceDesktop
</script>

<template><component :is="surface" v-bind="$props" /></template>
