import type { BlockRole, DiffBlock, DiffBlocksModel, DiffContainer, DiffCounts, DiffStop, DiffUnit, UnitChange } from '@arxhub/plugin-diff'
import { pluralRu, wordDiff } from '@arxhub/plugin-diff'
import { Fragment, type Node, type Schema } from 'prosemirror-model'
import { versionText } from './document-history'
import { type ArxFormatConfig, isRecord } from './document-migrations'
import { deserialize } from './editor-format'
import { type BlockDifference, comparable, versionDifferences } from './version-diff'

type Move = { direction: 'up' | 'down'; distance: number }

// One place of one level of the stream, still holding its nodes: pairing and recursion need them, and only
// the finished level is turned into units.
interface Entry {
  change: UnitChange
  before: Node | null
  after: Node | null
  oldIndex: number
  index: number
  ref?: string
  move?: Move
  ghost?: boolean
  // Off the preserved order (see BlockDifference.displaced); an equal block never is.
  displaced?: boolean
}

const ITEM_TYPES = new Set(['list_item', 'task_item'])

const TYPE_NAMES: Record<string, string> = {
  paragraph: 'абзац',
  heading: 'заголовок',
  code_block: 'код',
  blockquote: 'цитата',
  bullet_list: 'список',
  ordered_list: 'нумерованный список',
  task_list: 'задачи',
  list_item: 'пункт',
  task_item: 'задача',
  callout: 'выноска',
  section: 'раздел',
  columns: 'колонки',
  column: 'колонка',
  table: 'таблица',
  table_row: 'строка таблицы',
  horizontal_rule: 'разделитель',
  image: 'изображение',
}

const CONTAINER_LABELS: Record<string, string> = {
  bullet_list: 'Список',
  ordered_list: 'Список',
  task_list: 'Задачи',
  blockquote: 'Цитата',
  callout: 'Выноска',
  columns: 'Колонки',
  column: 'Колонка',
  table: 'Таблица',
  list_item: 'Пункт',
  task_item: 'Задача',
  table_cell: 'Ячейка',
  table_header: 'Ячейка',
}

// Attributes a note already names in words, so "изменены свойства" does not repeat them.
const DESCRIBED_ATTRS = new Set(['arxId', 'checked', 'level', 'language'])

export function arxDiffTexts(schema: Schema, left: string, right: string, format?: ArxFormatConfig): DiffBlocksModel {
  return arxDiffNodes(deserialize(schema, left, format), deserialize(schema, right, format))
}

export function arxDiffNodes(before: Node, after: Node): DiffBlocksModel {
  const refs = new Map<DiffUnit, string>()
  const units = level(before, after, '', refs)
  const metadata = metadataUnit(before, after)
  if (metadata) units.unshift(metadata)
  const stops: DiffStop[] = []
  // Every stop inside a top-level block carries that block's restore key: restoring is per top-level block.
  for (const unit of units) assignStops(unit, stops, refs.get(unit))
  const counts: DiffCounts = { added: 0, removed: 0, changed: 0 }
  for (const stop of stops) {
    if (stop.change === 'added') counts.added++
    else if (stop.change === 'removed') counts.removed++
    else counts.changed++
  }
  return { format: 'blocks', units, stops, counts, identical: stops.length === 0 }
}

// ---------------------------------------------------------------------------------------------- metadata

// Properties and appearance live on the doc node's envelope, not among its children, so the block stream alone
// would call a file whose tags or icon changed identical. They are one unit ahead of the body, with no restore ref
// (the history restores body blocks only).
function metadataUnit(before: Node, after: Node): DiffBlock | null {
  const notes: string[] = []
  const oldProps = propertyAttrs(before)
  const newProps = propertyAttrs(after)
  const keys = [...new Set([...Object.keys(oldProps), ...Object.keys(newProps)])].filter(
    (key) => JSON.stringify(oldProps[key]) !== JSON.stringify(newProps[key]),
  )
  if (keys.length) notes.push(`изменены свойства документа: ${keys.join(', ')}`)
  const oldLook = appearanceOf(before)
  const newLook = appearanceOf(after)
  if (JSON.stringify(oldLook.icon) !== JSON.stringify(newLook.icon)) notes.push('изменена иконка')
  if (JSON.stringify(oldLook.cover) !== JSON.stringify(newLook.cover)) notes.push('изменена обложка')
  if (!notes.length) return null
  return {
    kind: 'block',
    id: 'props',
    change: 'changed',
    role: 'other',
    segments: [{ kind: 'equal', text: 'Свойства документа' }],
    note: notes.join(' · '),
  }
}

