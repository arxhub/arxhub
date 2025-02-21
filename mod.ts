import { ArxHub } from '~/core/arxhub'
import { ServerPlugin } from '~/core/server/server_plugin.ts'

const hub = new ArxHub()

hub.apply(new ServerPlugin())

await hub.start()
