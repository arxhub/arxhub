<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import AiWorkspaceDesktop from './AiWorkspaceDesktop.vue'
import AiWorkspaceMobile from './AiWorkspaceMobile.vue'
import type { AiWorkspaceCore, AiWorkspaceProps } from './use-ai-workspace'

// `state` is the type's shared session state (see `aiWorkspaceState`); an embedded page without it keeps its own.
defineProps<AiWorkspaceProps & { state?: AiWorkspaceCore }>()
const surface = useShellFrame() === 'mobile' ? AiWorkspaceMobile : AiWorkspaceDesktop
</script>

<template><component :is="surface" v-bind="$props" /></template>