function propertyAttrs(doc: Node): Record<string, unknown> {
  const raw: unknown = doc.attrs.arxEnvelope?.properties?.attrs
  if (!isRecord(raw)) return {}
  const { arxId: _id, ...rest } = raw
  return rest
}

function appearanceOf(doc: Node): { icon: unknown; cover: unknown } {
  const raw: unknown = doc.attrs.arxEnvelope?.envelope?.appearance
  return isRecord(raw) ? { icon: raw.icon ?? null, cover: raw.cover ?? null } : { icon: null, cover: null }
}

// ---------------------------------------------------------------------------------------------- one level

// `refs` is given at the top level only, where each unit's versionDifferences key is recorded.
function level(before: Node, after: Node, scope: string, refs?: Map<DiffUnit, string>): DiffUnit[] {
  let entries = streamOf(before, after)
  // Inside a container a block that lost its id or was retyped reads better as one edit than as a removal
  // beside an addition; at the top level each side keeps its own key, because restore acts on keys.
  if (!refs) entries = pairRuns(entries)
  return entries.map((entry) => {
    const unit = unitOf(entry, `${scope}${entryKey(entry)}`)
    if (refs && entry.ref) refs.set(unit, entry.ref)
    return unit
  })
}

function entryKey(entry: Entry): string {
  if (entry.ghost) return `g${entry.oldIndex}`
  if (entry.index < 0) return `o${entry.oldIndex}`
  return `n${entry.index}`
}

function streamOf(before: Node, after: Node): Entry[] {
  const differences = versionDifferences(after, before)
  const byNew = new Map<number, BlockDifference>()
  const removed: BlockDifference[] = []
  const listedOld = new Set<number>()
  for (const difference of differences) {
    if (difference.index >= 0) byNew.set(difference.index, difference)
    if (difference.oldIndex >= 0) listedOld.add(difference.oldIndex)
    if (difference.kind === 'removed') removed.push(difference)
  }
  // Unchanged blocks in their preserved order are the only matches versionDifferences does not list, and
  // both sides' leftovers are increasing sequences of the same length — so they pair in order.
  const equalOld = [...before.children.keys()].filter((i) => !listedOld.has(i))
  const equalNew = [...after.children.keys()].filter((i) => !byNew.has(i))
  const equalMatch = new Map<number, number>(equalNew.map((index, i) => [index, equalOld[i]]))

  const stream: Entry[] = after.children.map((node, index): Entry => {
    const difference = byNew.get(index)
    if (!difference) {
      const oldIndex = equalMatch.get(index) ?? -1
      return { change: 'equal', before: before.maybeChild(oldIndex) ?? null, after: node, oldIndex, index }
    }
    return {
      change: difference.kind,
      before: difference.before,
      after: node,
      oldIndex: difference.oldIndex,
      index,
      ref: difference.key,
      displaced: difference.displaced === true,
    }
  })

  const matchedOld = stream.filter((entry) => entry.oldIndex >= 0).map((entry) => entry.oldIndex)
  const oldRank = new Map([...matchedOld].sort((a, b) => a - b).map((oldIndex, rank) => [oldIndex, rank]))
  let newRank = 0
  for (const entry of stream) {
    if (entry.oldIndex < 0) continue
    if (entry.displaced) {
      const from = oldRank.get(entry.oldIndex) ?? newRank
      entry.move = { direction: newRank < from ? 'up' : 'down', distance: Math.max(1, Math.abs(from - newRank)) }
    }
    newRank++
  }

  const placedAtOld: Entry[] = [
    ...removed.map(
      (difference): Entry => ({
        change: 'removed',
        before: difference.before,
        after: null,
        oldIndex: difference.oldIndex,
        index: -1,
        ref: difference.key,
      }),
    ),
    // The ghost is the OLD block: a block both moved and edited shows its old text at its old place.
    ...stream
      .filter((entry) => entry.displaced)
      .map((entry): Entry => ({ ...entry, change: 'moved', after: null, ghost: true, ref: undefined })),
  ].sort((a, b) => a.oldIndex - b.oldIndex)
  for (const entry of placedAtOld) {
    const at = stream.findIndex((other) => anchorsOldOrder(other) && other.oldIndex > entry.oldIndex)
    if (at < 0) stream.push(entry)
    else stream.splice(at, 0, entry)
  }
  return stream
}

