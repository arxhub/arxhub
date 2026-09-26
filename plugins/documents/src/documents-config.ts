import { type Static, Type } from '@sinclair/typebox'

// OR-03: hides the extension of a file some registered viewer claims — never a hand-written list, see
// NotesExtension.displayName. It sits with the type rather than with the tree because every surface that
// names a file reads the same answer, and a setting owned by one of them would be the product deciding
// twice. Synced (no `deviceLocal`), because a vault should read the same on every device it opens on.
// The key is dotted to match the settings kit's convention (search-config.ts is the worked example).
export const NotesConfigSchema = Type.Object(
  {
    'names.hideKnownExtensions': Type.Boolean({
      title: 'Hide known extensions',
      description:
        'A file whose extension a registered viewer recognises (".arx", ".md", …) shows its name only — in the tree and above the open document alike. The extension is still there on disk, and switching this off is how one is renamed.',
      group: 'Names',
      default: true,
    }),
  },
  { description: 'How ArxHub names the files it can open.' },
)

export type NotesConfig = Static<typeof NotesConfigSchema>

export const DEFAULT_HIDE_KNOWN_EXTENSIONS = true

// A config file is a file: an older build wrote it, a hand can edit it, and readConfig applies defaults
// without validating — so the value is read defensively, same rule as every other schema in the repo
// (see search-config.ts's toSearchSettings).
export function toHideKnownExtensions(config: Partial<NotesConfig>): boolean {
  const value = config['names.hideKnownExtensions']
  return typeof value === 'boolean' ? value : DEFAULT_HIDE_KNOWN_EXTENSIONS
}
