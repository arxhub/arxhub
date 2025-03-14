import { type ConfigEnv, type UserConfig, mergeConfig } from 'vite'
import { createGenericConfig } from './generic'

export function createBrowserConfig(dirname: string, env: ConfigEnv): UserConfig {
  return mergeConfig(createGenericConfig(dirname, env), {} satisfies UserConfig)
}
