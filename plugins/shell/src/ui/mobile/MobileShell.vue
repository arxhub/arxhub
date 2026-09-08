<script setup lang="ts">
import { ActionMenuHost, ModalsProvider, Toaster } from '@arxhub/uikit/core'
import { provideShellFrame, useKeyboardInset } from '@arxhub/uikit/hooks'
import { computed, ref, watch } from 'vue'
import { provideNavHost } from '../nav-host'
import { isObjectType } from '../tab-type'
import { useNavigation } from '../use-navigation'
import { useShell } from '../use-shell'
import MobileBackgroundBar from './MobileBackgroundBar.vue'
import MobileDock from './MobileDock.vue'
import MobileEdgeGestures from './MobileEdgeGestures.vue'
import MobileMoreSheet from './MobileMoreSheet.vue'
import MobileNavPanel from './MobileNavPanel.vue'
import MobileOpenLayer from './MobileOpenLayer.vue'
import MobileTypeRow from './MobileTypeRow.vue'
import { railClaim } from './rail-host'

// The whole mobile frame, and the only place that says so: everything below reads the frame from
// injection rather than measuring the window.
//
// The same two levels the desktop shows side by side, shown one at a time: the types along the bottom,
// and what is open inside the active one behind a second tap on it.
provideShellFrame('mobile')

const { workspace, types, status } = useNavigation()
const { sidebarItems, activeId, footerLeft, footerRight, setActive } = useShell()

// The frame gives up the height the keyboard takes instead of letting it cover the bottom of the app.
// Everything that can be operated is down there, so this is the difference between typing blind and
// seeing what you type.
const keyboardInset = useKeyboardInset()

// One layer at a time: opening the second would bury the first, and back would then have to unwind two
// things the owner only opened once.
type Layer = 'nav' | 'open' | 'more'
const layer = ref<Layer | null>(null)

const activeType = computed(() => {
  const id = workspace.activeTypeId.value
  return id == null ? null : (types.get(id) ?? null)
})

const panels = computed(() => {
  const id = workspace.activeTypeId.value
  return id == null ? null : (workspace.panelsOf(id) ?? null)
})
const content = computed(() => {
  const type = activeType.value
  return type != null && !isObjectType(type) ? type.content : null
})

// What the navigation panel would hold, and therefore whether the key that opens it exists at all. Two
// sources: the active type's own `nav` role, and — until the last mini-app becomes a type — a rail
// teleported into the panel by `MiniAppShell`. A key in front of an empty panel is worse than no key.
const nav = computed(() => activeType.value?.nav ?? null)
const navTitle = computed(() => {
  if (nav.value != null) return nav.value.title ?? activeType.value?.title ?? 'Navigation'
  const claim = railClaim.value
  return claim == null ? null : (claim.title ?? activeType.value?.title ?? 'Navigation')
})

// Only a type that declared the "what is open" role has a second level; for the rest there is nothing
// to open and the gesture leads nowhere.
const hasOpen = computed(() => activeType.value?.open != null)

// Switching type closes the layer: it belonged to the previous type, and leaving it up would mean
// showing the note tree over the settings sections.
watch(
  () => workspace.activeTypeId.value,
  () => {
    layer.value = null
  },
)

// The frame's own control over the active type's navigation, contributed into the navigation's own
// strip rather than drawn in a second band above it. On this frame it means "put the panel away"; on
// the desktop the same control collapses the column.
provideNavHost({ dismiss: () => (layer.value = null), icon: 'lu:x', label: 'Close navigation' })

function toggle(which: Layer): void {
  layer.value = layer.value === which ? null : which
}

function openNav(): void {
  if (navTitle.value != null) toggle('nav')
}

function openWhatsOpen(): void {
  if (hasOpen.value) layer.value = 'open'
}

// What the desktop frame keeps permanently in the status bar. On a phone it is worth a look, not a
// reserved strip, so it lives at the top of the sheet behind the row's own immobile key.
const statusItems = computed(() => [...footerLeft.value, ...footerRight.value, ...status.statuses.value, ...status.actions.value])
</script>

<template>
  <div class="mobile-shell" :style="{ paddingBottom: keyboardInset ? `${keyboardInset}px` : undefined }">
    <!-- No app bar. The top of the screen is content, and the title it would have shown is either in
         the note itself or on the key that opened it. -->
    <div class="mobile-stage">
      <main class="mobile-content">
        <!-- Switching type is the most frequent operation on this frame, and it must not unmount what
             is open: a return to Notes would otherwise be a freshly mounted editor — scroll at the
             top, undo history gone, selection lost (F-05). -->
        <KeepAlive>
          <component :is="panels.view" v-if="panels != null" :key="`objects:${workspace.activeTypeId.value}`" />
          <component :is="content" v-else-if="content != null" :key="`content:${workspace.activeTypeId.value}`" />
        </KeepAlive>
        <p v-if="panels == null && content == null" class="nothing">Nothing is open. Pick a type in the row below.</p>
      </main>

      <!-- Three bands from the bottom up: the background line (only while something is running), the
           dock of the active tab (only if the type declared one) and the type row. Not one of them
           appears just in case. -->
      <MobileBackgroundBar :status="status" :workspace="workspace" />
      <MobileDock
        :component="workspace.dock()"
        :nav-title="navTitle"
        :create="navTitle == null ? (activeType?.create ?? null) : null"
        @nav="openNav"
      />

      <MobileNavPanel :open="layer === 'nav'" :title="navTitle ?? 'Navigation'" :nav="nav?.component ?? null" @close="layer = null" />

      <!-- Only while nothing is open. An edge that opens the panel says nothing once the panel is up,
           and the strip went on painting over the scrim, which read as a rendering fault. -->
      <MobileEdgeGestures
        :left="navTitle != null && layer == null"
        :right="hasOpen && layer == null"
        @left="openNav"
        @right="openWhatsOpen"
      />
    </div>

    <MobileTypeRow
      :row="workspace.row.value"
      :more-active="layer === 'more'"
      @select="workspace.activateType($event)"
      @peek="toggle('open')"
      @more="toggle('more')"
    />
    <Toaster />
  </div>

  <MobileOpenLayer :open="layer === 'open'" :type="activeType" :workspace="workspace" @close="layer = null" />
  <MobileMoreSheet
    :open="layer === 'more'"
    :items="sidebarItems"
    :active-id="activeId"
    :status="statusItems"
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
   it is a normal flex child here, not a sibling), and leave the type row below them live. */
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

.nothing {
  margin: 0;
  padding: 24px 16px;
  color: var(--gray-10);
  text-align: center;
}
</style>
