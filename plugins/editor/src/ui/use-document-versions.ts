import { formatDate } from '@arxhub/i18n'
import { DiffExtension, type DiffResult } from '@arxhub/plugin-diff'
import { type DiffPart, useDiffController } from '@arxhub/plugin-diff/ui'
import { useArxHub } from '@arxhub/uikit/hooks'
import type { Node } from 'prosemirror-model'
import { computed, ref, shallowRef, watch } from 'vue'
import { arxDiffNodes } from '../arx-diff'
import type { ArxHistoryStore, ArxSavedVersion } from '../document-history'
import type { ArxEditorKit } from '../editor-extension'
import { deserialize, serialize } from '../editor-format'
import type { EditorMode } from '../editor-mode'
import { reasonText } from '../errors'
import { t } from '../i18n/messages'

export interface DocumentVersionsProps {
  store: ArxHistoryStore
  documentId: string
  kit: ArxEditorKit
  mode: EditorMode
  current: Node
  // The live buffer's document is not reactive on its own; this bumps with every transaction.
  revision: number
  path: string
  title: string
  restore: (content: string, block?: string) => Promise<void>
}

const messageOf = reasonText

function versionName(versions: readonly ArxSavedVersion[], version: ArxSavedVersion): string {
  return t('versions.version', { number: versions.length - versions.indexOf(version) })
}

function versionTime(version: ArxSavedVersion): string {
  return formatDate(version.savedAt, { dateStyle: 'medium', timeStyle: 'medium' })
}

export function versionLabel(versions: readonly ArxSavedVersion[], version: ArxSavedVersion): string {
  return `${versionName(versions, version)} · ${versionTime(version)}`
}

// The saved versions of the open document against its live buffer: the list, the version being read, and the
// diff of it — shared by both frames' pages.
export function useDocumentVersions(props: DocumentVersionsProps, close: () => void) {
  const extensions = useArxHub().extensions
  const diffExtension = extensions.has(DiffExtension) ? extensions.get(DiffExtension) : null

  const versions = ref<ArxSavedVersion[]>([])
  const selected = ref<ArxSavedVersion | null>(null)
  const raw = ref('')
  const previous = shallowRef<Node | null>(null)
  const loading = ref(false)
  const reading = ref(false)
  const restoring = ref(false)
  const error = ref('')
  const previewError = ref('')
  const refreshTick = ref(0)

  const result = computed((): DiffResult | null => {
    void props.revision
    const before = previous.value
    const version = selected.value
    if (before == null || version == null) return null
    const after = props.current
    const saved = raw.value
    let source: ReturnType<DiffResult['source']> | undefined
    return {
      pathname: props.path,
      leftLabel: versionLabel(versions.value, version),
      rightLabel: t('versions.current'),
      differ: 'arx',
      model: arxDiffNodes(before, after),
      source: () => {
        if (source === undefined) source = diffExtension?.text(saved, serialize(after, props.kit.format)) ?? null
        return source
      },
    }
  })
  const controller = useDiffController(() => result.value)

  const parts = computed((): DiffPart[] =>
    versions.value.map((version) => ({
      id: version.id,
      label: versionName(versions.value, version),
      meta: versionTime(version),
      icon: 'lu:history',
    })),
  )

  // A restore works on a top-level block: a stop inside a container carries its top-level block's key.
  const blockStop = computed(() => {
    const stop = controller.currentStop.value
    return stop?.ref != null ? stop : null
  })
  const blockLabel = computed(() => (blockStop.value?.change === 'added' ? t('versions.removeAdded') : t('versions.restoreBlock')))
  const canRestore = computed(
    () => !restoring.value && !reading.value && raw.value !== '' && previewError.value === '' && props.mode === 'editable',
  )

  watch(
    [() => props.documentId, refreshTick],
    async (_, __, cleanup) => {
      let active = true
      cleanup(() => {
        active = false
      })
      loading.value = true
      error.value = ''
      try {
        const rows = await props.store.list(props.documentId)
        if (active) {
          versions.value = rows
          selected.value = rows.find((row) => row.id === selected.value?.id) ?? rows[0] ?? null
        }
      } catch (reason) {
        if (active) error.value = messageOf(reason)
      } finally {
        if (active) loading.value = false
      }
    },
    { immediate: true },
  )

  // A listed version can be superseded between listing and reading (a save landing as the page opens moves the
  // history on); re-reading the list once is the honest answer, a second failure is reported.
  const relisted = new Set<string>()

  watch(selected, async (version, _, cleanup) => {
    let active = true
    cleanup(() => {
      active = false
    })
    raw.value = ''
    previous.value = null
    previewError.value = ''
    if (!version) return
    reading.value = true
    try {
      const stored = await props.store.read(props.documentId, version)
      if (!active) return
      raw.value = stored.content
      previous.value = deserialize(props.kit.schema, stored.content, props.kit.format)
    } catch (reason) {
      if (!active) return
      if (!relisted.has(version.id)) {
        relisted.add(version.id)
        refreshTick.value++
        return
      }
      previewError.value = messageOf(reason)
    } finally {
      if (active) reading.value = false
    }
  })

  function select(id: string): void {
    const version = versions.value.find((row) => row.id === id)
    if (version != null) selected.value = version
  }

  function refresh(): void {
    refreshTick.value++
  }

  async function restore(block?: string): Promise<void> {
    if (!canRestore.value) return
    restoring.value = true
    error.value = ''
    try {
      await props.restore(raw.value, block)
      close()
    } catch (reason) {
      error.value = messageOf(reason)
    } finally {
      restoring.value = false
    }
  }

  function restoreBlock(): Promise<void> {
    const key = blockStop.value?.ref
    return key == null ? Promise.resolve() : restore(key)
  }

  return {
    versions,
    selected,
    loading,
    reading,
    restoring,
    error,
    previewError,
    result,
    controller,
    parts,
    blockStop,
    blockLabel,
    canRestore,
    select,
    refresh,
    restore,
    restoreBlock,
  }
}

export type DocumentVersionsState = ReturnType<typeof useDocumentVersions>
