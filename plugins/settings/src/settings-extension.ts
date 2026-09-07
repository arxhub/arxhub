import type { PluginConfig } from '@arxhub/config'
import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { TObject } from '@sinclair/typebox'
import { type Component, markRaw, ref, shallowRef } from 'vue'
import { createPendingChanges, type PendingChanges } from './pending-changes'

// A settings section is contributed by a plugin in its configure() step.
// Provide EITHER a `schema` (auto-rendered into a form by SchemaSettingsPage) plus the owning
// plugin's scoped `config` service (where the form reads/writes config.toml) OR a custom `component`.
export interface SettingsSection {
  id: string
  title: string
  icon?: string
  order?: number
  schema?: TObject
  // The owning plugin's scoped config service (e.g. ctx.services.get(PluginConfig)). Required when
  // `schema` is set — the schema form persists through it, so a section can never write outside its
  // owner's sandbox.
  config?: PluginConfig
  component?: Component
}

export class SettingsExtension extends Extension {
  // shallowRef, not ref: deep unwrapping maps over SettingsSection.config, and a mapped type drops
  // PluginConfig's private members — the unwrapped value then no longer matches PluginConfig where
  // the form consumes it. Sections are always replaced wholesale, so shallow reactivity is enough.
  readonly sections = shallowRef<SettingsSection[]>([])
  readonly activeId = ref<string | null>(null)
  // Every section shown at least once this session, in the order it was first shown. The frame keeps
  // all of them mounted and displays the active one, so a section keeps its scroll position, its
  // in-flight reads and its half-typed form while another one is on screen.
  //
  // This replaces a private `PanelStore` settings used to create for the same job. A store belongs to
  // a tab type and a tab is an object of the vault; a settings section is neither — it is picked from
  // a list, never opened, closed, split or dragged. The store existed only to make sections look like
  // tabs, and it cost a second copy of "which section is showing" beside `activeId` that nothing kept
  // in step.
  readonly openedIds = ref<string[]>([])
  // Edits from every section, staged together and applied by one Save. See pending-changes.ts.
  readonly changes: PendingChanges

  constructor(args: ExtensionArgs) {
    super(args)
    this.changes = createPendingChanges((sectionId, error) => this.logger.error(`[settings] could not save ${sectionId}:`, error))
  }

  register(section: SettingsSection): void {
    if (!section.schema && !section.component) {
      this.logger.warn(`register(${section.id}) ignored: section needs a schema or a component`)
      return
    }
    if (section.schema && !section.config) {
      this.logger.warn(`register(${section.id}) ignored: a schema section needs a config service to persist into`)
      return
    }
    const next = section.component ? { ...section, component: markRaw(section.component) } : section
    this.sections.value = [...this.sections.value, next]
    if (this.activeId.value == null) this.activeId.value = section.id
  }

  unregister(id: string): void {
    this.sections.value = this.sections.value.filter((s) => s.id !== id)
    this.openedIds.value = this.openedIds.value.filter((it) => it !== id)
    if (this.activeId.value !== id) return
    const next = this.sections.value[0]?.id
    if (next == null) this.activeId.value = null
    else this.open(next)
  }

  // Show a section. Called from outside settings too (the sync footer, the maintenance footer, the
  // auth dialog), so it must work while the screen is not mounted — it records the choice, and the
  // frame renders it whenever it next runs.
  //
  // A second call for a section already shown is not a second anything: it only makes it active
  // again. The de-duplication is the membership test below, in one place, so no caller does its own.
  open(id: string): void {
    this.activeId.value = id
    if (!this.openedIds.value.includes(id)) this.openedIds.value = [...this.openedIds.value, id]
  }
}
