import type { Constructor } from 'type-fest'
import type { Named } from './named'

export type NamedFactory<T, A extends unknown[] = []> = Constructor<T, A> & Named
