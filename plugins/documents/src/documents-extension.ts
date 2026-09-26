import { Extension, type ExtensionArgs } from '@arxhub/core'
import { validation } from '@arxhub/errors'
import { basename, extname, join } from '@arxhub/path'
import type { ObjectBar } from '@arxhub/plugin-shell'
import type { ActionItem } from '@arxhub/uikit/core'
import { renameEntry, type VirtualFileSystem } from '@arxhub/vfs'
import { type Component, markRaw, ref, shallowRef } from 'vue'
import { type DisplayName, displayNameOf } from './display-name'
import { DEFAULT_HIDE_KNOWN_EXTENSIONS } from './documents-config'
import type { BlockAnchor } from './documents-type'
import { renameTarget } from './rename'

// What opens an object of this type. The viewer registry belongs to the TYPE, not to the shell: the
// shell has no business knowing what opens a `.md`, and it did know — `PanelDefinition.handles` lived
// in the panel store, and picking a viewer by file extension was the store's job
// (`getPanelsForFile`).
export interface DocumentViewer {
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
  // A range-capable viewer reads the pending file through the repository instead of first asking
  // sync to materialize the whole object. The default keeps the ordinary open path unchanged.
  readMode?: 'range'
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

// What finds documents by their content, under the type's own find field. Contributed by search, which
// is optional: while nothing has set one, the navigation draws no field at all. `results` takes a
// `query: string` prop and emits `opened` once a result was opened.
export interface DocumentFinder {
  results: Component
}

// What an open viewer says about its own object on the phone's band. The type keeps the name and its own
// actions (New, Close) and the viewer adds only what it alone knows: its tools, its parts, the toolbar that
// takes the band while the keyboard is up. The band is the type's — `TabType.bar` — and one type holds many
// viewers, so this is the road from the mounted viewer to it.
//
// Read on every render of the band, so whatever it reads must be reactive.
export type DocumentBar = Partial<Pick<ObjectBar, 'icon' | 'sub' | 'parts' | 'actions' | 'menu' | 'editing'>>

// The phone's way to make something: what (a document, a spreadsheet, files from the phone) → where (a
// folder picker) → confirm. Contributed by the explorer, which has the tree the picker is drawn from; while
// nothing has set one, New creates straight into the vault's root.
export interface DocumentCreateFlow {
  // `folder` is where the picker starts: the open document's own folder, or null for the root.
  start(folder: string | null): void
  // What the band's More offers while nothing is open.
  menu?(folder: string | null): ActionItem[]
}

type Creator = () => Promise<string | null>
// Runs before an object opens, with its path and selected viewer. What sync uses to bring a file this
// device left in the cloud onto disk first — the viewer that mounts next reads from disk and knows
// nothing about clouds, unless it explicitly declares a range read mode.
type Preparer = (path: string, viewer?: DocumentViewer) => Promise<void>

export interface DocumentsExtensionArgs extends ExtensionArgs {
  vfs: VirtualFileSystem
  // Where a note created without a place lands.
  root: string
}

// The owner of the "Documents" type: the viewer registry plus the two points the explorer plugs itself
// into — navigation and creation. Both are points rather than imports, because the explorer is
// switchable and the type is not, and the type has to survive its absence.
export class DocumentsExtension extends Extension {
  readonly vfs: VirtualFileSystem
  readonly root: string

  // shallowRef: the entries hold components, which need no reactive proxy and whose identity
  // comparison a proxy breaks.
  private readonly viewers = shallowRef<DocumentViewer[]>([])
  // The type's navigation. Reactive because the explorer sets it in its own `configure()` — after the
  // type is already registered — and the wrapper component has to see that.
  readonly nav = shallowRef<Component | null>(null)
  readonly finder = shallowRef<DocumentFinder | null>(null)
  // What creates a note when somebody knows the place better. The explorer does: it has a selected
  // folder and a tree that has to show the result.
  private creator: Creator | null = null
  readonly createFlow = shallowRef<DocumentCreateFlow | null>(null)
  private readonly preparers = new Set<Preparer>()
  // OR-03: whether a name hides an extension a viewer claims. Applied live by the plugin's own
  // PluginConfig.watch (documents-plugin.ts), so a saved change reaches every surface with no restart.
  readonly hideKnownExtensions = ref<boolean>(DEFAULT_HIDE_KNOWN_EXTENSIONS)
  private readonly openViews = new Set<{ path: () => string; reveal: (anchor: BlockAnchor) => boolean; beforeClose?: () => Promise<boolean> }>()

  registerOpenView(path: () => string, reveal: (anchor: BlockAnchor) => boolean, beforeClose?: () => Promise<boolean>): () => void {
    const entry = { path, reveal, beforeClose }
    this.openViews.add(entry)
    return () => {
      this.openViews.delete(entry)
    }
  }

  // A ref, unlike `openViews`: the band is a computed over it, and a viewer mounting after the band was
  // first drawn has to redraw it.
  private readonly viewBars = shallowRef<{ path: () => string; bar: () => DocumentBar | null }[]>([])

