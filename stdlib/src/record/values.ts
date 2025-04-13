export function recordValues<K extends PropertyKey, T>(object: Record<K, T>) {
  return Object.values(object) as T[]
}
