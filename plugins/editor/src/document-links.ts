import { validation } from '@arxhub/errors'
import { dirname, join, normalize } from '@arxhub/path'
import type { BlockAnchor } from '@arxhub/plugin-notes/ui'
import type { Node } from 'prosemirror-model'
import { Plugin, TextSelection } from 'prosemirror-state'
import type { Ref } from 'vue'
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
  documents(query: string): Promise<DocumentDestination[]>
  blocks(path: string): Promise<BlockDestination[]>
  backlinks(path: string): Promise<DocumentDestination[]>
  open(path: string, anchor?: BlockAnchor): Promise<void>
}

export function documentHref(path: string, anchor?: BlockAnchor): string {
  const href = `/${path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`
  if (!anchor) return href
  const params = new URLSearchParams({ text: anchor.text })
  if (anchor.skip) params.set('skip', String(anchor.skip))
  return `${href}#${params}`
}

export function documentTarget(source: string, href: string): { path: string; anchor?: BlockAnchor } | null {
  if (!safeLink(href) || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return null
  const [rawPath, fragment] = href.split('#', 2)
  try {
    const decoded = decodeURIComponent(rawPath.split('?')[0])
    if (decoded.includes('\\') || /[\u0000-\u001f]/.test(decoded)) return null
    const path = normalize(decoded ? (decoded.startsWith('/') ? decoded.slice(1) : join(dirname(source), decoded)) : source)
    if (path === '..' || path.startsWith('../') || path.startsWith('/') || !/\.(arx|md|markdown)$/i.test(path)) return null
    const params = new URLSearchParams(fragment)
    const text = params.get('text') ?? (fragment ? decodeURIComponent(fragment) : '')
    const skip = Number(params.get('skip') ?? 0)
    return { path, ...(text ? { anchor: { text, ...(Number.isSafeInteger(skip) && skip > 0 ? { skip } : {}) } } : {}) }
  } catch {
    return null
  }
}

export function documentBlocks(doc: Node): BlockDestination[] {
  const result: BlockDestination[] = []
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textBetween(0, node.content.size, undefined, '\ufffc')
    if (text.trim()) {
      const matches = findDocumentMatches(doc, text)
      const skip = matches.findIndex((match) => match.from === pos + 1)
      result.push({ label: text, anchor: { text, ...(skip > 0 ? { skip } : {}) } })
    }
    return false
  })
  return result
}

export function revealBlock(doc: Node, anchor: BlockAnchor): TextSelection | null {
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
