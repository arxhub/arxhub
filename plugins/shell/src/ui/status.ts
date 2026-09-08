import { type Component, type ComputedRef, computed, markRaw, shallowRef } from 'vue'

// What the background line shows while work is in progress. Read on every render.
export interface StatusBusy {
  label: string
  // A fraction from zero to one. Not declared — work with no foreseeable end.
  progress?: number
  // The object this work belongs to. A playing track has to lead back to its own object; indexing and
  // sync have no owner, and that is honest: there is nowhere to lead.
  owner?: { typeId: string; objectKey: string }
}

export interface StatusItem {
  id: string
  // WHAT this is, not WHERE to show it. The region is layout, and there are three layouts: the desktop
  // status bar, the status block of the search sheet on the phone, and the background line. With a
  // `region` field a plugin would have to know about all three; it sees none of them.
  kind: 'status' | 'action'
  component: Component
  order?: number
  // Whether the item is busy right now. The background line is a projection of this field, not a
  // second source: a separate extension point would mean two registrations and two diverging states.
  busy?: () => StatusBusy | null
}

export type StatusBusyEntry = StatusBusy & { id: string }

// The status registry, and with it the source of the background line. It replaced
// `footer.register({ region })`, whose five call sites now declare a `kind` instead of a side; `header`
// and `content`/`setContent` were replaced by nothing — they had zero call sites in the whole
// repository, and the header never rendered once.
export class StatusRegistry {
  private readonly entries = shallowRef<StatusItem[]>([])
  private readonly warn: (message: string) => void

  readonly all: ComputedRef<StatusItem[]> = computed(() => [...this.entries.value].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
  readonly statuses: ComputedRef<StatusItem[]> = computed(() => this.all.value.filter((it) => it.kind === 'status'))
  readonly actions: ComputedRef<StatusItem[]> = computed(() => this.all.value.filter((it) => it.kind === 'action'))

  // The busy items in the same order. Empty — there is no line at all.
  //
  // The value is computed, so an item's busyness has to live in a reactive value: a `busy` reading a
  // plain variable will update the line exactly once — the first time.
  readonly busy: ComputedRef<StatusBusyEntry[]> = computed(() =>
    this.all.value.flatMap((item) => {
      const work = item.busy?.()
      return work == null ? [] : [{ id: item.id, ...work }]
    }),
  )

  constructor(warn: (message: string) => void = () => {}) {
    this.warn = warn
  }

  register(item: StatusItem): void {
    if (this.entries.value.some((it) => it.id === item.id)) {
      this.warn(`Status item already registered, skipping the second registration: ${item.id}`)
      return
    }
    this.entries.value = [...this.entries.value, markRaw({ ...item }) as StatusItem]
  }

  unregister(id: string): void {
    this.entries.value = this.entries.value.filter((it) => it.id !== id)
  }
}
