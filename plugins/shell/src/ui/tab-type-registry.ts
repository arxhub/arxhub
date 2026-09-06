import { type ComputedRef, computed, markRaw, shallowRef } from 'vue'
import { isPinned, type TabType } from './tab-type'

// The registry of tab types — what the type row and the "open new" section of the search sheet are
// built from. It is the successor to `ShellExtension.sidebar` and `ShellExtension.tabs`: a plugin used
// to register a "rail item" and, separately, a "mobile bar key", describing one thing twice in two
// dictionaries. Registration is now one, and how to show it is the frame's business.
//
// It arrives BESIDE the old registries rather than replacing them: nothing reads it yet, and the two
// frames keep running on `sidebar`/`tabs` until the ports that consume this one land.
export class TabTypeRegistry {
  // shallowRef plus markRaw on the entries: a type holds components and functions, and there is no
  // point making reactive proxies of them — registrations are static, while a proxy breaks identity
  // comparison (`nav.component === MyComponent`) and makes Vue walk the whole component definition.
  private readonly entries = shallowRef<TabType[]>([])
  private readonly warn: (message: string) => void

  readonly all: ComputedRef<TabType[]> = computed(() =>
    // A stable sort: at equal order the registration order is kept, so the row is not reshuffled just
    // because two plugins forgot to name an order.
    [...this.entries.value].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  )

  // The ones holding a permanent place in the row. The rest are reachable through the search sheet and
  // stand in the row for as long as they are open.
  readonly pinned: ComputedRef<TabType[]> = computed(() => this.all.value.filter(isPinned))

  constructor(warn: (message: string) => void = () => {}) {
    this.warn = warn
  }

  register(type: TabType): void {
    if (this.has(type.id)) {
      // The first one stays: registration happens as plugins start, and throwing here would mean
      // failing to load the application because two third-party types collided on a name.
      this.warn(`Tab type already registered, skipping the second registration: ${type.id}`)
      return
    }
    this.entries.value = [...this.entries.value, markRaw({ ...type }) as TabType]
  }

  unregister(id: string): void {
    this.entries.value = this.entries.value.filter((it) => it.id !== id)
  }

  get(id: string): TabType | undefined {
    return this.entries.value.find((it) => it.id === id)
  }

  has(id: string): boolean {
    return this.entries.value.some((it) => it.id === id)
  }
}
