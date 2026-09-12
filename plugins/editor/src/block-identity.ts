import { Fragment, type Node, type Schema } from 'prosemirror-model'
import { Plugin } from 'prosemirror-state'

export function identityNodes(nodes: Schema['spec']['nodes']): Schema['spec']['nodes'] {
  let result = nodes
  nodes.forEach((name, spec) => {
    if (name === 'doc' || name === 'text' || spec.inline) return
    result = result.update(name, { ...spec, attrs: { ...spec.attrs, arxId: { default: null, validate: 'string|null' } } })
  })
  return result
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
