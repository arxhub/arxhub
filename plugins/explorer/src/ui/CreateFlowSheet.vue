<script setup lang="ts">
import { DOCUMENTS_TYPE_ID } from '@arxhub/plugin-documents'
import { ShellExtension } from '@arxhub/plugin-shell'
import { BottomSheet, Button, Field, IconButton, Input, modals, Row } from '@arxhub/uikit/core'
import { toaster, useArxHub } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { type CreateKind, capitalize, createKinds, fileNameFor, folderLabel, nameProblem, uploadLabel } from '../create-flow'
import { ExplorerExtension } from '../explorer-extension'
import { describeImport, type ImportSource } from '../import-files'
import FolderPicker from './FolderPicker.vue'
import { pickFiles } from './pick-files'
import { useFileActions } from './use-file-actions'

// The phone's New, in three steps: what (a document, another registered format, or files from the phone)
// → where (a folder, the open document's own by default) → confirm at the bottom, under the thumb. What it
// makes opens as a new tab. One sheet whose header and height change with the step, so back from "where"
// is a step back rather than a second layer closing.
// `files` skips the first step: they were already picked (the band's Add files…), from the tap itself.
// `folderOnly` is the Vault band's New folder: the same picker, opened with its name field up, and done
// once the folder exists — there is nothing to open after it.
const props = withDefaults(defineProps<{ modalId: string; folder?: string; files?: ImportSource[]; folderOnly?: boolean }>(), {
  folder: '',
  files: () => [],
  folderOnly: false,
})

const arxhub = useArxHub()
const explorer = arxhub.extensions.get(ExplorerExtension)
const shell = arxhub.extensions.get(ShellExtension)
const actions = useFileActions()

const kinds = computed(() => createKinds(explorer.fileTemplates.value))
const open = ref(true)
const kind = ref<CreateKind | null>(null)
const files = ref<ImportSource[]>(props.files)
const where = ref(props.folder)
const drafting = ref(false)
const name = ref('')
const busy = ref(false)
const step = computed<'what' | 'where'>(() => (props.folderOnly || kind.value != null || files.value.length > 0 ? 'where' : 'what'))
const title = computed(() => {
  if (props.folderOnly) return 'New folder'
  if (step.value === 'what') return 'Create'
  return `Where · ${kind.value != null ? capitalize(kind.value.noun) : 'Upload'}`
})

function close(): void {
  open.value = false
  modals.close(props.modalId)
}

function back(): void {
  if (props.folderOnly) {
    close()
    return
  }
  kind.value = null
  files.value = []
  drafting.value = false
}

function choose(next: CreateKind): void {
  kind.value = next
  // Filled in rather than left as a placeholder: the confirm names a real file, and the field shows it.
  name.value = 'Untitled'
}

// The system's own chooser comes first, straight from the tap — a browser opens it only from inside a
// user gesture (pick-files.ts). Nothing picked leaves the flow where it was.
function upload(): void {
  actions.runAction(
    pickFiles().then((picked) => {
      if (picked.length > 0) files.value = picked
    }),
    'pick the files',
  )
}

const target = computed(() => (where.value === '' ? explorer.root : where.value))

async function openAll(paths: readonly string[]): Promise<void> {
  for (const path of paths) await shell.workspace.openObject(DOCUMENTS_TYPE_ID, { id: path })
}

const problem = computed(() => (kind.value == null ? null : nameProblem(name.value)))

function confirm(): void {
  if (busy.value || problem.value != null) return
  busy.value = true
  const made = kind.value
  const work =
    made != null
      ? explorer.createFile(target.value, fileNameFor(name.value, made.extension)).then((path) => openAll([path]))
      : explorer.importFiles(target.value, files.value).then(async (added) => {
          toaster.create({ ...describeImport(added), type: 'success' })
          await openAll(added.map((file) => file.path))
        })
  const done = work.then(close).finally(() => {
    busy.value = false
  })
  actions.runAction(done, made != null ? `create the ${made.noun}` : 'add the files')
}

const confirmLabel = computed(() =>
  kind.value != null ? `Create ${kind.value.noun} in «${folderLabel(where.value)}»` : uploadLabel(files.value.length, where.value),
)
const picked = computed(() => files.value.map((file) => file.name).join(', '))
</script>

<template>
  <BottomSheet :open="open" :title="title" :variant="step === 'where' ? 'full' : 'auto'" footer-inset @close="close">
    <template v-if="step === 'where'" #leading>
      <IconButton size="xl" icon="lu:chevron-left" aria-label="Back" data-testid="create-back" @click="back" />
    </template>

    <template v-if="step === 'what'">
      <Row
        v-for="option in kinds"
        :key="option.extension"
        as="button"
        type="button"
        :icon="option.icon"
        :label="capitalize(option.noun)"
        :detail="option.hint"
        next
        :data-testid="`create-kind:${option.extension}`"
        @click="choose(option)"
      />
      <Row
        as="button"
        type="button"
        icon="lu:file-up"
        label="Upload from phone"
        detail="Photos, PDFs, any files"
        next
        data-testid="create-kind:upload"
        @click="upload"
      />
    </template>
    <FolderPicker v-else v-model="where" v-model:drafting="drafting" :from="props.folder" :start-drafting="props.folderOnly" @created="props.folderOnly && close()" />

    <template v-if="step === 'where' && !drafting && !props.folderOnly" #footer>
      <Field v-if="kind != null" label="Name" for="create-name" :error="problem">
        <Input id="create-name" v-model="name" placeholder="Untitled" data-testid="create-name" @keydown.enter.prevent="confirm" />
      </Field>
      <Row v-else icon="lu:file-up" :label="picked" :detail="files.length === 1 ? '1 file' : `${files.length} files`" plain wrap />
      <Button block :disabled="busy || problem != null" data-testid="create-confirm" @click="confirm">{{ confirmLabel }}</Button>
    </template>
  </BottomSheet>
</template>

