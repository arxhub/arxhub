import type { EventEmitter } from 'eventemitter3'
import type { EventMap } from './event-map'

export type { EventMap } from './event-map'
export type EventBus = EventEmitter<EventMap>
