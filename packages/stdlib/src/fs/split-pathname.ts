export function splitPathname(pathname: string) {
  const lastSlashIndex = pathname.lastIndexOf('/')
  const path = lastSlashIndex === -1 ? '' : pathname.substring(0, lastSlashIndex)
  const filename = lastSlashIndex === -1 ? pathname : pathname.substring(lastSlashIndex + 1)

  // Handle special case for dotfiles (like .gitignore)
  if (filename.startsWith('.') && filename.indexOf('.', 1) === -1) {
    return { path, name: filename, ext: '' }
  }

  const lastDotIndex = filename.lastIndexOf('.')
  const name = lastDotIndex === -1 ? filename : filename.substring(0, lastDotIndex)
  const ext = lastDotIndex === -1 ? '' : filename.substring(lastDotIndex + 1)

  return { path, name, ext }
}
