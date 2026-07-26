<script setup lang="ts">
import { ActionMenuHost, ModalsProvider } from '@arxhub/uikit/core'
import { provideShellFrame } from '@arxhub/uikit/hooks'
import { useShell } from '../use-shell'
import AppFooter from './AppFooter.vue'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import DesktopLayout from './DesktopLayout.vue'

// The whole desktop frame, and the only place that says so: everything below reads the frame from
// injection rather than measuring the window.
provideShellFrame('desktop')

const { content, activeItem, activeId, sidebarItems, headerLeft, headerCenter, headerRight, footerLeft, footerRight, setActive } = useShell()
</script>

<template>
  <DesktopLayout>
    <template #sidebar>
      <AppSidebar :content="content" :items="sidebarItems" :active-id="activeId" @item-select="setActive($event)" />
    </template>
    <template #header>
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
    <template #footer>
      <AppFooter>
        <template #left>
          <component v-for="item in footerLeft" :key="item.id" :is="item.component" />
        </template>
        <template #right>
          <component v-for="item in footerRight" :key="item.id" :is="item.component" />
        </template>
      </AppFooter>
    </template>
    <component v-if="activeItem?.layout" :is="activeItem.layout" />
  </DesktopLayout>
  <ModalsProvider />
  <ActionMenuHost />
</template>