  registerViewBar(path: () => string, bar: () => DocumentBar | null): () => void {
    const entry = { path, bar }
    this.viewBars.value = [...this.viewBars.value, entry]
    return () => {
      this.viewBars.value = this.viewBars.value.filter((it) => it !== entry)
    }
  }

  viewBar(path: string): DocumentBar | null {
    return this.viewBars.value.find((entry) => entry.path() === path)?.bar() ?? null
  }

  reveal(path: string, anchor: BlockAnchor): boolean {
    return [...this.openViews].find((entry) => entry.path() === path)?.reveal(anchor) ?? false
  }

  beforeClose(path: string): Promise<boolean> {
    return [...this.openViews].find((entry) => entry.path() === path)?.beforeClose?.() ?? Promise.resolve(true)
  }

  constructor(args: DocumentsExtensionArgs) {
    super(args)
    this.vfs = args.vfs
    this.root = args.root
  }

  registerViewer(viewer: DocumentViewer): void {
    if (this.viewers.value.some((it) => it.id === viewer.id)) {
      this.logger.warn(`Document viewer already registered, skipping the second registration: ${viewer.id}`)
      return
    }
    const entry = markRaw({
      ...viewer,
      component: markRaw(viewer.component),
      extensions: viewer.extensions.map((it) => it.toLowerCase()),
    }) as DocumentViewer
    this.viewers.value = [...this.viewers.value, entry].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  unregisterViewer(id: string): void {
    this.viewers.value = this.viewers.value.filter((it) => it.id !== id)
  }

  viewerFor(path: string): DocumentViewer | undefined {
    const ext = extname(path).toLowerCase()
    if (ext === '') return undefined
    return this.viewers.value.find((it) => it.extensions.includes(ext))
  }

  setNav(component: Component): void {
    this.nav.value = markRaw(component)
  }

  setFinder(finder: DocumentFinder | null): void {
    this.finder.value = finder == null ? null : markRaw({ results: markRaw(finder.results) })
  }

  setCreator(creator: Creator): void {
    this.creator = creator
  }

  // Remove an object from the vault. Whoever has it open closes it first and without saving — a save
  // landing after the delete would write the file straight back.
  async deleteObject(path: string): Promise<void> {
    await this.vfs.delete(path, { recursive: true, force: true })
  }

  setCreateFlow(flow: DocumentCreateFlow | null): void {
    this.createFlow.value = flow == null ? null : markRaw(flow)
  }

  registerPreparer(preparer: Preparer): () => void {
    this.preparers.add(preparer)
    return () => {
      this.preparers.delete(preparer)
    }
  }

  // Every preparer, in registration order; a failure aborts the open, and the opener reports it —
  // a viewer over a file that is not there would report something less useful.
  async prepare(path: string, viewer = this.viewerFor(path)): Promise<void> {
    for (const preparer of this.preparers) await preparer(path, viewer)
  }

  // Create a note and return its path. Opening is the caller's business: opening belongs to the
  // workspace, and doing it from here would be a second place that opens objects, beside the one that
  // holds the "already open" check.
  //
  // The fallback writes markdown rather than the product's primary '.arx' (A-29) on purpose: an empty
  // file is a valid markdown note, while an empty '.arx' is a broken document, and the seed that makes
  // one valid belongs with whoever owns the format — which is the explorer's creator below, not a
  // second copy here.
  async createDocument(): Promise<string | null> {
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
      const taken = await this.vfs.exists(candidate)
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

  // The file's name on disk, whole. What a surface SHOWS is `displayName` — this is for a message that
  // has to name the file itself (a failed write, a confirmation), where a hidden extension would name a
  // file that does not exist.
  titleOf(path: string): string {
    return basename(path) || path
  }

  // What this file is CALLED on screen, for every surface that names one — the strip above the open
  // document, and the explorer's rows through the source its plugin wires against this. The rule lives
  // here because `viewerFor` is what "known" means, and two copies of it would be the product
  // contradicting itself on one screen, which is exactly what it did.
  displayName(path: string): DisplayName {
    return displayNameOf(path, this.hideKnownExtensions.value, (it) => this.viewerFor(it) != null)
  }

  // Give an open object a new name, and answer where it now lives. It is a method here rather than
  // five viewers reaching for `this.vfs` themselves, because the rules around the write are the type's
  // and not each viewer's: what a name may be, and that a rename never silently eats the file already
  // holding that name. Five copies of them would be five places to fix.
  //
  // Nothing here touches what is open: the write reaches `VaultWatcher`, and `DocumentsPlugin` retargets
  // the tab from there — the same road a rename from the tree already travels, so a buffer with unsaved
  // text survives either one.
  async renameObject(path: string, name: string): Promise<string> {
    const target = renameTarget(path, name)
    if (target === path) return path
    if (await this.vfs.exists(target)) throw validation(`"${basename(target)}" is already here`)
    await renameEntry(this.vfs, path, target)
    return target
  }
}
