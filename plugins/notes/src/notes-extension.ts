import { Extension, type ExtensionArgs } from '@arxhub/core'
import { basename, extname, join } from '@arxhub/path'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { type Component, markRaw, shallowRef } from 'vue'
import type { BlockAnchor } from './notes-type'

// What opens an object of this type. The viewer registry belongs to the TYPE, not to the shell: the
// shell has no business knowing what opens a `.md`, and it did know — `PanelDefinition.handles` lived
// in the panel store, and picking a viewer by file extension was the store's job
// (`getPanelsForFile`).
export interface NoteViewer {
  id: string
  // The panel definition this viewer is opened through, named rather than assumed. `store.openPanel`
  // takes a panel DEFINITION id, and every viewer today happens to carry the same string as its own
  // `id` — building the lookup on that would turn a temporary coincidence into the contract. It is a
  // field so it can be deleted in one place when the frames mount `component` directly (F-14/F-16),
  // taking the panel registrations with it.
  panelId: string
  title: string
  // Extensions with the dot, lower case: '.md', '.arx'.
  extensions: string[]
  component: Component
  // The tool bar of the active note. Not declared — no bar: an empty dock would take a band of the
  // screen for nothing. The component gets a single `path` prop.
  dock?: Component
  // The lower, the earlier a viewer is asked. Two viewers on one extension — the first wins.
  order?: number
  // Show a place inside an ALREADY OPEN note. Needed because re-opening an object is a switch, not a
  // second tab: the props of a mounted editor do not change, so "go here" cannot be passed through
  // them. Returning `false` means the place was not found (the text was edited after search found it)
  // and the tab simply opens as it is.
  //
  // A viewer that cannot jump to a place does not declare the role, and the degradation is honest:
  // the object opens whole, with no lie about a jump that did not happen.
  reveal?(path: string, anchor: BlockAnchor): boolean
}

type Creator = () => Promise<string | null>

export interface NotesExtensionArgs extends ExtensionArgs {
  vfs: VirtualFileSystem
  // Where a note created without a place lands.
  root: string
}

// The owner of the "Notes" type: the viewer registry plus the two points the explorer plugs itself
// into — navigation and creation. Both are points rather than imports, because the explorer is
// switchable and the type is not, and the type has to survive its absence.
export class NotesExtension extends Extension {
  readonly vfs: VirtualFileSystem
  readonly root: string

  // shallowRef: the entries hold components, which need no reactive proxy and whose identity
  // comparison a proxy breaks.
  private readonly viewers = shallowRef<NoteViewer[]>([])
  // The type's navigation. Reactive because the explorer sets it in its own `configure()` — after the
  // type is already registered — and the wrapper component has to see that.
  readonly nav = shallowRef<Component | null>(null)
  // What creates a note when somebody knows the place better. The explorer does: it has a selected
  // folder and a tree that has to show the result.
  private creator: Creator | null = null

  constructor(args: NotesExtensionArgs) {
    super(args)
    this.vfs = args.vfs
    this.root = args.root
  }

  registerViewer(viewer: NoteViewer): void {
    if (this.viewers.value.some((it) => it.id === viewer.id)) {
      this.logger.warn(`Note viewer already registered, skipping the second registration: ${viewer.id}`)
      return
    }
    const entry = markRaw({
      ...viewer,
      component: markRaw(viewer.component),
      extensions: viewer.extensions.map((it) => it.toLowerCase()),
    }) as NoteViewer
    this.viewers.value = [...this.viewers.value, entry].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  unregisterViewer(id: string): void {
    this.viewers.value = this.viewers.value.filter((it) => it.id !== id)
  }

  viewerFor(path: string): NoteViewer | undefined {
    const ext = extname(path).toLowerCase()
    if (ext === '') return undefined
    return this.viewers.value.find((it) => it.extensions.includes(ext))
  }

  setNav(component: Component): void {
    this.nav.value = markRaw(component)
  }

  setCreator(creator: Creator): void {
    this.creator = creator
  }

  // Create a note and return its path. Opening is the caller's business: opening belongs to the
  // workspace, and doing it from here would be a second place that opens objects, beside the one that
  // holds the "already open" check.
  //
  // The fallback writes markdown rather than the product's primary '.arx' (A-29) on purpose: an empty
  // file is a valid markdown note, while an empty '.arx' is a broken document, and the seed that makes
  // one valid belongs with whoever owns the format — which is the explorer's creator below, not a
  // second copy here.
  async createNote(): Promise<string | null> {
    if (this.creator != null) return this.creator()
    const path = await this.freePath(this.root, 'New note', '.md')
    await this.vfs.file(path).writeText('')
    return path
  }

  // A name nothing holds yet. A second "New note.md" would otherwise silently open the first one, and
  // creating would look like switching.
  async freePath(dir: string, stem: string, ext: string): Promise<string> {
    for (let n = 0; n < 1000; n++) {
      const name = n === 0 ? `${stem}${ext}` : `${stem} ${n + 1}${ext}`
      const candidate = join(dir, name)
      // A failed check is no reason not to create the note: it is about the name, not about the right
      // to write.
      const taken = await this.vfs.exists(candidate).catch(() => false)
      if (!taken) return candidate
    }
    return join(dir, `${stem} ${Date.now()}${ext}`)
  }

  // Is the object still in the vault. A read error does not count as "no": a dropped network is not a
  // deleted file, and a marked tab would tell the owner exactly that it was deleted.
  async stillThere(path: string): Promise<boolean> {
    try {
      return await this.vfs.exists(path)
    } catch {
      return true
    }
  }

  titleOf(path: string): string {
    return basename(path) || path
  }
}
