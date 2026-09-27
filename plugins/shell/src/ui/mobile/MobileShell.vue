<script setup lang="ts">
import { ActionMenuHost, ModalsProvider, Toaster } from '@arxhub/uikit/core'
import { provideShellFrame, useKeyboardInset } from '@arxhub/uikit/hooks'
import { computed, ref, watch } from 'vue'
import { t } from '../../i18n/messages'
import { useOpenSheetKey } from '../hotkeys'
import { provideNavHost } from '../nav-host'
import { secondTapOf } from '../second-tap'
import TypeStage from '../TypeStage.vue'
import { useNavigation } from '../use-navigation'
import MobileBackgroundBar from './MobileBackgroundBar.vue'
import MobileExitGuard from './MobileExitGuard.vue'
import MobileNavSheet from './MobileNavSheet.vue'
import MobileObjectBar from './MobileObjectBar.vue'
import MobilePartsSheet from './MobilePartsSheet.vue'
import MobileSearchSheet from './MobileSearchSheet.vue'
import MobileTypeRow from './MobileTypeRow.vue'
import MobileTypeSheet from './MobileTypeSheet.vue'

// The whole mobile frame, and the only place that says so: everything below reads the frame from
// injection rather than measuring the window.
//
// The same two levels the desktop shows side by side, shown one at a time: the types along the bottom,
// and what is open inside the active one behind a second tap on it. There are no edge gestures: a road
// nobody can see is a road only the person who built it knows about.
provideShellFrame('mobile')

const { workspace, types, status } = useNavigation()

// The frame gives up the height the keyboard takes instead of letting it cover the bottom of the app.
// Everything that can be operated is down there, so this is the difference between typing blind and
// seeing what you type. While it is up the type row goes away and the band becomes the editor's.
const keyboardInset = useKeyboardInset()
const typing = computed(() => keyboardInset.value > 0)

// One layer at a time: opening the second would bury the first, and back would then have to unwind two
// things the owner only opened once. `nav` is the one exception in spirit — it is reached FROM `second`,
// and replaces it rather than stacking on it.
type Layer = 'second' | 'nav' | 'parts' | 'more'
const layer = ref<Layer | null>(null)

const activeType = computed(() => {
  const id = workspace.activeTypeId.value
  return id == null ? null : (types.get(id) ?? null)
})

const bar = computed(() => workspace.bar())

// Switching type closes the layer: it belonged to the previous type, and leaving it up would mean
// showing the vault over the settings sections.
watch(
  () => workspace.activeTypeId.value,
  () => {
    layer.value = null
  },
)

// Inside a sheet the frame's control over a navigation means "put the sheet away" — and so does a
// destination being chosen in it, which is what a navigation already announces on the desktop.
provideNavHost({
  dismiss: () => (layer.value = null),
  navigated: () => (layer.value = null),
  revealActive: true,
  icon: 'lu:x',
  // A getter, so the label follows a language switch: the host is provided once, read on every render.
  get label() {
    return t('nav.close')
  },
})

function toggle(which: Layer): void {
  layer.value = layer.value === which ? null : which
}

function again(): void {
  const type = activeType.value
  if (type != null && secondTapOf(type) != null) toggle('second')
}

// A phone rarely has a keyboard, but when one is attached the chord has to mean the same thing it means
// on the desktop: there is one open-or-switch-to operation, not one per frame.
useOpenSheetKey(() => {
  layer.value = 'more'
})
</script>

<template>
  <div class="mobile-shell" :style="{ paddingBottom: keyboardInset ? `${keyboardInset}px` : undefined }">
    <!-- No app bar. The top of the screen is content, and nothing up there can be pressed: a phone held
         in one hand does not reach it. -->
    <main class="mobile-content">
      <!-- Switching type is the most frequent operation on this frame, and it must not unmount what is
           open: a return to Documents would otherwise be a freshly mounted editor — scroll at the top,
           undo history gone, selection lost (F-05). -->
      <TypeStage :workspace="workspace" :types="types" :hint="t('stage.pickMobile')" />
    </main>

    <!-- Three bands from the bottom up: the type row (not while typing), the object's band (only if its
         type describes one) and the background line (only while something is running). Not one of them
         appears just in case. -->
    <MobileBackgroundBar :status="status" :workspace="workspace" />
    <MobileObjectBar v-if="bar != null && !(typing && bar.editing == null)" :bar="bar" :typing="typing" :parts-open="layer === 'parts'" @parts="toggle('parts')" />
    <MobileTypeRow
      v-show="!typing"
      :row="workspace.row.value"
      :more-open="layer === 'more'"
      @select="workspace.activateType($event)"
      @again="again"
      @more="toggle('more')"
    />
    <Toaster />
  </div>

  <MobileTypeSheet :open="layer === 'second'" :type="activeType" :workspace="workspace" @close="layer = null" @browse="layer = 'nav'" />
  <MobileNavSheet :open="layer === 'nav'" :type="activeType" @close="layer = null" />
  <MobilePartsSheet :open="layer === 'parts'" :bar="bar" @close="layer = null" />
  <MobileSearchSheet :open="layer === 'more'" :workspace="workspace" :types="types" :status="status" @close="layer = null" />
  <ModalsProvider />
  <MobileExitGuard />
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

.mobile-content {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  /* The device's own status bar is above us and nothing is allowed to hide under it. */
  padding-top: env(safe-area-inset-top);
}
</style>
