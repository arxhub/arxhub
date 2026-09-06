import { ref, shallowRef } from 'vue'
import type { HostedPanel, PanelHost } from '../ui/panel-host'
import type { Json } from '../ui/tab-type'

// A panel host with no layout of its own: one cell, the panels in the order they were opened. It is
// enough for every rule `Workspace` owns, and it deliberately answers `serializeLayout` with whatever
// `applyLayout` was last given — the workspace treats a layout as opaque data it carries between the
// host and the snapshot, and that is exactly what the fake lets a test observe.
export class FakePanelHost implements PanelHost {
  // shallowRef: a panel holds a component, and deep reactivity over a component definition is both
  // wasteful and, for the recursive Json of a layout, more type than TypeScript will unwrap.
  readonly panels = shallowRef<HostedPanel[]>([])
  readonly active = ref<string | null>(null)
  readonly layout = shallowRef<Json | null>(null)

  keys(): string[] {
    return this.panels.value.map((it) => it.key)
  }

  has(key: string): boolean {
    return this.panels.value.some((it) => it.key === key)
  }

  panel(key: string): HostedPanel | undefined {
    return this.panels.value.find((it) => it.key === key)
  }

  open(panel: HostedPanel): void {
    if (this.has(panel.key)) return
    this.panels.value = [...this.panels.value, panel]
    this.active.value = panel.key
  }

  replace(key: string, panel: HostedPanel): void {
    if (!this.has(key)) return
    this.panels.value = this.panels.value.map((it) => (it.key === key ? panel : it))
  }

  close(key: string): void {
    const index = this.panels.value.findIndex((it) => it.key === key)
    if (index === -1) return
    const remaining = this.panels.value.filter((it) => it.key !== key)
    if (this.active.value === key) {
      this.active.value = (remaining[index] ?? remaining[index - 1])?.key ?? null
    }
    this.panels.value = remaining
  }

  activate(key: string): void {
    if (this.has(key)) this.active.value = key
  }

  activeKey(): string | null {
    return this.active.value
  }

  serializeLayout(): Json | null {
    return this.layout.value
  }

  applyLayout(snapshot: Json | null): void {
    this.layout.value = snapshot
  }
}
