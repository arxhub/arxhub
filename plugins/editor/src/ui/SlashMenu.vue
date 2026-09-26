<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import type { EditorView } from 'prosemirror-view'
import type { BlockCommand, SlashMenuState } from '../slash-commands'
import SlashMenuDesktop from './SlashMenuDesktop.vue'
import SlashMenuMobile from './SlashMenuMobile.vue'

defineProps<{ view: EditorView; menu: SlashMenuState; menuId: string; commands: readonly BlockCommand[] }>()
const realization = useShellFrame() === 'mobile' ? SlashMenuMobile : SlashMenuDesktop
</script>

<template>
  <component :is="realization" :view="view" :menu="menu" :menu-id="menuId" :commands="commands" />
</template>
