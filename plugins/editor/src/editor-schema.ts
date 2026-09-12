import { validation } from '@arxhub/errors'
import { type Mark, type Node, Schema } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'
import { tableNodes } from 'prosemirror-tables'
import { assetNodes } from './asset-schema'
import { columnNodes } from './columns'
import { isRecord } from './document-migrations'
import { safeLink } from './link-commands'

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
        options: {
          default: ['Not started', 'In progress', 'Done'],
          validate: (value: unknown) => {
            if (!Array.isArray(value) || !value.every((option) => typeof option === 'string')) throw validation('Invalid dropdown options')
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
              if (!Array.isArray(options) || !options.every((option) => typeof option === 'string')) return false
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
          `${node.attrs.label}: ${node.attrs.value ?? '—'}`,
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
