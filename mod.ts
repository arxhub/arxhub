import { ArxHub } from '~/core/arxhub'
import { ServerPlugin } from '~/core/server/server_plugin.ts'
import { HealthCheckServerPlugin } from '~/core/server/healthcheck_server_plugin.ts'

const hub = new ArxHub()

hub.apply(new ServerPlugin())
hub.apply(new HealthCheckServerPlugin())

await hub.start()
