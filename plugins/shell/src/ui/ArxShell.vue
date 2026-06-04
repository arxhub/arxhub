<script setup lang="ts">
import { computed } from 'vue'
import { useArxHub } from '@arxhub/uikit/hooks'
import DesktopLayout from './desktop/DesktopLayout.vue'
import AppHeader from './desktop/AppHeader.vue'
import AppSidebar from './desktop/AppSidebar.vue'
import AppFooter from './desktop/AppFooter.vue'
import type { SidebarItem } from './desktop/types'
import { ShellExtension } from './extension'

const arxhub = useArxHub()
const shell = arxhub.extensions.get(ShellExtension)

const activeItem = computed(() =>
  shell.sidebar.items.find(i => i.id === shell.sidebar.activeId)
)

function sortedByOrder<T extends { order?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

const headerLeft = computed(() => sortedByOrder(shell.header.items.filter(i => i.region === 'left')))
const headerCenter = computed(() => sortedByOrder(shell.header.items.filter(i => i.region === 'center')))
const headerRight = computed(() => sortedByOrder(shell.header.items.filter(i => i.region === 'right')))
const footerLeft = computed(() => sortedByOrder(shell.footer.items.filter(i => i.region === 'left')))
const footerRight = computed(() => sortedByOrder(shell.footer.items.filter(i => i.region === 'right')))

const sidebarItems = computed((): SidebarItem[] =>
  shell.sidebar.items.map(item => ({
    id: item.id,
    icon: item.icon,
    title: item.title,
    region: item.region,
    order: item.order,
  }))
)
</script>

<template>
  <DesktopLayout>
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
</template>
