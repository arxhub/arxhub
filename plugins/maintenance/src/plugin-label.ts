// Manifest names are stable ids (they key the boot policy, a plugin's config dir and its log scope),
// and a few of them are still package names. Strip the package prefix for display only — never for
// anything persisted, or a rename would silently orphan a plugin's stored state.
export function pluginLabel(name: string): string {
  const bare = name.replace(/^@arxhub\/plugin-/, '')
  return bare.charAt(0).toUpperCase() + bare.slice(1)
}
