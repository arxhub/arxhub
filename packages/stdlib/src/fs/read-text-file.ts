import { readFile } from 'node:fs/promises'

export async function readTextFile(pathname: string): Promise<string> {
  return readFile(pathname, 'utf8')
}
