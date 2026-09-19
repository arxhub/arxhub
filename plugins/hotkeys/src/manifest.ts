import type { PluginManifest } from '@arxhub/core'

export const manifest = {
  name: 'Hotkeys',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Keyboard ownership: layered chord registry and dispatch',
  // `PluginManifest` has no `dependsOn`, so "the shell is up, the keyboard is not" is a reachable
  // state: ⌘K opens nothing, ⌘B does nothing, and the nav column still advertises a chord that no
  // longer exists. Worse, the editors' declarations would go with it and the ⌘B collision this plugin
  // was written to fix would come back — a switch that reproduces the bug is not a switch. Nothing
  // here reaches the network, a database or the store, so there is nothing to switch off anyway.
  essential: true,
} satisfies PluginManifest
