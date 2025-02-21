import { ArxHub } from './core/arxhub.ts'
import { ServerPlugin } from './plugins/server/plugin.ts'

const hub = new ArxHub()

hub.apply(new ServerPlugin())

await hub.start()
