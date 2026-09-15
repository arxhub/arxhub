import { validation } from '@arxhub/errors'
import { type Mark, type Node, Schema } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'
import { tableNodes } from 'prosemirror-tables'
import { assetNodes } from './asset-schema'
import { columnNodes } from './columns'
import { isRecord } from './document-migrations'
import { safeLink } from './link-commands'
import { isSelectOptionList, legacySelectOptions, selectedLabel } from './select-options'

const nodes = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block')
  .update('doc', { content: 'block+', attrs: { arxEnvelope: { default: null } } })
  .update('code_block', {
    ...basicSchema.spec.nodes.get('code_block'),
    content: 'text*',
    group: 'block',
    marks: '',
    code: true,
    defining: true,
    attrs: { language: { default: '', validate: 'string' } },
    parseDOM: [{ tag: 'pre', preserveWhitespace: 'full', getAttrs: (dom: HTMLElement) => ({ language: dom.dataset.language ?? '' }) }],
    toDOM: (node: Node) => ['pre', { 'data-language': node.attrs.language }, ['code', 0]],
  })
  .append(tableNodes({ tableGroup: 'block', cellContent: 'block+', cellAttributes: {} }))
  .append(assetNodes)
  .append(columnNodes)
  .append({
    data_view: {
      group: 'block',
      atom: true,
      attrs: {
        source: { default: 'tasks', validate: 'string' },
        layout: {
          default: 'list',
          validate: (value: unknown) => {
            if (!['list', 'board', 'calendar'].includes(String(value))) throw validation('Invalid data layout')
          },
        },
        query: { default: '', validate: 'string' },
      },
      parseDOM: [
        {
          tag: 'div[data-arx-data-view]',
          getAttrs: (dom) => ({
            source: dom.getAttribute('data-source') || 'tasks',
            layout: dom.getAttribute('data-layout') || 'list',
            query: dom.getAttribute('data-query') || '',
          }),
        },
      ],
      toDOM: (node) => [
        'div',
        { 'data-arx-data-view': '', 'data-source': node.attrs.source, 'data-layout': node.attrs.layout, 'data-query': node.attrs.query },
        `Data view: ${node.attrs.source}`,
      ],
    },
    unknown_block: {
      group: 'block',
      atom: true,
      attrs: {
        raw: {
          validate: (value: unknown) => {
            if (!isRecord(value)) throw validation('Invalid preserved block')
          },
        },
        versions: {
          default: {},
          validate: (value: unknown) => {
            if (!isRecord(value) || Object.values(value).some((version) => !Number.isSafeInteger(version) || Number(version) < 1))
              throw validation('Invalid preserved plugin versions')
          },
        },
      },
      parseDOM: [
        {
          tag: 'div[data-arx-unknown]',
          getAttrs: (dom: HTMLElement) => {
            try {
              const value: unknown = JSON.parse(dom.dataset.arxUnknown ?? '')
              return isRecord(value) && isRecord(value.raw) && isRecord(value.versions) ? value : false
            } catch {
              return false
            }
          },
        },
      ],
      toDOM: (node: Node) =>
        ['div', { 'data-arx-unknown': JSON.stringify(node.attrs) }, `Unavailable block: ${node.attrs.raw.type ?? 'unknown'}`] as const,
    },
    section: {
      group: 'block',
      content: 'block+',
      defining: true,
      attrs: { title: { default: 'Section', validate: 'string' } },
      parseDOM: [
        {
          tag: 'details[data-arx-section]',
          contentElement: 'div[data-section-content]',
          getAttrs: (dom: HTMLElement) => ({ title: dom.querySelector('summary')?.textContent ?? 'Section' }),
        },
      ],
      toDOM: (node: Node) =>
        ['details', { 'data-arx-section': '', open: '' }, ['summary', node.attrs.title], ['div', { 'data-section-content': '' }, 0]] as const,
    },
    task_list: {
      group: 'block',
      content: 'task_item+',
      parseDOM: [{ tag: 'ul[data-type="task_list"]', priority: 100 }],
      toDOM: () => ['ul', { 'data-type': 'task_list' }, 0] as const,
    },
    task_item: {
      attrs: { checked: { default: false, validate: 'boolean' } },
      content: 'paragraph block*',
      parseDOM: [
        {
          tag: 'li[data-type="task_item"]',
          priority: 100,
          getAttrs: (dom: HTMLElement) => ({ checked: dom.dataset.checked === 'true' }),
        },
      ],
      toDOM: (node: Node) => ['li', { 'data-type': 'task_item', 'data-checked': String(node.attrs.checked) }, 0] as const,
    },
    select: {
      group: 'block',
      atom: true,
      attrs: {
        label: { default: 'Status', validate: 'string' },
        // `{ id, label }[]`, and `value` names an id — so a renamed option stays chosen. Files written as
        // a list of labels are migrated on read (`select-options.ts`).
        options: {
          default: legacySelectOptions(['Not started', 'In progress', 'Done']),
          validate: (value: unknown) => {
            if (!isSelectOptionList(value)) throw validation('Invalid dropdown options')
          },
        },
        value: { default: null, validate: 'string|null' },
      },
      parseDOM: [
        {
          tag: 'div[data-type="select"]',
          getAttrs: (dom: HTMLElement) => {
            try {
              const options: unknown = JSON.parse(dom.dataset.options ?? '[]')
              if (!isSelectOptionList(options)) return false
              return { label: dom.dataset.label ?? 'Status', options, value: dom.dataset.value ?? null }
            } catch {
              return false
            }
          },
        },
      ],
      toDOM: (node: Node) =>
        [
          'div',
          {
            'data-type': 'select',
            'data-label': node.attrs.label,
            'data-options': JSON.stringify(node.attrs.options),
            'data-value': node.attrs.value,
          },
          `${node.attrs.label}: ${selectedLabel(node.attrs.options, node.attrs.value) ?? '—'}`,
        ] as const,
    },
    callout: {
      attrs: { type: { default: 'info' } },
      group: 'block',
      content: 'block+',
      parseDOM: [
        {
          tag: 'div.callout',
          getAttrs: (dom: HTMLElement) => ({ type: dom.dataset.type ?? 'info' }),
        },
      ],
      toDOM: (node: Node) => ['div', { class: 'callout', 'data-type': node.attrs.type }, 0] as const,
    },
    // Written only by a three-way merge (`arx-merge.ts`), never by hand or by a command: a block-level
    // conflict two devices could not resolve on their own. `atom: true` even though it has real content
    // (the two sides) — the point is that neither side is directly editable text, only a decision made
    // through its own component, exactly like an atom node with structured data rather than a leaf.
    // Preserved wholesale by an older client that does not know this node yet, the same way any other
    // unrecognised block is (`unknown_block` — see editor-format.ts's `supportedJSON`): no separate
    // format-version bump exists for base-schema nodes (`task_list`/`select`/`callout` never needed
    // one either), because that fallback keys off schema membership, not a version number.
    conflict: {
      group: 'block',
      atom: true,
      content: 'conflict_side conflict_side',
      attrs: {
        kind: {
          default: 'edit-edit',
          validate: (value: unknown) => {
            if (value !== 'edit-edit' && value !== 'edit-delete') throw validation('Invalid conflict kind')
          },
        },
      },
      parseDOM: [
        {
          tag: 'div[data-arx-conflict]',
          getAttrs: (dom: HTMLElement) => ({ kind: dom.dataset.kind === 'edit-delete' ? 'edit-delete' : 'edit-edit' }),
        },
      ],
      toDOM: (node: Node) => ['div', { 'data-arx-conflict': '', 'data-kind': node.attrs.kind }, 0] as const,
    },
    // `block*`, not `block+`: an edit-delete conflict has an empty side (whichever side deleted the
    // file), so the empty side must be a legal `conflict_side` rather than an impossible one.
    conflict_side: {
      content: 'block*',
      attrs: {
        side: {
          default: 'local',
          validate: (value: unknown) => {
            if (value !== 'local' && value !== 'remote') throw validation('Invalid conflict side')
          },
        },
      },
      parseDOM: [
        {
          tag: 'div[data-arx-conflict-side]',
          getAttrs: (dom: HTMLElement) => ({ side: dom.dataset.arxConflictSide === 'remote' ? 'remote' : 'local' }),
        },
      ],
      toDOM: (node: Node) => ['div', { 'data-arx-conflict-side': node.attrs.side }, 0] as const,
    },
  })

const marks = basicSchema.spec.marks.append({
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }],
    toDOM: () => ['s', 0] as const,
  },
  underline: {
    parseDOM: [{ tag: 'u' }],
    toDOM: () => ['u', 0] as const,
  },
  highlight: {
    parseDOM: [{ tag: 'mark' }],
    toDOM: () => ['mark', 0] as const,
  },
  link: {
    attrs: { href: {}, title: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom: HTMLElement) => ({
          href: dom.getAttribute('href'),
          title: dom.getAttribute('title'),
        }),
      },
    ],
    toDOM: (node: Mark) => ['a', { href: safeLink(String(node.attrs.href)), title: node.attrs.title, rel: 'noopener noreferrer' }, 0] as const,
  },
})

export const schema: Schema = new Schema({ nodes, marks })
