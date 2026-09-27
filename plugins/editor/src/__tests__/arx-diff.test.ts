import { setLanguagePreference } from '@arxhub/i18n'
import type { DiffBlock, DiffBlocksModel, DiffContainer, DiffUnit } from '@arxhub/plugin-diff'
import { type Node, Schema } from 'prosemirror-model'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { arxDiffNodes, arxDiffTexts } from '../arx-diff'
import { identityNodes } from '../block-identity'
import { schema as base } from '../editor-schema'
import { versionDifferences } from '../version-diff'

const schema = new Schema({ nodes: identityNodes(base.spec.nodes), marks: base.spec.marks })
const p = (id: string, text = id) => schema.node('paragraph', { arxId: id }, text ? schema.text(text) : undefined)
const doc = (...blocks: Node[]) => schema.node('doc', null, blocks)
const item = (id: string, text = id, ...nested: Node[]) => schema.node('list_item', { arxId: id }, [p(`${id}-p`, text), ...nested])
const list = (id: string, ...items: Node[]) => schema.node('bullet_list', { arxId: id }, items)
const task = (id: string, checked: boolean, text = id) => schema.node('task_item', { arxId: id, checked }, [p(`${id}-p`, text)])
const tasks = (id: string, ...items: Node[]) => schema.node('task_list', { arxId: id }, items)

// The diff's words were written in Russian first; the assertions stay in that language, which also
// exercises the one/few/many plural forms the English catalog does not have.
beforeAll(() => setLanguagePreference('ru'))
afterAll(() => setLanguagePreference('system'))

function visible(model: DiffBlocksModel): DiffUnit[] {
  return model.units.filter((unit) => !unit.ghost)
}

function invariant(model: DiffBlocksModel) {
  expect(model.counts.added + model.counts.removed + model.counts.changed).toBe(model.stops.length)
  const stopped = new Map<string, number | undefined>()
  const walk = (unit: DiffUnit | undefined) => {
    if (!unit) return
    stopped.set(unit.id, unit.stop)
    if (unit.kind === 'container') {
      walk(unit.head)
      unit.children.forEach(walk)
    }
  }
  model.units.forEach(walk)
  for (const [index, stop] of model.stops.entries()) {
    expect(stop.index).toBe(index)
    expect(stopped.get(stop.target)).toBe(index)
  }
  expect(model.identical).toBe(model.stops.length === 0)
}

