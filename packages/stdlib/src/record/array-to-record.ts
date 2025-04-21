import type { Named } from '../collections/named'

export function arrayToRecord<T extends Named>(arr: T[]): Record<string, T> {
  return arr.reduce(
    (acc, it) => {
      acc[it.name] = it
      return acc
    },
    {} as Record<string, T>,
  )
}