// What keeps its old position in the new stream: a removal, a ghost, and a matched block on the preserved order —
// a changed block that was also moved is not one, or a removal would be placed beside its new position.
function anchorsOldOrder(entry: Entry): boolean {
  return entry.oldIndex >= 0 && !entry.displaced
}

function pairRuns(entries: Entry[]): Entry[] {
  const result = [...entries]
  let start = 0
  while (start < result.length) {
    if (!isLoose(result[start])) {
      start++
      continue
    }
    let end = start
    while (end < result.length && (isLoose(result[end]) || result[end].ghost)) end++
    const run = result.slice(start, end)
    const removed = run.filter((entry) => entry.change === 'removed' && !entry.ghost)
    const added = run.filter((entry) => entry.change === 'added')
    const drop = new Set<Entry>()
    for (let i = 0; i < Math.min(removed.length, added.length); i++) {
      const gone = removed[i]
      const came = added[i]
      if (gone.before?.type !== came.after?.type) continue
      drop.add(gone)
      result[result.indexOf(came)] = { ...came, change: 'changed', before: gone.before, oldIndex: gone.oldIndex }
    }
    const kept = result.slice(start, end).filter((entry) => !drop.has(entry))
    result.splice(start, end - start, ...kept)
    start += kept.length
  }
  return result
}

function isLoose(entry: Entry): boolean {
  return !entry.ghost && (entry.change === 'removed' || entry.change === 'added')
}

// ---------------------------------------------------------------------------------------------- units

function unitOf(entry: Entry, id: string): DiffUnit {
  const node = (entry.change === 'removed' ? entry.before : entry.after) ?? entry.before
  if (!node) return leaf(id, 'equal', null, null)
  if (entry.change === 'changed' && entry.before && entry.after) {
    const unit = changedUnit(entry.before, entry.after, id)
    // The note stays the edit's own; the view says "перемещён" from `move`, per column.
    if (entry.move) unit.move = entry.move
    return unit
  }
  const unit = plain(node, id, entry.change)
  if (entry.move) {
    unit.move = entry.move
    unit.note = entry.ghost ? `было здесь · перемещён ${directionWord(entry.move)}` : movedNote(entry.move)
  }
  if (entry.ghost) unit.ghost = true
  return unit
}

function directionWord(move: Move): string {
  return move.direction === 'up' ? 'выше' : 'ниже'
}

function movedNote(move: Move): string {
  return `перемещён ${directionWord(move)} на ${move.distance} ${pluralRu(move.distance, 'блок', 'блока', 'блоков')}`
}

// A block drawn as it is on one side: a leaf, or a container whose children all read as unchanged — the
// tint of the whole says what happened to it.
function plain(node: Node, id: string, change: UnitChange): DiffUnit {
  if (!isContainer(node)) return leaf(id, change, change === 'removed' ? node : null, change === 'removed' ? null : node)
  const { head, rest } = split(node)
  const children = rest.map((child, i) => plain(child, `${id}/${i}`, 'equal'))
  const container: DiffContainer = {
    kind: 'container',
    id,
    change,
    label: labelOf(node),
    summary: `${labelOf(node)} · ${children.length} ${pluralRu(children.length, 'пункт', 'пункта', 'пунктов')}`,
    children,
  }
  if (head) container.head = leaf(`${id}/head`, 'equal', null, head, node)
  return container
}

