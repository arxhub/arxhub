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

  // Registration order, first taker wins. A merger that throws is logged and skipped: one plugin's bug
  // must cost that plugin its merge (the file degrades to a conflict copy or to the next merger), never
  // the whole sync round.
  readonly merge: ContentMerger = async (pathname, base, local, remote) => {
    for (const registration of [...this.registrations]) {
      try {
        if (!registration.matches(pathname)) continue
        const result = await registration.merge(pathname, base, local, remote)
        if (result) return result
      } catch (error) {
        this.logger.error(`Content merger "${registration.id}" failed on ${pathname}; treating it as a decline`, error)
      }
    }
    return null
  }
}
