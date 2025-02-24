import { NamedContainer } from '~/stdlib/named_container.ts'
import { VirtualFileSystem } from '~/plugins/vfs/system.ts'

export class CompositeFileSystem extends NamedContainer<VirtualFileSystem> {
}