function changedUnit(before: Node, after: Node, id: string): DiffUnit {
  if (before.type !== after.type || (!isContainer(before) && !isContainer(after))) return leaf(id, 'changed', before, after)
  const oldParts = split(before)
  const newParts = split(after)
  const children = level(before.copy(Fragment.from(oldParts.rest)), after.copy(Fragment.from(newParts.rest)), `${id}/`)
  const container: DiffContainer = {
    kind: 'container',
    id,
    change: 'changed',
    label: labelOf(after),
    summary: '',
    children,
  }
  if (newParts.head || oldParts.head) {
    const headBefore = oldParts.head ?? null
    const headAfter = newParts.head ?? null
    const headChange: UnitChange =
      headBefore && headAfter
        ? comparable(headBefore) === comparable(headAfter) && before.attrs.checked === after.attrs.checked
          ? 'equal'
          : 'changed'
        : headAfter
          ? 'added'
          : 'removed'
    container.head = leaf(`${id}/head`, headChange, headBefore, headAfter, after, before)
  }
  const own = attributeNotes(before, after, { ignoreText: true })
  if (own.length && !container.head) container.note = own.join(' · ')
  const changed = children.filter((child) => !child.ghost && child.change !== 'equal').length
  container.summary = `${container.label} · ${changed} ${pluralRu(changed, 'пункт изменён', 'пункта изменено', 'пунктов изменено')} из ${children.filter((child) => !child.ghost && child.change !== 'removed').length}`
  return container
}

function leaf(id: string, change: UnitChange, before: Node | null, after: Node | null, wrapper?: Node, wrapperBefore?: Node): DiffBlock {
  const shown = after ?? before
  const outer = wrapper ?? shown
  const block: DiffBlock = { kind: 'block', id, change, role: roleOf(outer), segments: [] }
  if (!shown || !outer) return block
  if (outer.type.name === 'heading') block.level = outer.attrs.level
  if (outer.type.name === 'task_item') {
    const afterWrapper = wrapper ?? after
    const beforeWrapper = wrapperBefore ?? before
    block.checked = Boolean((change === 'removed' ? beforeWrapper : (afterWrapper ?? beforeWrapper))?.attrs.checked)
    if (change === 'changed' && beforeWrapper) block.checkedBefore = Boolean(beforeWrapper.attrs.checked)
  }
  if (change !== 'changed' || !before || !after) {
    block.segments = [{ kind: 'equal', text: textOf(shown) }]
    return block
  }
  const beforeText = textOf(before)
  const afterText = textOf(after)
  block.segments = beforeText === afterText ? [{ kind: 'equal', text: afterText }] : wordDiff(beforeText, afterText)
  const ignoreText = beforeText !== afterText
  const notes = attributeNotes(wrapperBefore ?? before, wrapper ?? after, { ignoreText })
  if (wrapper && wrapperBefore) notes.push(...attributeNotes(before, after, { ignoreText }).filter((note) => !notes.includes(note)))
  if (notes.length) block.note = notes.join(' · ')
  return block
}

