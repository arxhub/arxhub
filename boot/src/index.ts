import { ArxHub } from '@arxhub/core'
import GatewayVFSPlugin from '@arxhub/plugin-gateway-vfs/server'
import GatewayPlugin from '@arxhub/plugin-gateway/server'
import { LocalFileSystem, VirtualFileSystemServerExtension } from '@arxhub/plugin-vfs/api'
import VFSPlugin from '@arxhub/plugin-vfs/server'
import WebAppPlugin from '@arxhub/plugin-web-app/server'

const hub = new ArxHub([VFSPlugin, GatewayPlugin, GatewayVFSPlugin, WebAppPlugin])

if (import.meta.hot) {
  const prev = import.meta.hot.data.hub
  if (prev != null) {
    prev?.stop()
    console.log('--- VITE NODE HOT UPDATED ---')
  }
  import.meta.hot.data.hub = hub
}

const vfs = hub.extensions.get(VirtualFileSystemServerExtension)
vfs.mount('/local', new LocalFileSystem('data'))

await hub.start()
