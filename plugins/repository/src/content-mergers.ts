import { illegalState } from '@arxhub/errors'
import type { Logger } from '@arxhub/logger'
import type { ContentMerger } from '@arxhub/sync'

// What a plugin contributes to resolve a "both modified" conflict in a format it owns. `matches` is asked
// with the repo-relative path (`vault/notes/a.md`); `merge` answers null to decline — "not mine after all,
// let the next one look" — which is also what a throw is turned into below.
export interface ContentMergerRegistration {
  id: string
  matches: (pathname: string) => boolean
  merge: ContentMerger
  // Generic mergers run only when no format owner claimed the path. Once an owner matches, its
  // decline or failure must become a conflict copy rather than letting a byte-level fallback mangle it.
  fallback?: boolean
}

// The one merger `Repo` knows about is this registry's `merge`, composed over every registration. Repo
// has a single last-writer-wins slot, and two plugins each setting it would silently unregister each
// other; a registry in front of it lets `.arx`, text and `.arxs` coexist without any of them knowing
// the others exist.
export class ContentMergerRegistry {
  private readonly logger: Logger
  private readonly registrations: ContentMergerRegistration[] = []

  constructor(logger: Logger) {
    this.logger = logger
  }

  register(registration: ContentMergerRegistration): () => void {
    if (this.registrations.some((it) => it.id === registration.id))
      throw illegalState(`A content merger with id "${registration.id}" is already registered`)
    this.registrations.push(registration)
    // Removes THIS registration, not whichever currently holds the id — a plugin restarted under the same
    // id must not have its fresh registration pulled out by the old one's late unregister.
    return () => {
      const index = this.registrations.indexOf(registration)
      if (index >= 0) this.registrations.splice(index, 1)
    }
  }

  // Registration order is preserved within each tier, but format owners always run before generic
  // fallbacks. A matched owner that cannot merge owns the refusal too: Repo writes a whole-file conflict
  // copy instead of asking a byte-level fallback to reinterpret that format.
  readonly merge: ContentMerger = async (pathname, base, local, remote) => {
    const registrations = [...this.registrations]
    let ownerMatched = false

    for (const fallback of [false, true]) {
      if (fallback && ownerMatched) return null
      for (const registration of registrations) {
        if ((registration.fallback === true) !== fallback) continue
        try {
          if (!registration.matches(pathname)) continue
          if (!fallback) ownerMatched = true
          const result = await registration.merge(pathname, base, local, remote)
          if (result) return result
        } catch (error) {
          this.logger.error(`Content merger "${registration.id}" failed on ${pathname}; treating it as a decline`, error)
        }
      }
    }
    return null
  }
}
