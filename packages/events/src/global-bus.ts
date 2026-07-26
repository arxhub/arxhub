import type { TypedEventBus } from './bus'
import type { EventMap } from './event-map'

// The application-wide bus: one instance, created by ArxHub and handed to every plugin through its
// PluginContext. Its event map is declaration-merged, so a name is only emittable once some package has
// declared it — which is the point: an event typed by nobody is a typo waiting to happen.
//
// It is for announcements that cross plugin boundaries. A stream that belongs to ONE object — a
// watcher's changes, an indexer's status, a buffer's records — gets its own `createEventBus<Events>()`
// instead: there are several of those objects, and a subscriber would otherwise have to filter the whole
// application's traffic to find the one it holds.
export type EventBus = TypedEventBus<EventMap>
