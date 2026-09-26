import { PluginConfig } from '@arxhub/config'
import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { RepositoryExtension } from '@arxhub/plugin-repository'
import { SettingsExtension } from '@arxhub/plugin-settings'
import { type ObjectBar, type ObjectGone, type ObjectRef, type OpenedObject, objectGone, ShellExtension } from '@arxhub/plugin-shell'
import { RootVfs, VaultVfs, VaultWatcher } from '@arxhub/vfs'
import { markRaw } from 'vue'
import { DOCUMENTS_SETTINGS_SECTION, DocumentsConfigSchema, toHideKnownExtensions } from './documents-config'
import { DocumentsExtension } from './documents-extension'
import { blockAnchorOf, DOCUMENTS_TYPE_ID, documentSnapshotPath, folderOf } from './documents-type'
import { manifest } from './manifest'
import { migrateHomeFolders } from './notes-migration'
import DocumentsNav from './ui/DocumentsNav.vue'
import DocumentUnsupported from './ui/DocumentUnsupported.vue'
import { documentActions } from './ui/document-actions'

export interface DocumentsPluginArgs extends PluginArgs {
  // Where documents live in the vault. The instance decides — it is what knows how the vault is mounted.
  root?: string
}

// The tree and search both open Documents objects through Workspace, so a document has one live buffer.
export class DocumentsPlugin extends Plugin {
  private readonly root: string
  private unwatch: (() => void) | null = null
  private unwatchConfig: (() => void) | null = null
  private unregisterMaterialize: (() => void) | null = null
  private bringUp: Promise<void> | null = null
  private stopping = false
  // Cleared when config.watch delivers a save while boot tryRead is still in flight (TH-24-01).
  private bootConfigPending = true

  constructor(args: DocumentsPluginArgs) {
    super(args, manifest)
    this.root = args.root ?? '/'
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(DocumentsExtension, () => ({ vfs: ctx.services.get(VaultVfs), root: this.root }))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const documents = ctx.extensions.get(DocumentsExtension)
    const shell = ctx.extensions.get(ShellExtension)

    // OR-03: how files are named is the type's own setting — every surface that shows a name reads
    // `DocumentsExtension.displayName`, so the switch belongs beside it rather than in whichever surface
    // happened to need it first.
    const config = ctx.services.get(PluginConfig)
    ctx.extensions.get(SettingsExtension).register({
      id: DOCUMENTS_SETTINGS_SECTION,
      title: 'Documents',
      icon: 'lu:file-text',
      order: 13,
      schema: DocumentsConfigSchema,
      config,
    })
    // Applies live, the same way Sync's own applyConfig does: a saved change reaches the tree and the
    // open document with no restart, through the one PluginConfig.watch this section's Save writes
    // through.
    this.unwatchConfig = config.watch(DocumentsConfigSchema, (cfg) => {
      this.bootConfigPending = false
      documents.hideKnownExtensions.value = toHideKnownExtensions(cfg)
    })

    // Open an object. Checking "is it already open" neither is needed nor belongs here: that check
    // lives in one place, in `Workspace.openObject`. An object always comes back from here — with the
    // same key for the same path, which is what the de-duplication rests on.
    const open = async (ref: ObjectRef): Promise<OpenedObject> => {
      const path = String(ref.id)
      const viewer = documents.viewerFor(path)
      await documents.prepare(path, viewer)
      const anchor = blockAnchorOf(ref.at)

      // The note is already open — then the mounted editor's props cannot be changed and the place has
      // to be shown directly. A miss is deliberately silent: nothing was found, so the reader simply
      // stays at the top of the note instead of being told about something they did not ask for.
      if (anchor != null) documents.reveal(path, anchor)

      return {
        key: path,
        title: documents.displayName(path).text,
        component: viewer?.component ?? markRaw(DocumentUnsupported),
        // The same address as a prop — for the case where the note is NOT open yet: the editor mounts
        // and shows the place itself. Two roads to one thing, because there are two states: a live
        // editor and one that does not exist yet.
        props: { path, ...(viewer != null && anchor != null ? { anchor } : {}) },
        snapshot: () => ({ path }),
        beforeClose: () => documents.beforeClose(path),
      }
    }

    const createDocument = async (): Promise<void> => {
      const path = await documents.createDocument()
      if (path != null) await shell.workspace.openObject(DOCUMENTS_TYPE_ID, { id: path })
    }

    shell.types.register({
      id: DOCUMENTS_TYPE_ID,
      icon: 'lu:folder',
      title: 'Documents',
      order: 0,
      objects: {
        icon: 'lu:file-text',
        open,
        // The object may be gone by now: the file was renamed, or deleted from another device. Then
        // `objectGone` — and the tab stays, marked, instead of disappearing silently.
        revive: async (snapshot): Promise<OpenedObject | ObjectGone> => {
          const path = documentSnapshotPath(snapshot)
          if (path == null) return objectGone
          if (!(await documents.stillThere(path))) return objectGone
          return open({ id: path })
        },
        label: (object) => {
          const path = typeof object.props.path === 'string' ? object.props.path : object.key
          // The path as a second line — what tells one "Contract.md" from another. At the root there
          // is no second line: it would repeat the first.
          return { title: object.title, subtitle: folderOf(path) ?? undefined, icon: documents.iconFor(path) }
        },
      },
      nav: { component: markRaw(DocumentsNav), title: 'Vault', detail: 'All documents · search' },
      create: { title: 'New note', icon: 'lu:file-plus', run: createDocument },
      open: { title: 'Open documents' },
      find: () => {
        const finder = documents.finder.value
        return finder == null ? null : { placeholder: 'Find a document…', results: finder.results }
      },
      // The band above the phone's type row: where you are, New and Close are the type's; the open viewer
      // adds its own tools after Rename and Close, its parts and its editing toolbar (`registerViewBar`).
      bar: (active): ObjectBar => {
        const path = active == null ? null : typeof active.props.path === 'string' ? active.props.path : active.key
        // New starts where you are: in the open document's folder, or the root while nothing is open.
        const folder = path == null ? null : folderOf(path)
        const flow = documents.createFlow.value
        const create = {
          id: 'documents.new',
          label: 'New document',
          icon: 'lu:plus',
          onSelect: () => (flow != null ? flow.start(folder) : void createDocument()),
        }
        if (active == null || path == null) return { icon: 'lu:folder', name: 'Vault', actions: [create], menu: flow?.menu?.(null) ?? [] }
        const view = documents.viewBar(path)
        const own = documentActions(documents, shell.workspace, this.logger, path, active.key)
        return {
          icon: view?.icon ?? 'lu:file-text',
          name: shell.workspace.activeTab(DOCUMENTS_TYPE_ID)?.title ?? active.title,
          sub: view?.sub,
          parts: view?.parts,
          editing: view?.editing,
          actions: [create, ...(view?.actions ?? [])],
          menu: [own.rename, own.close, ...(view?.menu ?? []), own.remove],
        }
      },
    })
  }

