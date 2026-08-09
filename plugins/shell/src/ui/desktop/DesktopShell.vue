<script setup lang="ts">
import { ActionMenuHost, ModalsProvider } from '@arxhub/uikit/core'
import { provideShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { useShell } from '../use-shell'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import DesktopLayout from './DesktopLayout.vue'

// The whole desktop frame, and the only place that says so: everything below reads the frame from
// injection rather than measuring the window.
provideShellFrame('desktop')

// footerLeft/footerRight aren't read here — DesktopMiniAppShell renders the footer itself, beside its
// own rail, so the rail can reach the true bottom of the window instead of stopping where a
// DesktopLayout-level footer used to start underneath both the rail and the content.
const { content, activeItem, activeId, sidebarItems, headerLeft, headerCenter, headerRight, setActive } = useShell()

// The header is an extension point nothing currently extends, and an empty strip of chrome is still
// 40px of the window: it reads as a title bar that forgot its title. So it exists when a plugin has
// put something in it and not otherwise — the mobile frame makes the same call permanently ("the top
// of the screen is content"), and this is the desktop version of it.
const hasHeader = computed(() => headerLeft.value.length + headerCenter.value.length + headerRight.value.length > 0)
</script>

<template>
  <DesktopLayout>
    <template #sidebar>
      <AppSidebar :content="content" :items="sidebarItems" :active-id="activeId" @item-select="setActive($event)" />
    </template>
    <template v-if="hasHeader" #header>
      <AppHeader>
        <template #left>
          <component v-for="item in headerLeft" :key="item.id" :is="item.component" />
        </template>
        <template #center>
          <component v-for="item in headerCenter" :key="item.id" :is="item.component" />
        </template>
        <template #right>
          <component v-for="item in headerRight" :key="item.id" :is="item.component" />
        </template>
      </AppHeader>
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
