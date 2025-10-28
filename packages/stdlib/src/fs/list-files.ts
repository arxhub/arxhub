import { readdir, stat } from 'node:fs/promises'

export async function* listFiles(rootDir: string): AsyncGenerator<string> {
  const queue: string[] = [rootDir]
  while (queue.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: Checked by while condition
    const dir = queue.shift()!

    const file = await stat(dir)
    if (file.isFile()) {
      yield dir
      continue
    }

    const files = await readdir(dir, { withFileTypes: true })

    for (const file of files) {
      const filePath = `${dir}/${file.name}`

      if (file.isDirectory()) {
        queue.push(filePath)
        continue
      }

      yield filePath
    }
  }
}
