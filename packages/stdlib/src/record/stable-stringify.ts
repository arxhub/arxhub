// Deterministic JSON serialization: object keys are sorted recursively so that the same logical
// value always produces the same string regardless of insertion order. Plain JSON.stringify
// preserves insertion order, which can differ across devices/runs for otherwise-identical data —
// breaking any content-addressed hashing built on top of it (e.g. sync snapshot hashes, which must
// be insertion-order independent so identical file sets dedupe across devices).
//
// stableStringify({}) === '{}' === JSON.stringify({}), so it is interchangeable with the plain form
// for the empty-object base case.
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`
}
