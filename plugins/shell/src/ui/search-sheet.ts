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
  // Icon spec string resolved by uikit's Icon registry. A row wears the icon of its TYPE — an object is
  // recognised by its name, and giving each object its own glyph would spend the column on nothing.
  icon: string
  typeId: string
  // The object's key within its type. Absent — the row stands for the type itself.
  objectKey?: string
  meta?: string
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
    { id: 'open', title: 'Currently open', empty: 'Nothing is open yet.', entries: openEntries(workspace, types) },
    { id: 'new', title: 'Open new', empty: 'No types are registered.', entries: types.all.value.map((type) => typeEntry('new', type)) },
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
      icon: type.icon,
      typeId: type.id,
      objectKey: tab.key,
      // A tab whose object is gone says so instead of naming its type: the type is the least useful
      // thing to know about a row that will not open.
      meta: tab.gone ? 'Gone' : type.title,
    }))
  })
}

// The section is part of the row's id, not decoration: an open type legitimately appears in both
// sections, and two rows sharing an id would be two rows a test cannot tell apart.
function typeEntry(section: SheetSection['id'], type: TabType): SheetEntry {
  return { id: `${section}:${type.id}`, title: type.title, icon: type.icon, typeId: type.id }
}
