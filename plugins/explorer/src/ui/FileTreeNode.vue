<script setup lang="ts">
import { basename, dirname } from '@arxhub/path'
import { actionMenu, Icon, Input, Row } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, nextTick, ref, watch } from 'vue'
import { ExplorerExtension, type TreeNode } from '../explorer-extension'
import { useFileActions } from './use-file-actions'
import { treeRowId } from './use-tree-navigation'

const props = withDefaults(defineProps<{ node: TreeNode; depth?: number }>(), { depth: 0 })

// Which kind of thing a row is, at a glance. Without this a folder and a note differ only by the
// presence of a chevron, which is 16px of empty space on every leaf row — you have to read the
// extension to know what you are looking at.
//
// TODO(06-explorer F-12): this mapping belongs in a swappable icon set, not in the tree. The pack
// layer already exists (`registerIconPack` in uikit); what is hardcoded here is the *matching* rule,
// so an icon for a new file type means editing this component. Extract it the way themes were —
// a registry a set registers into, chosen from Appearance — and add matching by exact filename and
// by folder name while doing it.
const PROSE = new Set(['md', 'markdown', 'txt', 'arx'])
const CODE = new Set(['ts', 'tsx', 'js', 'jsx', 'vue', 'json', 'css', 'html', 'sh', 'py', 'rs', 'go', 'toml', 'yml', 'yaml', 'sql'])
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'])

const typeIcon = computed((): string => {
  if (props.node.entry.kind === 'dir') return props.node.expanded ? 'lu:folder-open' : 'lu:folder'
  // A file this device left in the cloud (23-storage-model F-06) reads as a file that happens to be
  // elsewhere, not as a different kind of thing — the cloud glyph replaces the type glyph rather than
  // sitting beside it.
  if (props.node.pending) return 'lu:cloud'
  const ext = basename(props.node.entry.pathname).split('.').pop()?.toLowerCase() ?? ''
  if (PROSE.has(ext)) return 'lu:file-text'
  if (CODE.has(ext)) return 'lu:file-code'
  if (IMAGE.has(ext)) return 'lu:file-image'
  return 'lu:file'
})

const iconSize = useShellFrame() === 'mobile' ? 16 : 14
const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const actions = useFileActions()

function onContextMenu(event: MouseEvent) {
  actionMenu.open(actions.getNodeActions(props.node), {
    x: event.clientX,
    y: event.clientY,
    title: basename(props.node.entry.pathname),
  })
}

// ── inline rename (shared state: only one node renames at a time) ───────────────
const renaming = computed(() => explorer.renamingPath.value === props.node.entry.pathname)
const renameValue = ref('')
// A wrapper ref rather than one on <Input> itself: the ref would be the component instance, and
// reaching through it for the native element it renders needs a cast that strict mode has no honest
// form for (same trade the search rail's own input ref makes).
const renameWrap = ref<HTMLElement | null>(null)

watch(renaming, async (active) => {
  if (!active) return
  renameValue.value = basename(props.node.entry.pathname)
  await nextTick()
  renameWrap.value?.querySelector('input')?.select()
})

function commitRename() {
  if (!renaming.value) return
  const newName = renameValue.value.trim()
  explorer.renamingPath.value = null
  if (newName && newName !== basename(props.node.entry.pathname)) {
    actions.runAction(explorer.renameEntry(props.node.entry.pathname, newName), `rename to ${newName}`)
  }
}

function cancelRename() {
  explorer.renamingPath.value = null
}

// ── click / expand ────────────────────────────────────────────────────────────
async function handleClick() {
  if (renaming.value) return
  // selectedPath always points to a directory so the toolbar knows where to create
  explorer.selectedPath.value = props.node.entry.kind === 'dir' ? props.node.entry.pathname : dirname(props.node.entry.pathname)
  if (props.node.entry.kind === 'dir') {
    if (props.node.expanded) {
      explorer.collapse(props.node)
    } else {
      await explorer.expand(props.node)
    }
  } else {
    actions.openFile(props.node)
  }
}

function handleEnter() {
  if (renaming.value) return
  if (props.node.entry.kind === 'file') actions.openFile(props.node)
  else handleClick()
}

// ── roving tabindex ───────────────────────────────────────────────────────────
// Only the row `explorer.focusedPath` names is a Tab stop; every other row is -1, so the tree is one
// stop from outside and useTreeNavigation's Up/Down/Left/Right/Home/End move real DOM focus among them.
const focused = computed(() => explorer.focusedPath.value === props.node.entry.pathname)

// Fires whenever this row's own div receives DOM focus — a click (divs with tabindex focus on click),
// Tab landing on the current stop, or useTreeNavigation's own `.focus()` calls — so `focusedPath` stays
// in sync with reality regardless of how focus arrived. `focus` does not bubble, so the rename <input>
// this row hosts never triggers it.
function handleFocus() {
  explorer.focusedPath.value = props.node.entry.pathname
}
</script>

<template>
  <Row
    :id="treeRowId(node.entry.pathname)"
    class="tree-node"
    :selected="explorer.selectedPath.value === node.entry.pathname"
    :depth="depth"
    :data-path="node.entry.pathname"
    role="treeitem"
    :aria-label="basename(node.entry.pathname)"
    :aria-level="depth + 1"
    :aria-selected="explorer.selectedPath.value === node.entry.pathname"
    :aria-expanded="node.entry.kind === 'dir' ? node.expanded : undefined"
    :aria-description="node.pending ? 'On the server — opens on demand' : undefined"
    :title="node.pending ? 'On the server — opens on demand' : undefined"
    :tabindex="focused ? 0 : -1"
    @click="handleClick"
    @contextmenu.prevent.stop="onContextMenu"
    @focus="handleFocus"
    @keydown.f2.prevent.stop="actions.startRename(node)"
    @keydown.enter.prevent="handleEnter"
  >
    <span class="chevron">
      <Icon v-if="node.entry.kind === 'dir'" :name="node.expanded ? 'lu:chevron-down' : 'lu:chevron-right'" :size="iconSize" />
    </span>
    <span class="type-glyph">
      <Icon :name="typeIcon" :size="iconSize" />
    </span>

    <span v-if="renaming" ref="renameWrap" class="rename-wrap">
      <Input
        v-model="renameValue"
        aria-label="New name"
        @keydown.enter.prevent.stop="commitRename"
        @keydown.escape.prevent.stop="cancelRename"
        @blur="commitRename"
        @click.stop
      />
    </span>
    <span v-else class="name">{{ basename(node.entry.pathname) || node.entry.pathname }}</span>
  </Row>

  <template v-if="node.expanded && node.children">
    <FileTreeNode
      v-for="child in node.children"
      :key="child.entry.pathname"
      :node="child"
      :depth="depth + 1"
    />
  </template>
</template>

<style scoped>
.tree-node {
  gap: 4px;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
}


/* The selected row is the one place in the tree that spends the accent — a wash and accent text,
   so it stays legible against a plain hover fill on the row above it. */


.chevron,
.type-glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--size-xs-half);
  flex-shrink: 0;
  color: var(--gray-10);
}

/* The glyph follows the row's own colour when selected, so a selected row reads as one object rather
   than as accent text next to a grey icon. */
.tree-node.selected .type-glyph,
.tree-node.selected .chevron {
  color: var(--accent-11);
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* The input itself owns its geometry (Control role, 32px, --radius-sm, the shared focus-visible ring)
   — this wrapper only takes the row's slack the way the name span it replaces does. */
.rename-wrap {
  flex: 1;
  min-width: 0;
}
</style>
