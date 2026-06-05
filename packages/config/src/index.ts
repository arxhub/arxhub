import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Static, TObject } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { parse, stringify } from 'smol-toml'

const CONFIG_DIR = 'config'

function configPath(pluginId: string): string {
  return `${CONFIG_DIR}/${pluginId}.toml`
}

export async function readConfig<S extends TObject>(
  vfs: VirtualFileSystem,
  pluginId: string,
  schema: S,
): Promise<Static<S>> {
  const path = configPath(pluginId)
  const raw = (await vfs.exists(path)) ? parse(await vfs.file(path).readText()) : {}
  return Value.Default(schema, raw) as Static<S>
}

export async function writeConfig<S extends TObject>(
  vfs: VirtualFileSystem,
  pluginId: string,
  schema: S,
  data: Partial<Static<S>>,
): Promise<void> {
  const path = configPath(pluginId)
  const existing = await readConfig(vfs, pluginId, schema)
  const merged = { ...existing, ...data }
  await vfs.file(path).writeText(stringify(merged as Record<string, unknown>))
}
