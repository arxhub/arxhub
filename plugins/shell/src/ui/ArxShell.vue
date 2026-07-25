<script setup lang="ts">
import { ActionMenuHost, ModalsProvider } from '@arxhub/uikit/core'
import { useArxHub, useIsMobile } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import AppFooter from './desktop/AppFooter.vue'
import AppHeader from './desktop/AppHeader.vue'
import AppSidebar from './desktop/AppSidebar.vue'
import DesktopLayout from './desktop/DesktopLayout.vue'
import type { SidebarItem } from './desktop/types'
import { ShellExtension } from './extension'
import MobileDrawer from './mobile/MobileDrawer.vue'
import MobileLayout from './mobile/MobileLayout.vue'

// The frame follows the viewport, not the build target: a narrow window on a desktop gets the same
// frame a phone does, and rotating a device switches it without a restart.
const isMobile = useIsMobile()
const drawerOpen = ref(false)

const arxhub = useArxHub()
const shell = arxhub.extensions.get(ShellExtension)

const activeItem = computed(() => shell.sidebar.items.find((i) => i.id === shell.sidebar.activeId))
const activeTitle = computed(() => activeItem.value?.title ?? 'ArxHub')

function sortedByOrder<T extends { order?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

const headerLeft = computed(() => sortedByOrder(shell.header.items.filter((i) => i.region === 'left')))
const headerCenter = computed(() => sortedByOrder(shell.header.items.filter((i) => i.region === 'center')))
const headerRight = computed(() => sortedByOrder(shell.header.items.filter((i) => i.region === 'right')))
const footerLeft = computed(() => sortedByOrder(shell.footer.items.filter((i) => i.region === 'left')))
const footerRight = computed(() => sortedByOrder(shell.footer.items.filter((i) => i.region === 'right')))

const sidebarItems = computed((): SidebarItem[] =>
  shell.sidebar.items.map((item) => ({
    id: item.id,
    icon: item.icon,
    title: item.title,
    region: item.region,
    order: item.order,
    hidden: item.hidden,
  })),
)
</script>

<template>
  <MobileLayout
    v-if="isMobile"
    :title="activeTitle"
    :drawer-open="drawerOpen"
    @toggle-navigation="drawerOpen = !drawerOpen"
  >
    <template #header-right>
      <component v-for="item in headerRight" :key="item.id" :is="item.component" />
    </template>
    <template #footer>
      <component v-for="item in footerLeft" :key="item.id" :is="item.component" />
      <component v-for="item in footerRight" :key="item.id" :is="item.component" />
    </template>
    <component v-if="activeItem?.layout" :is="activeItem.layout" />
  </MobileLayout>

  <DesktopLayout v-else>
    <template #sidebar>
      <AppSidebar
        :content="shell.content.value ?? undefined"
        :items="sidebarItems"
        :active-id="shell.sidebar.activeId"
        @item-select="shell.sidebar.setActive($event)"
      />
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
  <!-- Outside both frames on purpose: a mini-app teleports its rail into this drawer, and a target
       that lives inside a frame is destroyed the moment the window crosses the breakpoint. -->
  <MobileDrawer
    :open="isMobile && drawerOpen"
    :items="sidebarItems"
    :active-id="shell.sidebar.activeId"
    @item-select="shell.sidebar.setActive($event)"
    @close="drawerOpen = false"
  />
  <ModalsProvider />
  <ActionMenuHost />
</template>
