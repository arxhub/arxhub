import PouchDB from '@arxhub/external-pouchdb/memory'
import {
  FileNotFound,
  GenericFile,
  type GenericFileOptions,
  type Mango,
  type SearchableFileSystem,
  type VirtualFile,
  type VirtualFileProps,
  type VirtualFileSystem,
} from '@arxhub/vfs'
import AsyncLock from 'async-lock'

export class PouchDBFileSystem implements SearchableFileSystem {
  private readonly actual: VirtualFileSystem
  private index: PouchDB.Database<VirtualFileProps> | null
  private lock: AsyncLock

  constructor(actual: VirtualFileSystem) {
    this.actual = actual
    this.index = null
    this.lock = new AsyncLock()
  }

  async find<T extends VirtualFileProps>(query: Mango.FindQuery<T>): Promise<VirtualFile[]> {
    const index = await this.getIndex()
    const { docs } = await index.find({
      selector: query.selector,
      fields: query.fields,
      limit: query.limit,
      skip: query.skip,
      sort: query.sort,
      use_index: query.index,
    })
    return docs.map((it) => new GenericFile(this, it))
  }

  private async getIndex(rebuild = false): Promise<PouchDB.Database<VirtualFileProps>> {
    if (!rebuild && !this.lock.isBusy() && this.index != null) return this.index

    this.index = await this.lock.acquire('index', async () => {
      const index = this.index ?? new PouchDB('vfs', { adapter: 'memory' })

      if (this.index == null) {
        await index.createIndex({ index: { fields: ['pathname', 'path', 'name', 'extension', 'type', 'kind'] } })
      }

      // There may be a performance issue, but rebuild will be called very, very rarely
      if (this.index == null || rebuild) {
        const { rows: docs } = await index.allDocs()
        await Promise.all(docs.map((it) => index.remove(it.id, it.value.rev)))

        // Maybe use bulkDocs
        for await (const file of this.actual.listFiles()) {
          await index.put({
            // Later will be some sort of uuid
            _id: file.pathname,
            ...file.props(),
          })
        }
      }

      return index
    })

    return this.index
  }

  async createIndex(name: string, fields: string[], selector?: PouchDB.Find.Selector): Promise<void> {
    const index = await this.getIndex()
    await index.createIndex({
      index: {
        name: name,
        fields: fields,
        partial_filter_selector: selector,
      },
    })
  }

  async isFileExists(pathname: string): Promise<boolean> {
    const index = await this.getIndex()
    const { docs } = await index.find({
      selector: { pathname },
      fields: ['pathname'],
      limit: 1,
    })
    return docs[0] != null
  }

  async file(pathname: string): Promise<VirtualFile> {
    const file = await this.fileOrNull(pathname)
    if (file == null) throw new FileNotFound(pathname)
    return file
  }

  async fileOrNull(pathname: string): Promise<VirtualFile | null> {
    const index = await this.getIndex()
    const resp: PouchDB.Find.FindResponse<GenericFileOptions> = await index.find({
      selector: { pathname },
      fields: ['pathname', 'fields', 'metadata', 'type', 'kind'],
      limit: 1,
    })
    const options = resp.docs[0]
    if (options == null) return null
    return new GenericFile(this, options)
  }

  async *listFiles(): AsyncGenerator<VirtualFile> {
    const index = await this.getIndex()
    const docs = await index.allDocs({ include_docs: true })
    for (const { doc } of docs.rows) {
      // biome-ignore lint/style/noNonNullAssertion: exists if `include_docs` is `true`
      yield new GenericFile(this, doc!)
    }
  }

  readTextFile(pathname: string): Promise<string> {
    return this.actual.readTextFile(pathname)
  }

  writeTextFile(pathname: string, content: string): Promise<void> {
    return this.actual.writeTextFile(pathname, content)
  }

  async refresh(): Promise<void> {
    await this.actual.refresh()
    await this.getIndex(true)
  }
}