describe('arx differ', () => {
  it('reports identical documents with no stops', () => {
    const model = arxDiffNodes(doc(p('a'), list('l', item('x'))), doc(p('a'), list('l', item('x'))))
    expect(model.identical).toBe(true)
    expect(model.stops).toEqual([])
    expect(model.units.every((unit) => unit.change === 'equal')).toBe(true)
    invariant(model)
  })

  it('diffs a changed paragraph word by word', () => {
    const model = arxDiffNodes(doc(p('a', 'the quick fox')), doc(p('a', 'the slow fox')))
    const [unit] = model.units as DiffBlock[]
    expect(unit.change).toBe('changed')
    expect(unit.role).toBe('paragraph')
    expect(unit.segments.filter((s) => s.kind === 'removed').map((s) => s.text)).toEqual(['quick'])
    expect(unit.segments.filter((s) => s.kind === 'added').map((s) => s.text)).toEqual(['slow'])
    expect(unit.note).toBeUndefined()
    expect(model.counts).toEqual({ added: 0, removed: 0, changed: 1 })
    invariant(model)
  })

  it('describes a checked task in words', () => {
    const model = arxDiffNodes(doc(tasks('t', task('a', false, 'buy milk'))), doc(tasks('t', task('a', true, 'buy milk'))))
    const container = model.units[0] as DiffContainer
    expect(container.kind).toBe('container')
    expect(container.change).toBe('changed')
    const child = container.children[0] as DiffBlock
    expect(child.role).toBe('task')
    expect(child.checked).toBe(true)
    expect(child.checkedBefore).toBe(false)
    expect(child.note).toBe('задача отмечена')
    expect(child.segments).toEqual([{ kind: 'equal', text: 'buy milk' }])
    expect(model.stops.map((stop) => stop.target)).toEqual([child.id])
    invariant(model)
  })

  it('describes type, level and language changes', () => {
    const heading = (level: number) => schema.node('heading', { arxId: 'h', level }, schema.text('Title'))
    expect((arxDiffNodes(doc(heading(2)), doc(heading(3))).units[0] as DiffBlock).note).toBe('заголовок: уровень 2 → 3')
    expect((arxDiffNodes(doc(p('h', 'Title')), doc(heading(1))).units[0] as DiffBlock).note).toBe('абзац → заголовок')
    const code = (language: string) => schema.node('code_block', { arxId: 'c', language }, schema.text('x'))
    const unit = arxDiffNodes(doc(code('js')), doc(code('ts'))).units[0] as DiffBlock
    expect(unit.role).toBe('code')
    expect(unit.note).toBe('язык: js → ts')
    const bold = schema.node('paragraph', { arxId: 'b' }, schema.text('word', [schema.marks.strong.create()]))
    expect((arxDiffNodes(doc(p('b', 'word')), doc(bold)).units[0] as DiffBlock).note).toBe('изменено форматирование')
  })

  it('recurses into a changed list: only the changed and the added item are stops', () => {
    const names = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
    const before = doc(list('l', ...names.map((n) => item(`i${n}`, `item ${n}`))))
    const afterItems = names.map((n) => item(`i${n}`, n === '4' ? 'item four' : `item ${n}`))
    afterItems.splice(6, 0, item('new', 'fresh item'))
    const model = arxDiffNodes(before, doc(list('l', ...afterItems)))
    const container = model.units[0] as DiffContainer
    expect(container.change).toBe('changed')
    expect(container.stop).toBeUndefined()
    expect(container.label).toBe('Список')
    expect(container.summary).toBe('Список · 2 пункта изменено из 10')
    const changed = container.children.filter((child) => child.change !== 'equal') as DiffBlock[]
    expect(changed.map((child) => [child.change, child.role])).toEqual([
      ['changed', 'item'],
      ['added', 'item'],
    ])
    expect(model.stops.map((stop) => stop.target)).toEqual(changed.map((child) => child.id))
    expect(model.counts).toEqual({ added: 1, removed: 0, changed: 1 })
    invariant(model)
  })

  it('recurses into nested lists and keeps the item paragraph as the head', () => {
    const before = doc(list('l', item('a', 'parent', list('inner', item('x', 'one'), item('y', 'two')))))
    const after = doc(list('l', item('a', 'parent', list('inner', item('x', 'one'), item('y', 'deux')))))
    const model = arxDiffNodes(before, after)
    const outer = model.units[0] as DiffContainer
    const parent = outer.children[0] as DiffContainer
    expect(parent.kind).toBe('container')
    expect(parent.head?.segments).toEqual([{ kind: 'equal', text: 'parent' }])
    expect(parent.head?.change).toBe('equal')
    const inner = parent.children[0] as DiffContainer
    expect(inner.change).toBe('changed')
    const [one, two] = inner.children as DiffBlock[]
    expect(one.change).toBe('equal')
    expect(two.change).toBe('changed')
    expect(model.stops).toHaveLength(1)
    expect(model.stops[0].target).toBe(two.id)
    invariant(model)
  })

  it('pairs a removed and an added child of the same type into one edit', () => {
    const before = doc(list('l', item('a', 'keep'), item('b', 'old text')))
    const after = doc(list('l', item('a', 'keep'), item('c', 'new text')))
    const model = arxDiffNodes(before, after)
    const container = model.units[0] as DiffContainer
    expect(container.children.map((child) => child.change)).toEqual(['equal', 'changed'])
    expect(model.counts).toEqual({ added: 0, removed: 0, changed: 1 })
    invariant(model)
  })

  it('shows a moved block at its new place and a ghost at its old place', () => {
    const before = doc(p('a'), p('b'), p('c'), p('d'), p('e'))
    const after = doc(p('e'), p('a'), p('b'), p('c'), p('d'))
    const model = arxDiffNodes(before, after)
    const moved = model.units.find((unit) => unit.change === 'moved' && !unit.ghost)
    const ghost = model.units.find((unit) => unit.ghost)
    expect(moved?.move).toEqual({ direction: 'up', distance: 4 })
    expect(moved?.note).toBe('перемещён выше на 4 блока')
    expect(ghost?.move).toEqual({ direction: 'up', distance: 4 })
    expect(ghost?.note).toBe('был здесь · перемещён выше')
    expect(ghost?.stop).toBeUndefined()
    expect(model.units.map((unit) => (unit as DiffBlock).segments[0].text + (unit.ghost ? '*' : ''))).toEqual(['e', 'a', 'b', 'c', 'd', 'e*'])
    expect(model.stops.map((stop) => stop.change)).toEqual(['moved'])
    expect(model.counts).toEqual({ added: 0, removed: 0, changed: 1 })
    invariant(model)
  })

  it('places a ghost before the next block that kept its old order', () => {
    const before = doc(p('a'), p('b'), p('c'), p('d'))
    const after = doc(p('b'), p('c'), p('a'), p('d'))
    const model = arxDiffNodes(before, after)
    expect(model.units.map((unit) => (unit as DiffBlock).segments[0].text + (unit.ghost ? '*' : ''))).toEqual(['a*', 'b', 'c', 'a', 'd'])
    const moved = model.units.find((unit) => unit.change === 'moved' && !unit.ghost)
    expect(moved?.move).toEqual({ direction: 'down', distance: 2 })
    expect(moved?.note).toBe('перемещён ниже на 2 блока')
  })

  it('keeps a removed block at its old place', () => {
    const model = arxDiffNodes(doc(p('a'), p('b'), p('c')), doc(p('a'), p('c')))
    expect(model.units.map((unit) => [unit.change, (unit as DiffBlock).segments[0].text])).toEqual([
      ['equal', 'a'],
      ['removed', 'b'],
      ['equal', 'c'],
    ])
    invariant(model)
  })

  it('counts an added whole list as one stop', () => {
    const model = arxDiffNodes(doc(p('a')), doc(p('a'), list('l', item('x'), item('y'), item('z'))))
    const container = model.units[1] as DiffContainer
    expect(container.change).toBe('added')
    expect(container.stop).toBe(0)
    expect(container.children.every((child) => child.change === 'equal')).toBe(true)
    expect(container.summary).toBe('Список · 3 пункта')
    expect(model.stops).toHaveLength(1)
    expect(model.counts).toEqual({ added: 1, removed: 0, changed: 0 })
    invariant(model)
  })

  it('refs top-level stops with the versionDifferences keys', () => {
    const before = doc(p('a'), p('b', 'old'), p('c'), list('l', item('x', 'one')))
    const after = doc(p('new'), p('b', 'fresh'), p('a'), list('l', item('x', 'uno')))
    const model = arxDiffNodes(before, after)
    const keys = new Set(versionDifferences(after, before).map((difference) => difference.key))
    expect(model.stops.length).toBeGreaterThan(0)
    for (const stop of model.stops) expect(keys.has(stop.ref ?? '')).toBe(true)
    invariant(model)
  })

  it('collapses a table row into its cells', () => {
    const cell = (text: string) => schema.node('table_cell', null, [schema.node('paragraph', null, schema.text(text))])
    const row = (id: string, ...cells: string[]) => schema.node('table_row', { arxId: id }, cells.map(cell))
    const table = (...rows: Node[]) => schema.node('table', { arxId: 't' }, rows)
    const model = arxDiffNodes(doc(table(row('r1', 'a', 'b'), row('r2', 'c', 'd'))), doc(table(row('r1', 'a', 'b'), row('r2', 'c', 'e'))))
    const container = model.units[0] as DiffContainer
    expect(container.label).toBe('Таблица')
    const changed = container.children[1] as DiffBlock
    expect(changed.role).toBe('row')
    expect(changed.segments.map((segment) => segment.text).join('')).toContain('c | ')
    expect(model.stops).toHaveLength(1)
  })

  it('notes a checked task that nests blocks on its head', () => {
    const nested = (checked: boolean) => schema.node('task_item', { arxId: 't1', checked }, [p('t1-p', 'plan'), list('sub', item('s', 'step'))])
    const model = arxDiffNodes(doc(tasks('t', nested(false))), doc(tasks('t', nested(true))))
    const parent = (model.units[0] as DiffContainer).children[0] as DiffContainer
    expect(parent.head?.change).toBe('changed')
    expect(parent.head?.role).toBe('task')
    expect(parent.head?.note).toBe('задача отмечена')
    expect(model.stops.map((stop) => stop.target)).toEqual([parent.head?.id])
    invariant(model)
  })

  it('stops on a container whose own attributes alone changed', () => {
    const callout = (type: string) => schema.node('callout', { arxId: 'c', type }, [p('x', 'body')])
    const model = arxDiffNodes(doc(callout('info')), doc(callout('warning')))
    const container = model.units[0] as DiffContainer
    expect(container.label).toBe('Выноска')
    expect(container.note).toBe('изменены свойства: type')
    expect(container.stop).toBe(0)
    invariant(model)
  })

  it('moves a whole list as one unit with a ghost', () => {
    const model = arxDiffNodes(doc(list('l', item('x')), p('a'), p('b')), doc(p('a'), p('b'), list('l', item('x'))))
    const moved = model.units.filter((unit) => unit.kind === 'container')
    expect(moved.map((unit) => [unit.change, Boolean(unit.ghost)])).toEqual([
      ['moved', true],
      ['moved', false],
    ])
    expect(model.stops).toHaveLength(1)
    invariant(model)
  })

  it('reads both sides from serialized .arx text', () => {
    const text = (node: Node) => JSON.stringify({ version: 1, doc: node.toJSON() })
    const model = arxDiffTexts(schema, text(doc(p('a', 'hello'))), text(doc(p('a', 'hello world'))))
    expect(visible(model)).toHaveLength(1)
    expect(model.counts.changed).toBe(1)
    expect(() => arxDiffTexts(schema, '{', text(doc(p('a'))))).toThrow()
  })
  it('keeps a removal between its old neighbours when a displaced block was also edited', () => {
    const before = doc(p('a'), p('x'), p('b'), p('c'), p('d'))
    const after = doc(p('d', 'd edited'), p('a'), p('b'), p('c'))
    const model = arxDiffNodes(before, after)
    const order = model.units.map(
      (unit) => `${unit.change}:${(unit as DiffBlock).segments.map((s) => s.text).join('')}${unit.ghost ? '*' : ''}`,
    )
    expect(order.indexOf('removed:x')).toBe(order.indexOf('equal:a') + 1)
    expect(order.indexOf('equal:b')).toBe(order.indexOf('removed:x') + 1)
    invariant(model)
  })

  it('draws a moved and edited block twice: live and changed, ghost with the old text at the old place', () => {
    const before = doc(p('a'), p('b'), p('c'), p('d'))
    const after = doc(p('d', 'd edited'), p('a'), p('b'), p('c'))
    const model = arxDiffNodes(before, after)
    const live = model.units.find((unit) => unit.change === 'changed' && !unit.ghost) as DiffBlock
    const ghost = model.units.find((unit) => unit.ghost) as DiffBlock
    expect(live.move).toEqual({ direction: 'up', distance: 3 })
    expect(live.segments.some((s) => s.kind === 'added')).toBe(true)
    expect(ghost.change).toBe('moved')
    expect(ghost.note).toBe('был здесь · перемещён выше')
    expect(ghost.segments).toEqual([{ kind: 'equal', text: 'd' }])
    expect(model.units.at(-1)).toBe(ghost)
    expect(model.stops.map((stop) => stop.change)).toEqual(['changed'])
    invariant(model)
  })

  it('reports a change to the document properties or appearance', () => {
    const props = (tags: string[]) => ({ type: 'properties', attrs: { arxId: 'pp', tags } })
    const withMeta = (tags: string[], icon: string | null) =>
      schema.node('doc', { arxEnvelope: { envelope: { appearance: { icon } }, properties: props(tags) } }, [p('a')])
    const same = arxDiffNodes(withMeta(['x'], 'star'), withMeta(['x'], 'star'))
    expect(same.identical).toBe(true)
    const model = arxDiffNodes(withMeta(['x'], 'star'), withMeta(['y'], 'moon'))
    expect(model.identical).toBe(false)
    const [unit] = model.units as DiffBlock[]
    expect(unit.id).toBe('props')
    expect(unit.note).toBe('изменены свойства документа: tags · изменена иконка')
    expect(model.counts).toEqual({ added: 0, removed: 0, changed: 1 })
    invariant(model)
  })

  it('notes a formatting-only change on the head of an item that nests blocks', () => {
    const bold = (id: string, text: string) => schema.node('paragraph', { arxId: id }, schema.text(text, [schema.marks.strong.create()]))
    const nested = list('n', item('y'))
    const before = doc(list('l', schema.node('list_item', { arxId: 'i' }, [p('i-p', 'hello'), nested])))
    const after = doc(list('l', schema.node('list_item', { arxId: 'i' }, [bold('i-p', 'hello'), nested])))
    const head = ((arxDiffNodes(before, after).units[0] as DiffContainer).children[0] as DiffContainer).head
    expect(head?.change).toBe('changed')
    expect(head?.note).toBe('изменено форматирование')
  })
})
