import { validation } from '@arxhub/errors'
import { dirname, join, normalize } from '@arxhub/path'
import type { BlockAnchor } from '@arxhub/plugin-notes/ui'
import type { Node } from 'prosemirror-model'
import { NodeSelection, Plugin, Selection, TextSelection } from 'prosemirror-state'
import type { Ref } from 'vue'
import { documentId } from './document-history'
import { findDocumentMatches } from './document-search'
import { editorMode } from './editor-mode'
import { safeLink } from './link-commands'

export interface DocumentDestination {
  path: string
  title: string
}
export interface BlockDestination {
  label: string
  anchor: BlockAnchor
}
export interface ArxDocumentLinks {
  revision?: Ref<number>
  href?(path: string, anchor?: BlockAnchor): Promise<string>
  documents(query: string): Promise<DocumentDestination[]>
  blocks(path: string): Promise<BlockDestination[]>
  backlinks(path: string): Promise<DocumentDestination[]>
  open(path: string, anchor?: BlockAnchor): Promise<void>
}

export function documentHref(path: string, anchor?: BlockAnchor): string {
  const href = `/${path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`
  if (!anchor) return href
  const params = new URLSearchParams({ text: anchor.text })
  if (anchor.blockId) params.set('block', anchor.blockId)
  if (anchor.documentId) params.set('document', anchor.documentId)
  if (anchor.skip) params.set('skip', String(anchor.skip))
  return `${href}#${params}`
}

export function documentTarget(source: string, href: string): { path: string; anchor?: BlockAnchor } | null {
  if (!safeLink(href) || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return null
  const [rawPath, fragment] = href.split('#', 2)
  try {
    const decoded = decodeURIComponent(rawPath.split('?')[0])
    if (decoded.includes('\\') || [...decoded].some((character) => character.charCodeAt(0) < 32)) return null
    const path = normalize(decoded ? (decoded.startsWith('/') ? decoded.slice(1) : join(dirname(source), decoded)) : source)
    if (path === '..' || path.startsWith('../') || path.startsWith('/') || !/\.(arx|md|markdown)$/i.test(path)) return null
    const params = new URLSearchParams(fragment)
    const blockId = params.get('block')
    const documentId = params.get('document')
    const text = params.get('text') ?? (!blockId && !documentId && fragment ? decodeURIComponent(fragment) : '')
    const skip = Number(params.get('skip') ?? 0)
    return {
      path,
      ...(text || blockId || documentId
        ? {
            anchor: {
              text,
              ...(blockId ? { blockId } : {}),
              ...(documentId ? { documentId } : {}),
              ...(Number.isSafeInteger(skip) && skip > 0 ? { skip } : {}),
            },
          }
        : {}),
    }
  } catch {
    return null
  }
}

export function documentBlocks(doc: Node): BlockDestination[] {
  const result: BlockDestination[] = []
  const id = documentId(doc)
  doc.descendants((node, pos) => {
    if (!node.isTextblock && !(node.isBlock && node.attrs.arxId && (node.isAtom || node.type.spec.group?.split(' ').includes('block'))))
      return true
    const text = node.textBetween(0, node.content.size, ' ', '\ufffc') || String(node.attrs.title ?? node.attrs.name ?? node.type.name)
    if (text.trim()) {
      const matches = findDocumentMatches(doc, text)
      const skip = matches.findIndex((match) => match.from === pos + 1)
      result.push({
        label: text,
        anchor: {
          text,
          ...(skip > 0 ? { skip } : {}),
          ...(node.attrs.arxId ? { blockId: String(node.attrs.arxId) } : {}),
          ...(id ? { documentId: id } : {}),
        },
      })
    }
    return !node.isTextblock && !node.isAtom
  })
  return result
}

export function revealBlock(doc: Node, anchor: BlockAnchor): Selection | null {
  if (anchor.blockId) {
    let found: Selection | null = null
    doc.descendants((node, pos) => {
      if (node.attrs.arxId === anchor.blockId)
        found = node.isTextblock
          ? TextSelection.create(doc, pos + 1, pos + node.nodeSize - 1)
          : NodeSelection.isSelectable(node)
            ? NodeSelection.create(doc, pos)
            : Selection.near(doc.resolve(pos))
    })
    return found
  }
  if (!anchor.text) return null
  const matches = findDocumentMatches(doc, anchor.text)
  const match = matches[anchor.skip ?? 0] ?? matches[0]
  return match ? TextSelection.create(doc, match.from, match.to) : null
}

export function documentLinksPlugin(path: () => string, links: ArxDocumentLinks | null, report: (error: unknown) => void): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        click: (view, event) => {
          const element = event.target instanceof Element ? event.target.closest('a[href]') : null
          if (!element || !view.dom.contains(element)) return false
          if (editorMode(view.state) === 'editable' && !event.ctrlKey && !event.metaKey) return false
          const href = safeLink(element.getAttribute('href') ?? '')
          if (!href) {
            event.preventDefault()
            return true
          }
          const target = documentTarget(path(), href)
          if (target && links) {
            event.preventDefault()
            links.open(target.path, target.anchor).catch(report)
            return true
          }
          if (/^(https?:|mailto:|tel:)/i.test(href) || href.startsWith('//')) {
            event.preventDefault()
            window.open(href, '_blank', 'noopener,noreferrer')
            return true
          }
          event.preventDefault()
          report(validation('This document link is unavailable.'))
          return true
        },
      },
    },
  })
}
