import { createArxHub } from './arxhub'

const arxhub = await createArxHub()

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
