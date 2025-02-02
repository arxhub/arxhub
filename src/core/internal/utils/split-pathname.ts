export function splitPathname(pathname: string) {
  const lastSlashIndex = pathname.lastIndexOf('/')
  const path = pathname.substring(0, lastSlashIndex)
  const filename = pathname.substring(lastSlashIndex + 1)
  const lastDotIndex = filename.lastIndexOf('.')
  const name = lastDotIndex === -1 ? filename : filename.substring(0, lastDotIndex)
  const ext = lastDotIndex === -1 ? '' : filename.substring(lastDotIndex)
  return { path, name, ext }
}
