import { Schema } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'
import { addListNodes } from 'prosemirror-schema-list'

const nodes = addListNodes(basicSchema.spec.nodes, 'paragraph block*', 'block').append({
  task_list: {
    group: 'block',
    content: 'task_item+',
    parseDOM: [{ tag: 'ul[data-type="task_list"]' }],
    toDOM: () => ['ul', { 'data-type': 'task_list' }, 0] as const,
  },
  task_item: {
    attrs: { checked: { default: false } },
    content: 'paragraph+',
    parseDOM: [
      {
        tag: 'li[data-type="task_item"]',
        getAttrs: (dom: HTMLElement) => ({ checked: dom.dataset.checked === 'true' }),
      },
    ],
    toDOM: (node: any) => ['li', { 'data-type': 'task_item', 'data-checked': String(node.attrs.checked) }, 0] as const,
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
    toDOM: (node: any) => ['div', { class: 'callout', 'data-type': node.attrs.type }, 0] as const,
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
    toDOM: (node: any) => ['a', { href: node.attrs.href, title: node.attrs.title }, 0] as const,
  },
})

export const schema: Schema = new Schema({ nodes, marks })
