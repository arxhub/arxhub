// One implementation of "something announces, something else listens". Four places in the tree had
// hand-rolled their own — a Set of callbacks, or a private EventEmitter — each with its own answer to
// what happens when a listener throws and none of them typed the payload. A local bus is created with
// its own event map (`createEventBus<MyEvents>()`); the application-wide one is the same thing over the
// declaration-merged `EventMap`.

export type Unsubscribe = () => void

// An event map: name → the single payload that event carries. One payload rather than positional
// arguments, so adding a field to an event costs its listeners nothing.
export type EventsShape = object

// `Extract<keyof …, string>` rather than `keyof …`: a map is an interface so others can merge into it,
// and symbol keys would leak into every signature for nothing.
export type EventName<Events extends EventsShape> = Extract<keyof Events, string>

export type EventListener<Payload> = (payload: Payload) => void

// Reports a listener that threw, and keeps the remaining listeners running. Without one the throw
// reaches whoever called `emit` — the right default, because a swallowed error is a bug nobody sees, but
// wrong for an announcement made after an operation has already succeeded (a VFS write, a 401 already
// being handled): those pass a handler and carry on.
export type EventBusErrorHandler<Events extends EventsShape> = (
  error: unknown,
  event: EventName<Events>,
  payload: Events[EventName<Events>],
) => void

export interface EventBusOptions<Events extends EventsShape> {
  onError?: EventBusErrorHandler<Events>
}

export interface TypedEventBus<Events extends EventsShape> {
  // Returns an unsubscribe function — the shape every caller in the tree already wanted, so none of them
  // has to keep the listener around just to pass it back to `off`.
  on<K extends EventName<Events>>(event: K, listener: EventListener<Events[K]>): Unsubscribe
  once<K extends EventName<Events>>(event: K, listener: EventListener<Events[K]>): Unsubscribe
  off<K extends EventName<Events>>(event: K, listener: EventListener<Events[K]>): void
  emit<K extends EventName<Events>>(event: K, payload: Events[K]): void
  listenerCount(event: EventName<Events>): number
  removeAllListeners(event?: EventName<Events>): void
}

export function createEventBus<Events extends EventsShape>(options: EventBusOptions<Events> = {}): TypedEventBus<Events> {
  return new EventBusImpl<Events>(options.onError)
}

// A listener whose payload type is not knowable from the registry that holds it — every event's
// listeners live in one map. `never` in the parameter position accepts any listener without a cast on
// the way in; `emit` casts once on the way out, where the key does say which payload it is.
type AnyListener = EventListener<never>

interface Registration {
  fn: AnyListener
  once: boolean
  // Set when the subscription is given up. An emit already in flight holds a snapshot of the list, so
  // this is the only thing that tells it a listener it is about to reach has since unsubscribed — and it
  // must not reach it: teardown code unsubscribes precisely because it is no longer able to handle the
  // event. Deliberately NOT set for a `once` entry retiring mid-emit, which still runs this one time.
  cancelled: boolean
}

class EventBusImpl<Events extends EventsShape> implements TypedEventBus<Events> {
  private readonly registrations = new Map<string, Registration[]>()
  private readonly onError: EventBusErrorHandler<Events> | undefined

  constructor(onError?: EventBusErrorHandler<Events>) {
    this.onError = onError
  }

  on<K extends EventName<Events>>(event: K, listener: EventListener<Events[K]>): Unsubscribe {
    return this.add(event, listener, false)
  }

  once<K extends EventName<Events>>(event: K, listener: EventListener<Events[K]>): Unsubscribe {
    return this.add(event, listener, true)
  }

  off<K extends EventName<Events>>(event: K, listener: EventListener<Events[K]>): void {
    const registrations = this.registrations.get(event)
    if (registrations == null) return
    const found = registrations.find((it) => it.fn === listener)
    if (found != null) this.cancel(event, found)
  }

  emit<K extends EventName<Events>>(event: K, payload: Events[K]): void {
    const registrations = this.registrations.get(event)
    if (registrations == null) return
    // A snapshot: a listener that subscribes while being notified must not join the round already in
    // flight. The `once` entries come off before anything runs, so a listener that throws still does not
    // get called a second time.
    const snapshot = [...registrations]
    for (const registration of snapshot) {
      if (registration.once) this.remove(event, registration)
    }
    for (const registration of snapshot) {
      if (registration.cancelled) continue
      const listener = registration.fn as EventListener<Events[K]>
      if (this.onError == null) {
        listener(payload)
      } else {
        try {
          listener(payload)
        } catch (error) {
          this.onError(error, event, payload)
        }
      }
    }
  }

  listenerCount(event: EventName<Events>): number {
    return this.registrations.get(event)?.length ?? 0
  }

  removeAllListeners(event?: EventName<Events>): void {
    const events = event == null ? [...this.registrations.keys()] : [event]
    for (const name of events) {
      for (const registration of this.registrations.get(name) ?? []) registration.cancelled = true
      this.registrations.delete(name)
    }
  }

  private add(event: string, listener: AnyListener, once: boolean): Unsubscribe {
    const registration: Registration = { fn: listener, once, cancelled: false }
    const registrations = this.registrations.get(event)
    if (registrations == null) this.registrations.set(event, [registration])
    else registrations.push(registration)
    // Cancels this registration and no other: the same function may be subscribed twice, and a handle
    // that matched by function would then drop somebody else's subscription.
    return () => this.cancel(event, registration)
  }

  private cancel(event: string, registration: Registration): void {
    registration.cancelled = true
    this.remove(event, registration)
  }

  private remove(event: string, registration: Registration): void {
    const registrations = this.registrations.get(event)
    if (registrations == null) return
    const index = registrations.indexOf(registration)
    if (index < 0) return
    registrations.splice(index, 1)
    if (registrations.length === 0) this.registrations.delete(event)
  }
}
