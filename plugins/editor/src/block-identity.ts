import { validation } from '@arxhub/errors'
import { type Attrs, type DOMOutputSpec, Fragment, type Node, type Schema } from 'prosemirror-model'
import { Plugin } from 'prosemirror-state'

export function identityNodes(nodes: Schema['spec']['nodes']): Schema['spec']['nodes'] {
  let result = nodes
  nodes.forEach((name, spec) => {
    if (name === 'doc' || name === 'text' || spec.inline) return
    const toDOM = spec.toDOM
    result = result.update(name, {
      ...spec,
      attrs: { ...spec.attrs, arxId: { default: null, validate: 'string|null' } },
      toDOM: toDOM ? (node) => identifyDOM(toDOM(node), node.attrs) : undefined,
      parseDOM: spec.parseDOM?.map((rule) =>
        !('tag' in rule) || rule.ignore || rule.skip
          ? rule
          : {
              ...rule,
              getAttrs: (element) => {
                const attrs = rule.getAttrs ? rule.getAttrs(element) : rule.attrs
                return attrs === false ? false : { ...attrs, arxId: element.getAttribute('data-arx-id') || null }
              },
            },
      ),
    })
  })
  return result
}

const attributeArrays = new WeakMap<Attrs, Set<unknown>>()
function arraysIn(attrs: Attrs): Set<unknown> {
  const cached = attributeArrays.get(attrs)
  if (cached) return cached
  const arrays = new Set<unknown>()
  const visited = new Set<object>()
  const pending: unknown[] = [attrs]
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object' || visited.has(value)) continue
    visited.add(value)
    if (Array.isArray(value)) arrays.add(value)
    for (const child of Object.values(value)) pending.push(child)
  }
  attributeArrays.set(attrs, arrays)
  return arrays
}

function identifyDOM(output: DOMOutputSpec, nodeAttrs: Attrs): DOMOutputSpec {
  const id = nodeAttrs.arxId
  if (typeof id !== 'string' || typeof output === 'string') return output
  if ('nodeType' in output || 'dom' in output) {
    const dom = 'dom' in output ? output.dom : output
    if (dom.nodeType === 1) (dom as Element).setAttribute('data-arx-id', id)
    return output
  }
  // Cloning the outer spec must not bypass ProseMirror's check for arrays taken from document attributes.
  if (arraysIn(nodeAttrs).has(output)) throw validation('A block DOM spec cannot come from document attributes')
  const [tag, attrs, ...children] = output
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs) && !('nodeType' in attrs))
    return [tag, { ...attrs, 'data-arx-id': id }, ...children]
  return [tag, { 'data-arx-id': id }, ...output.slice(1)]
}

export function identifyBlocks(doc: Node): Node {
  const seen = new Set<string>()
  const visit = (node: Node): Node => {
    if (node.isText) return node
    let attrs = node.attrs
    if (Object.hasOwn(attrs, 'arxId')) {
      const id = attrs.arxId
      if (typeof id !== 'string' || !id || seen.has(id)) attrs = { ...attrs, arxId: crypto.randomUUID() }
      seen.add(attrs.arxId)
    }
    const children: Node[] = []
    node.forEach((child) => {
      children.push(visit(child))
    })
    return node.type.create(attrs, Fragment.from(children), node.marks)
  }
  return visit(doc)
}

export function blockIdentityPlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, previous, state) {
      if (!transactions.some((tr) => tr.docChanged)) return null
      const originals = new Map<string, number>()
      previous.doc.descendants((node, pos) => {
        if (typeof node.attrs.arxId === 'string') originals.set(node.attrs.arxId, pos)
      })
      for (const tr of transactions) {
        for (const [id, pos] of originals) {
          const mapped = tr.mapping.mapResult(pos, 1)
          if (mapped.deleted) originals.delete(id)
          else originals.set(id, mapped.pos)
        }
      }
      const seen = new Set<string>()
      const tr = state.tr
      state.doc.descendants((node, pos) => {
        if (!Object.hasOwn(node.attrs, 'arxId')) return
        const id = node.attrs.arxId
        const original = typeof id === 'string' ? originals.get(id) : undefined
        const reserved = original !== undefined && original !== pos && state.doc.nodeAt(original)?.attrs.arxId === id
        if (typeof id !== 'string' || !id || seen.has(id) || reserved) tr.setNodeAttribute(pos, 'arxId', crypto.randomUUID())
        else seen.add(id)
      })
      return tr.docChanged ? tr : null
    },
  })
}
