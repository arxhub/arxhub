export async function isFileExists(path: string): Promise<boolean> {
  try {
    await Deno.lstat(path)
    return true
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) throw err
    return false
  }
}
