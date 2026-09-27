import { readText } from '@arxhub/i18n'
import { t } from '../i18n/messages'
import type { TabType } from './tab-type'
import type { TabTypeRegistry } from './tab-type-registry'
import type { Workspace } from './workspace'

// One row of the sheet, and the only shape either frame draws. What a row DOES is decided by whether it
// carries an object key, not by which section it came from: a section is a reading aid, and duplicating
// "how to activate this" per section is how the two frames would drift apart again.
export interface SheetEntry {
  // Unique across the whole sheet: the row key, and what a test addresses.
  id: string
  title: string
  // Icon spec string resolved by uikit's Icon registry. A row wears the icon of its type, or of its kind of
  // object where the type holds several (a workbook among documents) — the same glyph its tab and tree
  // row wear.
  icon: string
  typeId: string
  // The object's key within its type. Absent — the row stands for the type itself.
  objectKey?: string
  // A quiet fact on the trailing edge: which type an object row belongs to.
  meta?: string
  // A second line under the title: what the type holds right now ("3 open") or what it is for. The phone's
  // rows of types carry it; a row of the desktop's objects has its type as `meta` instead.
  detail?: string
  // The type the person is in right now — the row wears the selection instead of offering to switch.
  current?: boolean
}

export interface SheetSection {
  id: 'open' | 'new'
  title: string
  entries: SheetEntry[]
  // What the section says while it holds nothing. A guaranteed section says it is empty rather than
  // disappearing: a section that comes and goes makes the reader wonder whether it exists at all, which
  // is exactly what "two guaranteed sections" was written against.
  empty: string
}

// The whole sheet: everything that is open, and everything that can be opened. Both sections are always
// present and both are complete — there is no "show all", and no third source (vault objects) yet.
//
// There is deliberately no query field. The two sections are short and bounded, so a filter over them
// would be noise; and a text field in a sheet the person reads as "search" would promise the vault,
// which this sheet cannot answer until the objects section exists.
export function sheetSections(workspace: Workspace, types: TabTypeRegistry): SheetSection[] {
  return [
    { id: 'open', title: t('sheet.open'), empty: t('sheet.openEmpty'), entries: openEntries(workspace, types) },
    { id: 'new', title: t('sheet.new'), empty: t('sheet.newEmpty'), entries: types.all.value.map((type) => typeEntry('new', type)) },
  ]
}

// The phone's "More": the same two sections at the level of TYPES. The objects inside a type are one tap
// away on the phone already — a second tap on the type lists them — so repeating every open document here
// would turn a list of a handful of mini-apps into a list someone has to search, and this sheet
// deliberately has no search. `shown` is what the type row has keys for; an open type without one says so,
// because this sheet is then the only road back to it.
export function typeSections(workspace: Workspace, types: TabTypeRegistry, shown: ReadonlySet<string>): SheetSection[] {
  const open = workspace.openTypeIds.value.flatMap((typeId) => types.get(typeId) ?? [])
  const openIds = new Set(open.map((type) => type.id))
  const active = workspace.activeTypeId.value
  return [
    {
      id: 'open',
      title: t('sheet.open'),
      empty: t('sheet.openEmpty'),
      entries: open.map((type) => {
        const count = workspace.tabsOf(type.id).length
        const detail = [
          count > 0 ? t('sheet.openCount', { count }) : (type.summary?.() ?? null),
          shown.has(type.id) ? null : t('sheet.notInRow'),
        ]
          .filter((part) => part != null && part !== '')
          .join(' · ')
          .replace(/^./, (first) => first.toUpperCase())
        return { ...typeEntry('open', type), ...(detail ? { detail } : {}), current: type.id === active }
      }),
    },
    {
      id: 'new',
      title: t('sheet.new'),
      empty: t('sheet.allOpen'),
      entries: types.all.value
        .filter((type) => !openIds.has(type.id))
        .map((type) => {
          const detail = type.summary?.()
          return { ...typeEntry('new', type), ...(detail ? { detail } : {}) }
        }),
    },
  ]
}

// Open or switch to — one operation, and the row does not know which of the two it turned out to be.
// Both paths go through `Workspace`, so the de-duplication ("already open" means "activate") stays in
// the one place that owns it.
export function chooseEntry(workspace: Workspace, entry: SheetEntry): void {
  if (entry.objectKey == null) workspace.activateType(entry.typeId)
  else workspace.activateObject(entry.typeId, entry.objectKey)
}

function openEntries(workspace: Workspace, types: TabTypeRegistry): SheetEntry[] {
  return workspace.openTypeIds.value.flatMap((typeId) => {
    const type = types.get(typeId)
    if (type == null) return []
    const tabs = workspace.tabsOf(typeId)
    // A type with nothing inside it is still open, and saying so is not padding: Settings holds no
    // objects at all, and a fresh desk holds a type and no note — omitting either would make the
    // section quietly lie about what is open.
    if (tabs.length === 0) return [typeEntry('open', type)]
    return tabs.map((tab) => ({
      id: `open:${type.id}:${tab.key}`,
      title: tab.title,
      icon: tab.icon ?? type.icon,
      typeId: type.id,
      objectKey: tab.key,
      // A tab whose object is gone says so instead of naming its type: the type is the least useful
      // thing to know about a row that will not open.
      meta: tab.gone ? t('tabs.gone') : readText(type.title),
    }))
  })
}

// The section is part of the row's id, not decoration: an open type legitimately appears in both
// sections, and two rows sharing an id would be two rows a test cannot tell apart.
function typeEntry(section: SheetSection['id'], type: TabType): SheetEntry {
  return { id: `${section}:${type.id}`, title: readText(type.title), icon: type.icon, typeId: type.id }
}
