import { ArxHub } from '~/core/arxhub.ts'
import { ServerPlugin } from '~/plugins/server/plugin.ts'
import { VirtualFileSystemPlugin } from '~/plugins/vfs/plugin.ts'
import { VirtualFileSystemExtension } from '~/plugins/vfs/extension.ts'
import { LocalFileSystem } from '~/plugins/vfs/local_file_system/system.ts'

const hub = new ArxHub()

hub.apply(new VirtualFileSystemPlugin())
hub.apply(new ServerPlugin())

const { vfs } = hub.extensions.getByType(VirtualFileSystemExtension)
vfs.add(new LocalFileSystem('local', `${Deno.cwd()}/arxhub/vfs/local`))

await hub.start()
