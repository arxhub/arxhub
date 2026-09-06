<script setup lang="ts">
import { ActionMenuHost, ModalsProvider } from '@arxhub/uikit/core'
import { provideShellFrame } from '@arxhub/uikit/hooks'
import { useShell } from '../use-shell'
import AppSidebar from './AppSidebar.vue'
import DesktopLayout from './DesktopLayout.vue'

// The whole desktop frame, and the only place that says so: everything below reads the frame from
// injection rather than measuring the window.
provideShellFrame('desktop')

// footerLeft/footerRight aren't read here — DesktopMiniAppShell renders the footer itself, beside its
// own rail, so the rail can reach the true bottom of the window instead of stopping where a
// DesktopLayout-level footer used to start underneath both the rail and the content.
//
// No header either. It was an extension point nothing extended — zero registrations in the whole
// repository — and the strip only ever rendered when one arrived, so it never rendered. The mobile
// frame makes the same call permanently ("the top of the screen is content"); the desktop frame has
// now simply stopped keeping a slot for a band nobody asked for.
const { activeItem, activeId, sidebarItems, setActive } = useShell()
</script>

<template>
  <DesktopLayout>
    <template #sidebar>
      <AppSidebar :items="sidebarItems" :active-id="activeId" @item-select="setActive($event)" />
    </template>
    <!-- See MobileShell.vue's identical wrapper: without KeepAlive, switching mini-apps fully
         remounted the outgoing one on every trip, losing scroll/undo/selection in whatever was open. -->
    <KeepAlive>
      <component v-if="activeItem?.layout" :is="activeItem.layout" :key="activeItem.id" />
    </KeepAlive>
  </DesktopLayout>
  <ModalsProvider />
  <ActionMenuHost />
</template>
