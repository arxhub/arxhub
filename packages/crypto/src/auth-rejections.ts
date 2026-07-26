// A refused signed request is observed in ONE place. `signingMiddleware` reports every 401 here and
// anything that wants to tell the user subscribes, so a server that does not accept this device's
// identity is a condition the app can show rather than a failure each caller discovers alone.
//
// The alternative — an `onRejected` callback threaded through each client's options — has to be
// re-wired at every construction site (three HttpFileSystems, sync's remote, publish's remote), and a
// signed client added later that forgets to pass it goes back to failing silently, which is the whole
// thing this exists to prevent.

import { createEventBus, type Unsubscribe } from '@arxhub/events'

export interface AuthRejection {
  // Why the server refused, from its `x-arx-auth-reason` header; null when it said nothing — an older
  // server, or a 401 raised by something that is not the auth guard.
  reason: string | null
  method: string
  // Path only. A rejection is shown to the user, and a query string can carry content.
  path: string
}

export type AuthRejectionListener = (rejection: AuthRejection) => void

// This bus is module-scoped, not the application-wide one: `signingMiddleware` is a plain function with
// no plugin context to take a bus from, and a rejection has to be reportable from a client constructed
// before (or without) an ArxHub.
interface AuthRejectionEvents {
  rejected: AuthRejection
}

class AuthRejections {
  private readonly events = createEventBus<AuthRejectionEvents>({
    // This runs mid-request: a listener that throws must not reject the response promise its caller is
    // already awaiting, nor stop the other listeners. The console is the only place to say so — a logger
    // would mean depending on @arxhub/core, which this package deliberately does not.
    onError: (error) => console.error('[crypto] an auth-rejection listener threw', error),
  })

  subscribe(listener: AuthRejectionListener): Unsubscribe {
    return this.events.on('rejected', listener)
  }

  notify(rejection: AuthRejection): void {
    this.events.emit('rejected', rejection)
  }
}

export const authRejections = new AuthRejections()
