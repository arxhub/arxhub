import type { PluginInfo } from '@arxhub/core'
import { language } from '@arxhub/i18n'

// Manifest names are stable ids (they key the boot policy, a plugin's config dir and its log scope),
// and a few of them are still package names. Strip the package prefix for display only — never for
// anything persisted, or a rename would silently orphan a plugin's stored state.
export function pluginLabel(name: string): string {
  const bare = name.replace(/^@arxhub\/plugin-/, '')
  return bare.charAt(0).toUpperCase() + bare.slice(1)
}

// Read on every render through `language`, so switching the language in Settings redraws the list.
export function pluginDescription(plugin: Pick<PluginInfo, 'description' | 'descriptions'>): string | undefined {
  return plugin.descriptions?.[language.value] ?? plugin.description
}
