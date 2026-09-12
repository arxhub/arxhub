import { validation } from '@arxhub/errors'
import { publicUrl } from '../public-url'
import { readerStyles } from './reader-styles'

interface ArxNode {
  type: string
  text?: string
  attrs: Record<string, unknown>
  content: ArxNode[]
  marks: { type: string; attrs: Record<string, unknown> }[]
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function parseDocument(raw: string): ArxNode {
  const data = record(JSON.parse(raw))
  if (data.version !== 1 || record(data.doc).type !== 'doc') throw validation('Unsupported document format')
  let count = 0
  function node(value: unknown, depth: number): ArxNode {
    const data = record(value)
    if (++count > 50_000 || depth > 100 || typeof data.type !== 'string') throw validation('Invalid document tree')
    if (data.content !== undefined && !Array.isArray(data.content)) throw validation('Invalid document content')
    if (data.marks !== undefined && !Array.isArray(data.marks)) throw validation('Invalid document marks')
    if (data.type === 'text' && typeof data.text !== 'string') throw validation('Invalid document text')
    return {
      type: data.type,
      text: typeof data.text === 'string' ? data.text : undefined,
      attrs: record(data.attrs),
      content: Array.isArray(data.content) ? data.content.map((child) => node(child, depth + 1)) : [],
      marks: Array.isArray(data.marks)
        ? data.marks.map((mark) => {
            const data = record(mark)
            if (typeof data.type !== 'string') throw validation('Invalid document mark')
            return { type: data.type, attrs: record(data.attrs) }
          })
        : [],
    }
  }
  return node(data.doc, 0)
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character,
  )
}

function textOf(node: ArxNode): string {
  return node.text ?? node.content.map(textOf).join('')
}

function safeUrl(value: unknown, pathname: string, image = false): string | null {
  if (typeof value !== 'string' || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === '\\'))
    return null
  const input = value.trim()
  const allowed = image ? ['https:', 'http:'] : ['https:', 'http:', 'mailto:']
  try {
    if (/^[a-z][a-z\d+.-]*:/i.test(input) || input.startsWith('//')) {
      const url = new URL(input, 'https://published.invalid')
      return allowed.includes(url.protocol) ? url.href : null
    }
    if (input.startsWith('#')) return image ? null : input
    const url = new URL(input, `https://published.invalid/${pathname.split('/').map(encodeURIComponent).join('/')}`)
    const path = url.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/')
    return `${publicUrl(path)}${url.hash}`
  } catch {
    return null
  }
}

export function arxReader(raw: string, pathname: string): { html: string; status: number } {
  let body = ''
  let title = pathname.split('/').at(-1) ?? 'Published note'
  let notice = ''
  let status = 200
  let unsupported = false
  const wrap = (tag: string, body: string) => `<${tag}>${body}</${tag}>`

  function render(node: ArxNode): string {
    const content = node.content.map(render).join('')
    const attrs = node.attrs
    let html: string
    switch (node.type) {
      case 'doc':
        html = content
        break
      case 'text':
        html = escapeHtml(node.text ?? '')
        break
      case 'paragraph':
        html = wrap('p', content || '<br>')
        break
      case 'heading': {
        const level = Number.isInteger(attrs.level) && Number(attrs.level) >= 1 && Number(attrs.level) <= 6 ? Number(attrs.level) : 2
        html = wrap(`h${level}`, content)
        break
      }
      case 'blockquote':
        html = wrap('blockquote', content)
        break
      case 'bullet_list':
        html = wrap('ul', content)
        break
      case 'ordered_list': {
        const start = Number.isSafeInteger(attrs.order) ? Number(attrs.order) : 1
        html = `<ol start="${start}">${content}</ol>`
        break
      }
      case 'list_item':
        html = wrap('li', content)
        break
      case 'task_list':
        html = `<ul class="tasks">${content}</ul>`
        break
      case 'task_item':
        html = `<li class="task"><input type="checkbox" disabled${attrs.checked === true ? ' checked' : ''} aria-label="${attrs.checked === true ? 'Completed task' : 'Incomplete task'}"><div>${content}</div></li>`
        break
      case 'code_block':
        html = `<pre tabindex="0" role="region" aria-label="Code block"><code>${escapeHtml(textOf(node))}</code></pre>`
        break
      case 'hard_break':
        html = '<br>'
        break
      case 'horizontal_rule':
        html = '<hr>'
        break
      case 'callout':
        html = `<aside class="callout">${content}</aside>`
        break
      case 'image': {
        const src = safeUrl(attrs.src, pathname, true)
        const alt = typeof attrs.alt === 'string' ? attrs.alt : ''
        html = src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" referrerpolicy="no-referrer">` : escapeHtml(alt)
        break
      }
      default:
        unsupported = true
        html = content || escapeHtml(node.text ?? '')
    }
    for (const mark of node.marks) {
      switch (mark.type) {
        case 'strong':
          html = wrap('strong', html)
          break
        case 'em':
          html = wrap('em', html)
          break
        case 'strike':
          html = wrap('s', html)
          break
        case 'underline':
          html = wrap('u', html)
          break
        case 'highlight':
          html = wrap('mark', html)
          break
        case 'code':
          html = wrap('code', html)
          break
        case 'link': {
          const href = safeUrl(mark.attrs.href, pathname)
          if (href)
            html = `<a href="${escapeHtml(href)}" rel="noreferrer noopener"${typeof mark.attrs.title === 'string' ? ` title="${escapeHtml(mark.attrs.title)}"` : ''}>${html}</a>`
          break
        }
        default:
          unsupported = true
      }
    }
    return html
  }

  try {
    const doc = parseDocument(raw)
    const heading = doc.content.find((node) => node.type === 'heading')
    if (heading) title = textOf(heading) || title
    body = render(doc)
    if (!body) body = '<p>This note is empty.</p>'
    if (unsupported) notice = 'Some formatting is not supported by this reader. Download the source to keep the complete document.'
  } catch {
    status = 422
    body =
      '<h1>This note could not be displayed</h1><p>It uses an unsupported format or contains invalid document data. You can still download the source.</p>'
  }

  // Only our bundled stylesheet enters <style>; document text and attributes are always escaped.
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${readerStyles}</style></head><body><main>${notice ? `<p class="notice" role="status">${notice}</p>` : ''}<article aria-label="Published note">${body}</article><footer><span>Published with ArxHub</span><a href="${escapeHtml(publicUrl(pathname))}?source=1" download>Download source</a></footer></main></body></html>`
  return { html, status }
}
