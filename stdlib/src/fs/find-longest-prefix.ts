export function findLongestPrefix(prefixes: string[], target: string): string | undefined {
  const sortedPrefixes = [...prefixes].sort((a, b) => b.length - a.length)
  return sortedPrefixes.find((prefix) => target === prefix || target.startsWith(`${prefix}/`))
}
