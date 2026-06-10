import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { PanelStore } from '@arxhub/plugin-panels/ui'
import type { TObject } from '@sinclair/typebox'
import { type Component, markRaw, ref } from 'vue'

// A settings section is contributed by a plugin in its configure() step.
// Provide EITHER a `schema` (auto-rendered into a form by SchemaSettingsPage,
// persisted to config/<id>.toml) OR a custom `component` for bespoke UI.
export interface SettingsSection {
  id: string
  title: string
  icon?: string
  order?: number
  schema?: TObject
  component?: Component
}

export class SettingsExtension extends Extension {
  readonly sections = ref<SettingsSection[]>([])
  readonly activeId = ref<string | null>(null)
  // The settings content area's own panel store — assigned by SettingsPlugin.configure().
  store!: PanelStore

  constructor(args: ExtensionArgs) {
    super(args)
  }

  register(section: SettingsSection): void {
    if (!section.schema && !section.component) {
      this.logger.warn(`register(${section.id}) ignored: section needs a schema or a component`)
      return
    }
    const next = section.component ? { ...section, component: markRaw(section.component) } : section
    this.sections.value = [...this.sections.value, next]
    if (this.activeId.value == null) this.activeId.value = section.id
  }

  unregister(id: string): void {
    this.sections.value = this.sections.value.filter((s) => s.id !== id)
    if (this.activeId.value === id) this.activeId.value = this.sections.value[0]?.id ?? null
  }

  // Open the section as a tab in the content store, reusing an existing tab if already open.
  open(id: string): void {
    this.activeId.value = id
    const store = this.store
    if (!store) return

    for (const [groupId, group] of Object.entries(store.groups.value)) {
      const instance = group.instances.find((i) => i.props?.sectionId === id)
      if (instance) {
        store.activateGroup(groupId)
        store.activatePanel(instance.instanceId, groupId)
        return
      }
    }

    const section = this.sections.value.find((s) => s.id === id)
    store.openPanel('settings.page', { sectionId: id }, section?.title ?? id)
  }
}
