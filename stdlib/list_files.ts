export async function* listFiles(rootDir: string): AsyncIterable<string> {
  const queue: string[] = [rootDir]
  while (queue.length > 0) {
    const dir = queue.shift()!
    const files = Deno.readDir(dir)

    for await (const file of files) {
      if (file.isDirectory) {
        queue.push(`${dir}/${file.name}`)
        continue
      }

      yield `${dir}/${file.name}`
    }
  }
}
