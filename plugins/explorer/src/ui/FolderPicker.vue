<script setup lang="ts">
import { Row, TreeView, type TreeViewDraft, type TreeViewNode } from '@arxhub/uikit/core'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { computed, onMounted, ref } from 'vue'
import { folderLabel, nameProblem } from '../create-flow'
import type { TreeNode } from '../explorer-extension'
import { ExplorerExtension } from '../explorer-extension'
import { t } from '../i18n/messages'
import { useFileActions } from './use-file-actions'

// Where something goes: the vault's folders, the root as a row of its own, and one of them chosen. It walks
// the same listing the vault's tree holds, but opens and closes folders on its own — choosing a place must
// not rearrange the tree the owner left.
const props = defineProps<{
  // Where the picker starts and what it marks as "this document's folder". '' is the root.
  from: string
  // Opened to make a folder rather than to choose one (the Vault band's New folder): the name field is up
  // from the start.
  startDrafting?: boolean
}>()
const emit = defineEmits<{ created: [path: string] }>()
// '' is the root, like `from`; every other folder is its vault path.
const selected = defineModel<string>({ required: true })
// A new folder is being named in place: the confirm below the picker steps aside for its keyboard.
const drafting = defineModel<boolean>('drafting', { default: false })

const ROOT = ''
const explorer = useArxHub().extensions.get(ExplorerExtension)
const actions = useFileActions()

const key = (path: string) => path.replace(/^\/+/, '')

function mapNode(node: TreeNode): TreeViewNode<TreeNode | null> {
  const id = key(node.entry.pathname)
  return {
    id,
    label: folderLabel(id),
    icon: 'lu:folder',
    detail: id === props.from && id !== ROOT ? t('picker.documentFolder') : undefined,
    branch: node.entry.kind === 'dir',
    // A folder left in the cloud has no disk behind it to write into yet.
    disabled: node.pending,
    children: node.children?.map(mapNode),
    data: node,
  }
}

const nodes = computed<TreeViewNode<TreeNode | null>[]>(() => [
  {
    id: ROOT,
    label: t('vault'),
    icon: 'lu:folder',
    detail: t('picker.root'),
    branch: true,
    children: explorer.tree.value.map(mapNode),
    data: null,
  },
])

const expanded = ref<string[]>([ROOT])
const draft = ref<TreeViewDraft | null>(null)

function open(id: string): void {
  if (!expanded.value.includes(id)) expanded.value = [...expanded.value, id]
}

onMounted(() => {
  if (props.startDrafting) startDraft()
  actions.runAction(
    (async () => {
      if (explorer.tree.value.length === 0) await explorer.loadRoot()
      for (const folder of await explorer.loadFolderChain(props.from)) open(key(folder))
    })(),
    'list the folders',
    t('failed.listFolders'),
  )
})

function toggle(node: TreeViewNode<TreeNode | null>, next: boolean): void {
  // The root stays open: it is the one row every other folder hangs from, and tapping it to choose it
  // must not fold the whole picker away.
  if (!next && node.id === ROOT) return
  if (!next) {
    expanded.value = expanded.value.filter((id) => id !== node.id)
    return
  }
  open(node.id)
  if (node.data != null) actions.runAction(explorer.load(node.data), 'list the folder', t('failed.listFolder'))
}

function activate(node: TreeViewNode<TreeNode | null>): void {
  selected.value = node.id
}

function startDraft(): void {
  open(selected.value)
  draft.value = {
    parentId: selected.value,
    label: t('picker.folderName'),
    icon: 'lu:folder',
    placeholder: t('picker.folderName'),
    confirmLabel: t('picker.createFolder'),
  }
  drafting.value = true
}

function endDraft(): void {
  draft.value = null
  drafting.value = false
}

function commitDraft(name: string, parentId: string | null): void {
  const typed = name.trim()
  if (typed === '') return
  const problem = nameProblem(typed)
  if (problem != null) {
    toaster.create({ title: problem, type: 'error' })
    return
  }
  const parent = parentId == null || parentId === ROOT ? explorer.root : parentId
  actions.runAction(
    (async () => {
      const created = await explorer.createDir(parent, typed)
      open(parentId ?? ROOT)
      selected.value = key(created)
      endDraft()
      emit('created', created)
    })(),
    `create the folder ${typed}`,
    t('failed.createNamedFolder', { name: typed }),
  )
}
</script>

<template>
  <div class="folder-picker">
    <TreeView
      :nodes="nodes"
      mode="pick"
      :label="t('picker.label')"
      :selected-id="selected"
      :expanded-ids="expanded"
      :draft="draft"
      data-testid="folder-picker"
      @activate="activate"
      @toggle="toggle"
      @draft-commit="commitDraft"
      @draft-cancel="endDraft"
    />
    <Row
      v-if="draft == null"
      as="button"
      type="button"
      icon="lu:folder-plus"
      :label="t('picker.newFolderIn', { folder: folderLabel(selected) })"
      data-testid="folder-picker-new"
      @click="startDraft"
    />
  </div>
</template>

<style scoped>
.folder-picker {
  display: flex;
  flex-direction: column;
}
</style>
