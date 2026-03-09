import { ArxHub } from '@arxhub/core'
import GatewayServerPlugin from '@arxhub/plugin-gateway/server'

const arxhub = new ArxHub()

arxhub.plugins.register(GatewayServerPlugin)

await arxhub.start()

console.log('ArxHub server started')

process.on('SIGINT', async () => {
  console.log('\nShutting down...')
  await arxhub.stop()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await arxhub.stop()
  process.exit(0)
})
