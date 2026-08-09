<script setup lang="ts">
import { ActionMenuHost, ModalsProvider, Toaster } from '@arxhub/uikit/core'
import { provideShellFrame, useKeyboardInset } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import type { MobileTab } from '../extension'
import { useShell } from '../use-shell'
import MobileDock from './MobileDock.vue'
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

// The one frame-owned key left in the row: "everything not needed while reading". The nav/rail key
// used to live here too, mixed in with the mini-app switcher below it — it now has its own strip
// (MobileDock, below) since "navigate within where I am" and "switch to a different place" are
// different questions, not one row answering both.
const frameTabs = computed((): MobileTab[] => [
  {
    id: 'arxhub.shell.more',
    icon: 'lu:ellipsis',
    title: 'More',
    order: 100,
    role: 'layer' as const,
    active: () => layer.value === 'more',
    onSelect: () => toggle('more'),
  },
])

// The dock strip's own content — independent of the tab row's list so the left-edge gesture and the
// strip's render condition both key off it directly, not off a search through `allTabs`.
const nav = computed(() =>
  railClaim.value == null
    ? null
    : {
        icon: railClaim.value.icon,
        // The mini-app names its own rail: the same panel holds files under Explorer and sections
        // under Settings, so the frame is in no position to label it.
        title: railClaim.value.title ?? activeTitle.value,
        active: layer.value === 'files',
      },
)

// A mini-app is a place you go, so it belongs on the bar rather than two taps deep inside More.
// Only the primary ones: an item in the 'bottom' region is a utility — settings, logs — and stays in
// the sheet, exactly as it sits at the bottom of the desktop rail rather than among the mini-apps.
const miniAppTabs = computed((): MobileTab[] =>
  sidebarItems.value
    .filter((item) => !item.hidden && item.region !== 'bottom' && !item.absorbedOnMobileBy)
    .map((item) => ({
      id: item.id,
      icon: item.icon,
      title: item.mobileTitle ?? item.title,
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

// The nav key's swipe is wired straight to `nav`/`toggle` now that it is not a tab to search for.
// rightEdge is still a tab search: MobilePanels registers its "Notes, N open" switcher key at runtime
// via shell.tabs, a genuine plugin-owned tab, not a frame-owned one.
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
        <!-- Switching mini-apps used to fully unmount the outgoing one — a phone will do this dozens
             of times a session (Notes -> Search -> back), and every return was a freshly-mounted
             editor: scroll reset, undo history gone, selection lost. KeepAlive caches each mini-app's
             component tree by its own identity, so the one PanelsLayout instance it holds (and every
             editor inside it) survives the trip instead of being torn down and rebuilt. -->
        <KeepAlive>
          <component v-if="activeItem?.layout" :is="activeItem.layout" :key="activeItem.id" />
        </KeepAlive>
      </main>

      <!-- Last in the flex column, not first: this is the row directly above the tab bar — the two-tier
           bottom bar the dock exists for. Still inside .mobile-stage rather than beside it, so
           MobileFilesPanel's scrim (inset: 0 relative to .mobile-stage) covers it along with the
           content; only the tab row outside the stage stays visible under an open panel. -->
      <MobileDock v-if="nav != null" :icon="nav.icon" :title="nav.title" :active="nav.active" @open="toggle('files')" />

      <MobileFilesPanel :open="layer === 'files'" :title="railTitle" @close="layer = null" />

      <!-- Only while nothing is open. An edge that opens the panel says nothing once the panel is up,
           and the strip went on painting over the scrim, which read as a rendering fault. -->
      <MobileEdgeGestures
        :left="nav != null && layer == null"
        :right="rightEdge != null && layer == null"
        @left="toggle('files')"
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

/* Anchors the panel and the edge strips: they cover the content they belong to (the dock included —
   it is a normal flex child here, not a sibling), and leave the tab row below them live. */
.mobile-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.mobile-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  /* The device's own status bar is above us and nothing is allowed to hide under it. */
  padding-top: env(safe-area-inset-top);
}
</style>
