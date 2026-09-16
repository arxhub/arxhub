export { type BootClientDeps, type BootClientOptions, type BootedClient, bootClient } from './client/boot-client'
export {
  CLIENT_COMPOSITION,
  type CompositionRules,
  checkComposition,
  checkRegisteredComposition,
  type RegisteredPlugin,
  registeredPlugins,
} from './composition'
export { bootComposition, bootCompositionErrorSchema } from './errors'
