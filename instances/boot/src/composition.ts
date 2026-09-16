import type { ArxHub } from '@arxhub/core'
import { bootComposition } from './errors'

// One registered plugin as the check sees it: the manifest's own name and its own `essential` flag,
// in registration order. Nothing else about a plugin is a composition question.
export interface RegisteredPlugin {
  readonly name: string
  readonly essential: boolean
}

export interface CompositionRules {
  // What this kind of composition root is, for the message: 'client' or 'server'.
  readonly kind: string
  // Manifest names that must be registered. It cannot be derived from the registered plugins — a
  // plugin nobody registered leaves no manifest behind to read — so it is written out, and the
  // `essential` rule below is what keeps it from falling behind the manifests.
  readonly required: readonly string[]
  // Pairs (earlier, later) that must be registered in that order. `create()`/`configure()` run in
  // registration order, so a plugin that reads another's extension there needs this stated.
  readonly order: readonly (readonly [string, string])[]
}

// The client composition: every essential manifest a client boot runs, plus the one ordering the
// registration of sync depends on.
export const CLIENT_COMPOSITION: CompositionRules = {
  kind: 'client',
  required: [
    'Vfs',
    'Logger',
    'Config',
    'Hotkeys',
    'Shell',
    'Panels',
    'Notes',
    'settings',
    'keystore',
    'protection',
    'maintenance',
    'Repository',
  ],
  // Sync is the remote exchange layered over the local repository (A-50), and configure() reaches it
  // in registration order.
  order: [['Repository', 'sync']],
}

// The headless server's two essentials. The auth guard is essential on purpose — a recovery boot must
// not be a way to expose an unprotected vault.
export const SERVER_COMPOSITION: CompositionRules = {
  kind: 'server',
  required: ['@arxhub/plugin-gateway', 'ProtectionServer'],
  order: [],
}

// The registered plugins as the check sees them.
//
// Instantiating is what start() does a moment later, and LazyContainer caches, so start() reuses these
// very instances — the roster is read from the manifests rather than guessed from the constructors.
export function registeredPlugins(arxhub: ArxHub): readonly RegisteredPlugin[] {
  return arxhub.plugins.instantiate().map((it) => ({ name: it.manifest.name, essential: it.manifest.essential ?? false }))
}

// Every invariant the boot sequence stands on, checked in one pass before start() so a violation is
// reported as itself instead of as whatever breaks four phases later. Collects everything it finds:
// fixing a list one message at a time is three more boots.
export function checkComposition(plugins: readonly RegisteredPlugin[], rules: CompositionRules): void {
  const problems: string[] = []
  const at = new Map<string, number>()

  for (const [index, plugin] of plugins.entries()) {
    if (at.has(plugin.name)) problems.push(`'${plugin.name}' is registered twice`)
    else at.set(plugin.name, index)
  }

  for (const name of rules.required) {
    if (!at.has(name)) problems.push(`'${name}' is missing`)
  }

  // The list above is written by hand; this is what stops it drifting. A plugin whose manifest calls
  // itself essential is one no boot of this kind can do without, so a new one has to be named there —
  // and finding that out here beats finding it out as a half-empty app on someone's phone.
  for (const plugin of plugins) {
    if (plugin.essential && !rules.required.includes(plugin.name)) {
      problems.push(`'${plugin.name}' declares itself essential but the ${rules.kind} list does not require it`)
    }
  }

  for (const [earlier, later] of rules.order) {
    const before = at.get(earlier)
    const after = at.get(later)
    // A pair says nothing about a plugin that is not there: `later` being absent is a choice (sync is
    // optional), and `earlier` being absent is already reported above if it is required.
    if (before != null && after != null && before > after) problems.push(`'${earlier}' must be registered before '${later}'`)
  }

  if (problems.length > 0) throw bootComposition(rules.kind, problems)
}
