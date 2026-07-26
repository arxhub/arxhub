// A refused signed request is observed in ONE place. `signingMiddleware` reports every 401 here and
// anything that wants to tell the user subscribes, so a server that does not accept this device's
// identity is a condition the app can show rather than a failure each caller discovers alone.
//
// The alternative — an `onRejected` callback threaded through each client's options — has to be
// re-wired at every construction site (three HttpFileSystems, sync's remote, publish's remote), and a
// signed client added later that forgets to pass it goes back to failing silently, which is the whole
// thing this exists to prevent.

export interface AuthRejection {
  // Why the server refused, from its `x-arx-auth-reason` header; null when it said nothing — an older
  // server, or a 401 raised by something that is not the auth guard.
  reason: string | null
  method: string
  // Path only. A rejection is shown to the user, and a query string can carry content.
  path: string
}

export type AuthRejectionListener = (rejection: AuthRejection) => void

class AuthRejections {
  private readonly listeners = new Set<AuthRejectionListener>()

  subscribe(listener: AuthRejectionListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notify(rejection: AuthRejection): void {
    for (const listener of this.listeners) {
      try {
        listener(rejection)
      } catch (error) {
        // This runs mid-request: a listener that throws must not reject the response promise its caller
        // is already awaiting, nor stop the other listeners. The console is the only place to say so —
        // a logger would mean depending on @arxhub/core, which this package deliberately does not.
        console.error('[crypto] an auth-rejection listener threw', error)
      }
    }
  }
}

export const authRejections = new AuthRejections()
