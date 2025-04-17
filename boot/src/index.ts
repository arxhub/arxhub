import { ArxHub } from '@arxhub/core'
import GatewayVFSPlugin from '@arxhub/plugin-gateway-vfs/server'
import GatewayPlugin from '@arxhub/plugin-gateway/server'
import { LocalFileSystem, VirtualFileSystemExtension } from '@arxhub/plugin-vfs/api'
import VFSPlugin from '@arxhub/plugin-vfs/server'
import WebAppPlugin from '@arxhub/plugin-web-app/server'

const hub = new ArxHub(VFSPlugin, GatewayPlugin, GatewayVFSPlugin, WebAppPlugin)

const { vfs } = hub.extensions.get(VirtualFileSystemExtension)
vfs.mount('/local', new LocalFileSystem('data'))

await hub.start()
