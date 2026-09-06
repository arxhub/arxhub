import type { TObject } from '@sinclair/typebox'

// `deviceLocal: true` on a property — a plain JSON Schema annotation, ignored by validation, in the
// same family as `group` / `unit` / `enabledBy`. It says the setting describes the MACHINE rather
// than the vault (a poll interval, a local port, a device name), so it must not travel with sync.
// A plugin's config is then two files, not one:
//   storage/<plugin>/config.toml  synced   — everything else
//   state/<plugin>/config.toml    local    — the keys annotated here
export interface DeviceLocalAnnotation {
  deviceLocal?: boolean
}

export function isDeviceLocal(schema: DeviceLocalAnnotation | undefined): boolean {
  return schema?.deviceLocal === true
}

// The device-local half of a schema's top-level keys. Top-level only, on purpose: the form's field
// model reads top-level properties too, so a key is one field, one control and one file — a dotted
// name like `sync.intervalMinutes` is a single property whose name contains dots, not a nested table.
export function deviceLocalKeys(schema: TObject): Set<string> {
  const properties = (schema.properties ?? {}) as Record<string, DeviceLocalAnnotation>
  return new Set(Object.keys(properties).filter((key) => isDeviceLocal(properties[key])))
}

/**
 * The merge rule, in one sentence: **every key is owned by exactly one file — the schema says which —
 * and the owner always wins.**
 *
 * The other file is consulted only when the owning file does not carry the key at all. That is what
 * makes a key changing sides a migration rather than a reset: the value the old file still holds
 * seeds the new one until the first write, in either direction. Both files carrying the same key is
 * therefore never ambiguous — the annotation decides, not the read order — and the loser's copy stops
 * mattering the moment the owner is written.
 */
export function mergeConfig(
  deviceKeys: ReadonlySet<string>,
  synced: Record<string, unknown>,
  device: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(synced), ...Object.keys(device)])) {
    const owner = deviceKeys.has(key) ? device : synced
    const other = deviceKeys.has(key) ? synced : device
    merged[key] = key in owner ? owner[key] : other[key]
  }
  return merged
}

// The same ownership rule applied to a write: each file receives only the keys it owns.
export function splitConfig(
  deviceKeys: ReadonlySet<string>,
  data: Record<string, unknown>,
): { synced: Record<string, unknown>; device: Record<string, unknown> } {
  const synced: Record<string, unknown> = {}
  const device: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (deviceKeys.has(key)) device[key] = value
    else synced[key] = value
  }
  return { synced, device }
}

// The half of a schema one file owns. `writeConfig` defaults and stringifies everything the schema
// declares, so handing it the whole schema would materialise every key into BOTH files — each would
// then look authoritative for settings it does not own.
export function pickSchema(schema: TObject, owns: (key: string) => boolean): TObject {
  const properties = (schema.properties ?? {}) as Record<string, unknown>
  const picked = Object.fromEntries(Object.entries(properties).filter(([key]) => owns(key)))
  return { ...schema, properties: picked, required: (schema.required ?? []).filter(owns) } as TObject
}
