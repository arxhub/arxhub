<script setup lang="ts">
import { APP_LAYER, useHotkeys } from '@arxhub/plugin-hotkeys/ui'
import { ActionMenuHost, ModalsProvider, Toaster } from '@arxhub/uikit/core'
import { provideShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { useHotkeysExtension, useOpenSheetKey } from '../hotkeys'
import { provideNavHost } from '../nav-host'
import TypeStage from '../TypeStage.vue'
import { useNavigation } from '../use-navigation'
import DesktopDock from './DesktopDock.vue'
import DesktopNavColumn from './DesktopNavColumn.vue'
import DesktopSearchSheet from './DesktopSearchSheet.vue'
import DesktopStatusBar from './DesktopStatusBar.vue'
import DesktopTypeRail from './DesktopTypeRail.vue'
import { navColumn } from './use-nav-column'

// The whole desktop frame, and the only place that says so: everything below reads the frame from
// injection rather than measuring the window.
//
// Both levels of navigation are visible at once: the types down the left, the active type's objects as
// the tab strip above the content. The phone shows the same two levels one at a time. One model, two
// layouts — so nothing collapses itself here: shrinking, and taking the levels in turns, are what a
// narrow screen forces, not what the model is.
provideShellFrame('desktop')

const { workspace, types, storage, status } = useNavigation()

const activeType = computed(() => {
  const id = workspace.activeTypeId.value
  return id == null ? null : (types.get(id) ?? null)
})

// The width and the collapsed state are remembered PER TYPE: the key is the type's own, and by default
// it is the type id. Two types naming one key share a width, which is what `widthKey` is for (F-15).
const column = computed(() => {
  const type = activeType.value
  if (type?.nav == null) return null
  return navColumn(storage, type.nav.widthKey ?? type.id)
})

// Creating lives in the navigation's own head — the vault tree's New file is that button. A type that
// declares `create` without declaring `nav` has no head to put it in, and the dock takes it instead: a
// declared role is never unreachable.
const dockCreate = computed(() => (activeType.value?.nav == null ? (activeType.value?.create ?? null) : null))

const hotkeys = useHotkeysExtension()

// The one control the frame contributes into the navigation's own strip. It is here rather than in a
// strip of the column's own, because a second band above the tree's would be two heads for one role.
// The chord in the label is drawn per platform rather than typed in: the sign used to be a hardcoded
// ⌘B, which was simply wrong on Linux and Windows.
provideNavHost({
  dismiss: () => column.value?.toggle(),
  icon: 'lu:panel-left-close',
  label: `Collapse navigation (${hotkeys.label('Mod-b')})`,
})

// Open or switch to, on ⌘K, from anywhere — including from inside a note.
const sheet = ref(false)
useOpenSheetKey(() => {
  sheet.value = true
})

// ⌘B in the `app` layer: the bottom of the stack, so it works everywhere nothing above has claimed it.
// The editors claim it in their own layer (F-06), which is what stops one keystroke from bolding the
// word AND collapsing the column — and a frame with no navigation column claims nothing at all, so the
// chord reaches the browser untouched instead of being swallowed for no result.
useHotkeys(hotkeys, [
  {
    id: 'shell.toggle-nav-column',
    chord: 'Mod-b',
    layer: APP_LAYER,
    title: 'Collapse navigation',
    when: () => column.value != null,
    run: () => column.value?.toggle(),
  },
])
</script>

<template>
  <div class="desktop-shell">
    <div class="middle">
      <DesktopTypeRail :row="workspace.row.value" @select="workspace.activateType($event)" @sheet="sheet = true" />

      <!-- The navigation column is not a tab: it is neither opened nor closed. A type that declares no
           navigation gets no column at all, and that is visible rather than hidden behind a
           placeholder. -->
      <DesktopNavColumn
        v-if="activeType?.nav != null && column != null"
        :nav="activeType.nav"
        :title="activeType.nav.title ?? activeType.title"
        :width="column.width.value"
        :collapsed="column.collapsed.value"
        @resize="column?.setWidth($event)"
        @toggle="column?.toggle()"
      />

      <div class="stage">
        <!-- No tab strip here, on purpose. Tabs belong to a GROUP, not to a type: split the panels and
             each half has its own set, so one strip above both would answer "which group do I
             activate" wrongly. The panel host draws them, one strip per group. -->
        <DesktopDock :component="workspace.dock()" :create="dockCreate" />

        <main class="content">
          <!-- Switching type is the row's basic operation, and it unmounts nothing: every type entered
               this session stays on its own stage and only the active one is shown (F-05). -->
          <TypeStage :workspace="workspace" :types="types" empty="Nothing is open. Pick a type on the left." />
        </main>
      </div>
    </div>

    <DesktopStatusBar :status="status" :workspace="workspace" />
    <DesktopSearchSheet :open="sheet" :workspace="workspace" :types="types" @close="sheet = false" />
    <Toaster />
  </div>
  <ModalsProvider />
  <ActionMenuHost />
</template>

<style scoped>
.desktop-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background-color: var(--gray-1);
  color: var(--gray-12);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
}

.middle {
  flex: 1;
  display: flex;
  min-height: 0;
}

.stage {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.content {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background-color: var(--gray-1);
}
</style>
