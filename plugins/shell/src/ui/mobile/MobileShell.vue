<script setup lang="ts">
import { ActionMenuHost, ModalsProvider, Toaster } from '@arxhub/uikit/core'
import { provideShellFrame, useKeyboardInset } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import type { MobileTab } from '../extension'
import { useShell } from '../use-shell'
import MobileEdgeGestures from './MobileEdgeGestures.vue'
import MobileFilesPanel from './MobileFilesPanel.vue'
import MobileMoreSheet from './MobileMoreSheet.vue'
import MobileTabBar from './MobileTabBar.vue'
import { railClaim } from './rail-host'

// The whole mobile frame, and the only place that says so: everything below reads the frame from
// injection rather than measuring the window.
provideShellFrame('mobile')

const { activeItem, activeTitle, activeId, sidebarItems, footerLeft, footerRight, tabs: pluginTabs, setActive } = useShell()

// The frame gives up the height the keyboard takes instead of letting it cover the bottom of the
// app. Everything that can be operated is down there, so this is the difference between typing blind
// and seeing what you type.
const keyboardInset = useKeyboardInset()

// One layer at a time: opening the second would bury the first, and back would then have to unwind
// two things the owner only opened once.
const layer = ref<'files' | 'more' | null>(null)

function toggle(which: 'files' | 'more'): void {
  layer.value = layer.value === which ? null : which
}

// Two keys belong to the frame rather than to any plugin: the one that reveals the active mini-app's
// own navigation, and the one holding everything not needed while reading.
const frameTabs = computed((): MobileTab[] => [
  ...(railClaim.value != null
    ? [
        {
          id: 'arxhub.shell.rail',
          icon: railClaim.value.icon,
          // The mini-app names its own rail: the same panel holds files under Explorer and sections
          // under Settings, so the frame is in no position to label it.
          title: railClaim.value.title ?? activeTitle.value,
          order: -100,
          gesture: 'left-edge' as const,
          active: () => layer.value === 'files',
          onSelect: () => toggle('files'),
        },
      ]
    : []),
  {
    id: 'arxhub.shell.more',
    icon: 'lu:ellipsis',
    title: 'More',
    order: 100,
    active: () => layer.value === 'more',
    onSelect: () => toggle('more'),
  },
])

// A mini-app is a place you go, so it belongs on the bar rather than two taps deep inside More.
// Only the primary ones: an item in the 'bottom' region is a utility — settings, logs — and stays in
// the sheet, exactly as it sits at the bottom of the desktop rail rather than among the mini-apps.
const miniAppTabs = computed((): MobileTab[] =>
  sidebarItems.value
    .filter((item) => !item.hidden && item.region !== 'bottom')
    .map((item) => ({
      id: item.id,
      icon: item.icon,
      title: item.title,
      order: item.order ?? 0,
      active: () => activeId.value === item.id,
      onSelect: () => setActive(item.id),
    })),
)

// Five keys is what the bar holds before they stop being tappable. More is never dropped — it is the
// way to reach whatever did not fit, since the sheet lists every mini-app regardless.
const MAX_TABS = 5

const allTabs = computed(() => [...frameTabs.value, ...miniAppTabs.value, ...pluginTabs.value].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))

const tabs = computed(() => {
  const all = allTabs.value
  if (all.length <= MAX_TABS) return all
  const more = all.filter((tab) => tab.id === 'arxhub.shell.more')
  return [...all.filter((tab) => tab.id !== 'arxhub.shell.more').slice(0, MAX_TABS - more.length), ...more]
})

// Off the full set, not the bar: a gesture is a second way to reach a tab, and it must not disappear
// because that tab was the one pushed off the end.
const leftEdge = computed(() => allTabs.value.find((t) => t.gesture === 'left-edge'))
const rightEdge = computed(() => allTabs.value.find((t) => t.gesture === 'right-edge'))

const railTitle = computed(() => railClaim.value?.title ?? activeTitle.value)

const status = computed(() => [...footerLeft.value, ...footerRight.value])
</script>

<template>
  <div class="mobile-shell" :style="{ paddingBottom: keyboardInset ? `${keyboardInset}px` : undefined }">
    <!-- No app bar. The top of the screen is content, and the title it would have shown is either in
         the note itself or on the key that opened it. -->
    <div class="mobile-stage">
      <main class="mobile-content">
        <component v-if="activeItem?.layout" :is="activeItem.layout" />
      </main>

      <MobileFilesPanel :open="layer === 'files'" :title="railTitle" @close="layer = null" />

      <MobileEdgeGestures
        :left="leftEdge != null"
        :right="rightEdge != null"
        @left="leftEdge?.onSelect()"
        @right="rightEdge?.onSelect()"
      />
    </div>

    <MobileTabBar :tabs="tabs" />
    <Toaster />
  </div>

  <MobileMoreSheet
    :open="layer === 'more'"
    :items="sidebarItems"
    :active-id="activeId"
    :status="status"
    @item-select="setActive($event)"
    @close="layer = null"
  />
  <ModalsProvider />
  <ActionMenuHost />
</template>

<style scoped>
.mobile-shell {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  width: 100%;
  overflow: hidden;
  background: var(--gray-1);
  color: var(--gray-12);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
}

/* Anchors the panel and the edge strips: they cover the content they belong to, and leave the keys
   below them live. */
.mobile-stage {
  position: relative;
  flex: 1;
  min-height: 0;
}

.mobile-content {
  height: 100%;
  overflow: hidden;
  /* The device's own status bar is above us and nothing is allowed to hide under it. */
  padding-top: env(safe-area-inset-top);
}
</style>
