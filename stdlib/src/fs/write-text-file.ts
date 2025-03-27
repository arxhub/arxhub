import { writeFile } from 'node:fs/promises'

export async function writeTextFile(pathname: string, data: string): Promise<void> {
  return writeFile(pathname, data, 'utf8')
}