// A change the text does not show, said in words. `ignoreText` suppresses the formatting fallback when the
// words themselves changed (they already account for the difference).
function attributeNotes(before: Node, after: Node, options: { ignoreText: boolean }): string[] {
  const notes: string[] = []
  if (before.type !== after.type) notes.push(`${typeName(before)} → ${typeName(after)}`)
  if (before.type.name === 'task_item' && after.type.name === 'task_item' && Boolean(before.attrs.checked) !== Boolean(after.attrs.checked))
    notes.push(after.attrs.checked ? 'задача отмечена' : 'отметка снята')
  if (before.type.name === 'heading' && after.type.name === 'heading' && before.attrs.level !== after.attrs.level)
    notes.push(`заголовок: уровень ${before.attrs.level} → ${after.attrs.level}`)
  if (before.type.name === 'code_block' && after.type.name === 'code_block' && before.attrs.language !== after.attrs.language)
    notes.push(`язык: ${before.attrs.language || 'нет'} → ${after.attrs.language || 'нет'}`)
  if (before.type === after.type) {
    const keys = new Set([...Object.keys(before.attrs), ...Object.keys(after.attrs)])
    const changed = [...keys].filter(
      (key) => !DESCRIBED_ATTRS.has(key) && JSON.stringify(before.attrs[key]) !== JSON.stringify(after.attrs[key]),
    )
    if (changed.length) notes.push(`изменены свойства: ${changed.join(', ')}`)
  }
  if (!notes.length && !options.ignoreText && !isContainer(after) && comparable(before) !== comparable(after))
    notes.push('изменено форматирование')
  return notes
}

// ---------------------------------------------------------------------------------------------- shapes

// A list or task item holding only its paragraph reads as one line; a table row reads as its cells.
function collapses(node: Node): boolean {
  if (ITEM_TYPES.has(node.type.name)) return node.childCount === 1 && node.firstChild?.type.name === 'paragraph'
  return node.type.name === 'table_row'
}

function isContainer(node: Node): boolean {
  if (node.isTextblock || node.isAtom || collapses(node)) return false
  return Boolean(node.firstChild?.isBlock)
}

// An item that nests blocks keeps its own first paragraph as the head drawn above the children.
function split(node: Node): { head?: Node; rest: readonly Node[] } {
  const children = node.children
  if (ITEM_TYPES.has(node.type.name) && children[0]?.type.name === 'paragraph') return { head: children[0], rest: children.slice(1) }
  return { rest: children }
}

function roleOf(node: Node | null): BlockRole {
  switch (node?.type.name) {
    case 'paragraph':
      return 'paragraph'
    case 'heading':
      return 'heading'
    case 'code_block':
      return 'code'
    case 'task_item':
      return 'task'
    case 'list_item':
      return 'item'
    case 'table_row':
      return 'row'
    default:
      return 'other'
  }
}

function textOf(node: Node): string {
  if (node.isTextblock) return node.textContent
  if (collapses(node)) {
    if (node.type.name === 'table_row') return node.children.map((cell) => cell.textContent).join(' | ')
    return node.firstChild?.textContent ?? ''
  }
  return versionText(node) || node.textContent || node.type.name
}

function typeName(node: Node): string {
  return TYPE_NAMES[node.type.name] ?? node.type.name
}

function labelOf(node: Node): string {
  if (node.type.name === 'section') return `Раздел «${String(node.attrs.title)}»`
  return CONTAINER_LABELS[node.type.name] ?? node.type.name
}

// ---------------------------------------------------------------------------------------------- stops

// Returns whether anything below (or the unit itself) became a stop.
function assignStops(unit: DiffUnit, stops: DiffStop[], ref: string | undefined): boolean {
  if (unit.ghost || unit.change === 'equal') return false
  const push = (target: DiffBlock | DiffContainer, change: DiffStop['change']) => {
    target.stop = stops.length
    stops.push({ index: stops.length, target: target.id, change, ...(ref ? { ref } : {}) })
  }
  if (unit.kind === 'block') {
    push(unit, unit.change)
    return true
  }
  if (unit.change !== 'changed') {
    push(unit, unit.change)
    return true
  }
  let any = false
  if (unit.head && unit.head.change !== 'equal') {
    push(unit.head, unit.head.change)
    any = true
  }
  for (const child of unit.children) any = assignStops(child, stops, ref) || any
  // Only the container's own attributes changed (a callout's type, a section's title): nothing below carries
  // the change, so the container itself is where navigation stops.
  if (!any) {
    unit.note ??= 'изменено форматирование'
    push(unit, 'changed')
  }
  return true
}
