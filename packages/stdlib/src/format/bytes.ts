// A size as a person reads it: binary steps, one decimal under 100 of a unit, none above.
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}
