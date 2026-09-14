import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { dirname } from '@arxhub/path'
import { type ObjectGone, type ObjectRef, type OpenedObject, objectGone, ShellExtension } from '@arxhub/plugin-shell/ui'
import { VaultVfs, VaultWatcher } from '@arxhub/vfs'
import { type Component, h, markRaw } from 'vue'
import { manifest } from './manifest'
import { NotesExtension } from './notes-extension'
import { blockAnchorOf, NOTES_TYPE_ID, noteSnapshotPath } from './notes-type'
import NotesNav from './ui/NotesNav.vue'
import NoteUnsupported from './ui/NoteUnsupported.vue'

export interface NotesPluginArgs extends PluginArgs {
  // Where notes live in the vault. The instance decides — it is what knows how the vault is mounted.
  root?: string
}

// The tree and search both open Notes objects through Workspace, so a document has one live buffer.
export class NotesPlugin extends Plugin {
  private readonly root: string
  private unwatch: (() => void) | null = null
  // The dock wrapper of the note that is active right now. `dock()` is asked on every render, so the
  // wrapper is remembered rather than rebuilt: a fresh closure each time is a fresh component
  // identity, and the bar would be torn down and remounted — losing focus and state — on every tick.
  private dockCache: { path: string; viewerId: string; component: Component } | null = null

  constructor(args: NotesPluginArgs) {
    super(args, manifest)
    this.root = args.root ?? '/'
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(NotesExtension, () => ({ vfs: ctx.services.get(VaultVfs), root: this.root }))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const notes = ctx.extensions.get(NotesExtension)
    const shell = ctx.extensions.get(ShellExtension)

    // Open an object. Checking "is it already open" neither is needed nor belongs here: that check
    // lives in one place, in `Workspace.openObject`. An object always comes back from here — with the
    // same key for the same path, which is what the de-duplication rests on.
    const open = async (ref: ObjectRef): Promise<OpenedObject> => {
      const path = String(ref.id)
      await notes.prepare(path)
      const viewer = notes.viewerFor(path)
      const anchor = blockAnchorOf(ref.at)

      // The note is already open — then the mounted editor's props cannot be changed and the place has
      // to be shown directly. A miss is deliberately silent: nothing was found, so the reader simply
      // stays at the top of the note instead of being told about something they did not ask for.
      if (anchor != null) notes.reveal(path, anchor)

      return {
        key: path,
        title: notes.titleOf(path),
        component: viewer?.component ?? markRaw(NoteUnsupported),
        // The same address as a prop — for the case where the note is NOT open yet: the editor mounts
        // and shows the place itself. Two roads to one thing, because there are two states: a live
        // editor and one that does not exist yet.
        props: { path, ...(viewer != null && anchor != null ? { anchor } : {}) },
        snapshot: () => ({ path }),
        beforeClose: () => notes.beforeClose(path),
      }
    }

    shell.types.register({
      id: NOTES_TYPE_ID,
      icon: 'lu:file-text',
      title: 'Notes',
      order: 0,
      objects: {
        open,
        // The object may be gone by now: the file was renamed, or deleted from another device. Then
        // `objectGone` — and the tab stays, marked, instead of disappearing silently.
        revive: async (snapshot): Promise<OpenedObject | ObjectGone> => {
          const path = noteSnapshotPath(snapshot)
          if (path == null) return objectGone
          if (!(await notes.stillThere(path))) return objectGone
          return open({ id: path })
        },
        label: (object) => {
          const path = typeof object.props.path === 'string' ? object.props.path : object.key
          const dir = dirname(path)
          // The path as a second line — what tells one "Contract.md" from another. At the root there
          // is no second line: it would repeat the first.
          return { title: object.title, subtitle: dir === '' || dir === '.' || dir === '/' ? undefined : dir }
        },
      },
      nav: { component: markRaw(NotesNav), title: 'Vault' },
      create: {
        title: 'New note',
        icon: 'lu:file-plus',
        run: async () => {
          const path = await notes.createNote()
          if (path != null) await shell.workspace.openObject(NOTES_TYPE_ID, { id: path })
        },
      },
      open: { title: 'Open notes' },
      // The dock is declared by the type — once; what fills it is decided by the active note's viewer.
      dock: (active) => {
        if (active == null) return null
        const path = typeof active.props.path === 'string' ? active.props.path : active.key
        const viewer = notes.viewerFor(path)
        if (viewer?.dock == null) return null
        if (this.dockCache?.path !== path || this.dockCache.viewerId !== viewer.id) {
          const dock = viewer.dock
          this.dockCache = { path, viewerId: viewer.id, component: markRaw(() => h(dock, { path })) }
        }
        return this.dockCache.component
      },
    })
  }

  override async start(ctx: PluginContext): Promise<void> {
    const shell = ctx.extensions.get(ShellExtension)
    const notes = ctx.extensions.get(NotesExtension)
    this.unwatch = ctx.services.get(VaultWatcher).subscribe((change) => {
      if (change.kind === 'written') return
      const workspace = shell.attachedWorkspace
      if (workspace == null) return
      const previous = change.kind === 'renamed' ? change.from : change.pathname
      if (previous == null) return
      for (const tab of workspace.tabsOf(NOTES_TYPE_ID)) {
        const object = workspace.objectOf(NOTES_TYPE_ID, tab.key)
        const path = object?.props.path
        if (object == null || typeof path !== 'string' || (path !== previous && !path.startsWith(`${previous}/`))) continue
        if (change.kind === 'deleted') workspace.markGone(NOTES_TYPE_ID, tab.key)
        else {
          const next = change.pathname + path.slice(previous.length)
          workspace.replaceObject(NOTES_TYPE_ID, tab.key, {
            ...object,
            key: next,
            title: notes.titleOf(next),
            props: { ...object.props, path: next },
            snapshot: () => ({ path: next }),
            beforeClose: () => notes.beforeClose(next),
          })
        }
      }
    })
  }

  override async stop(): Promise<void> {
    this.unwatch?.()
    this.unwatch = null
  }
}