  override start(ctx: PluginContext): Promise<void> {
    const shell = ctx.extensions.get(ShellExtension)
    const documents = ctx.extensions.get(DocumentsExtension)
    const repository = ctx.extensions.get(RepositoryExtension)
    // start() runs after every plugin's configure(), so RepositoryExtension is always there even though
    // Documents registers earlier — materialize belongs on the open path, not on repository→documents.
    this.unregisterMaterialize = documents.registerPreparer(async (path, viewer) => {
      await repository.ready()
      if (viewer?.readMode === 'range') return
      await repository.materializeIfPending(path)
    })
    // The vault subscription is free; the config read is not — on the browser client PluginConfig
    // goes through HttpFileSystem, so awaiting it here held first paint behind a network round-trip.
    // Default stays until the read lands (and config.watch in configure() covers later saves).
    this.stopping = false
    this.bootConfigPending = true
    // Held on the service rather than awaited here: the Settings section reads the same PluginConfig, and
    // a page opened (or saved) before the move would read, or write into, the still-empty new bucket.
    // A failed move costs the saved settings for this boot, never the boot itself.
    if (ctx.services.has(RootVfs)) {
      const migration = migrateHomeFolders(ctx.services.get(RootVfs), this.logger).catch((error) =>
        this.logger.error('Could not move the Notes folders to Documents', error),
      )
      ctx.services.get(PluginConfig).holdUntil(migration)
    }
    this.bringUp = this.loadConfig(ctx, documents)
    void this.bringUp.catch((error) => this.logger.error('Could not read Documents settings — using defaults', error))

    this.unwatch = ctx.services.get(VaultWatcher).subscribe((change) => {
      if (change.kind === 'written') return
      const workspace = shell.attachedWorkspace
      if (workspace == null) return
      const previous = change.kind === 'renamed' ? change.from : change.pathname
      if (previous == null) return
      for (const tab of workspace.tabsOf(DOCUMENTS_TYPE_ID)) {
        const object = workspace.objectOf(DOCUMENTS_TYPE_ID, tab.key)
        const path = object?.props.path
        if (object == null || typeof path !== 'string' || (path !== previous && !path.startsWith(`${previous}/`))) continue
        if (change.kind === 'deleted') workspace.markGone(DOCUMENTS_TYPE_ID, tab.key)
        else {
          const next = change.pathname + path.slice(previous.length)
          workspace.replaceObject(DOCUMENTS_TYPE_ID, tab.key, {
            ...object,
            key: next,
            title: documents.displayName(next).text,
            props: { ...object.props, path: next },
            snapshot: () => ({ path: next }),
            beforeClose: () => documents.beforeClose(next),
          })
        }
      }
    })
    return super.start(ctx)
  }

  private async loadConfig(ctx: PluginContext, documents: DocumentsExtension): Promise<void> {
    // tryRead: an unreachable settings store must not abort the boot, it just means the default (hide).
    const cfg = await ctx.services.get(PluginConfig).tryRead(DocumentsConfigSchema)
    if (this.stopping) return
    // A section save can land while this read is still in flight on vfs-http — do not replay stale hide/show.
    if (this.bootConfigPending) documents.hideKnownExtensions.value = toHideKnownExtensions(cfg ?? {})
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.stopping = true
    await this.bringUp?.catch(() => {})
    this.unregisterMaterialize?.()
    this.unregisterMaterialize = null
    this.unwatch?.()
    this.unwatch = null
    this.unwatchConfig?.()
    this.unwatchConfig = null
    await super.stop(ctx)
  }
}
