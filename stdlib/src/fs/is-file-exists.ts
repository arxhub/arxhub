import { stat } from 'node:fs/promises'

export async function isFileExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (err) {
    if (err != null && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return false
    throw err
  }
}
