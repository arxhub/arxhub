import { NamedContainer } from '~/stdlib/named_container.ts'
import { VirtualFileSystem } from '~/plugins/vfs/api/mod.ts'

export class CompositeFileSystem extends NamedContainer<VirtualFileSystem> {
}