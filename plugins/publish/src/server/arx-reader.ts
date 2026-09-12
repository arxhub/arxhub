import { validation } from '@arxhub/errors'
import { publicUrl } from '../public-url'
import { readerStyles } from './reader-styles'

export interface ArxNode {
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
    if (input.startsWith('#')) {
      const block = new URLSearchParams(input.slice(1)).get('block')
      return image ? null : block ? `#block-${encodeURIComponent(block)}` : input
    }
    const url = new URL(input, `https://published.invalid/${pathname.split('/').map(encodeURIComponent).join('/')}`)
    const path = url.pathname.split('/').filter(Boolean).map(decodeURIComponent).join('/')
    const block = new URLSearchParams(url.hash.slice(1)).get('block')
    return `${publicUrl(path)}${block ? `#block-${encodeURIComponent(block)}` : url.hash}`
  } catch {
    return null
  }
}

export interface ArxReaderOptions {
  text?: (node: ArxNode) => string | null
  assets?: ReadonlyMap<string, string>
}

export function arxAssetPaths(raw: string): string[] {
  const paths = new Set<string>()
  const visit = (node: ArxNode) => {
    if (
      ['image_block', 'attachment'].includes(node.type) &&
      typeof node.attrs.path === 'string' &&
      /^attachments\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(node.attrs.path)
    )
      paths.add(node.attrs.path)
    node.content.forEach(visit)
  }
  visit(parseDocument(raw))
  return [...paths]
}

export function arxReader(raw: string, pathname: string, options: ArxReaderOptions = {}): { html: string; status: number } {
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
      case 'columns':
        html = `<div class="columns" style="--columns:${Math.min(3, Math.max(2, node.content.length))}">${content}</div>`
        break
      case 'column':
        html = wrap('div', content)
        break
      case 'section':
        html = `<details open><summary>${escapeHtml(String(attrs.title ?? 'Section'))}</summary>${content}</details>`
        break
      case 'table':
        html = `<div class="table-scroll"><table>${content}</table></div>`
        break
      case 'table_row':
        html = wrap('tr', content)
        break
      case 'table_cell':
      case 'table_header': {
        const tag = node.type === 'table_header' ? 'th' : 'td'
        const span = (value: unknown) => (Number.isInteger(value) ? Math.min(1000, Math.max(1, Number(value))) : 1)
        html = `<${tag} colspan="${span(attrs.colspan)}" rowspan="${span(attrs.rowspan)}">${content}</${tag}>`
        break
      }
      case 'select':
        html = `<span>${escapeHtml(String(attrs.value ?? 'Not selected'))}</span>`
        break
      case 'data_view':
        html = `<aside class="notice">Dynamic data view (${escapeHtml(String(attrs.source ?? ''))}). Open this document in ArxHub to query its source.</aside>`
        break
      case 'image_block':
      case 'attachment': {
        const path = typeof attrs.path === 'string' && /^attachments\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(attrs.path) ? attrs.path : null
        const url = path ? (options.assets?.get(path) ?? publicUrl(path)) : null
        const name = escapeHtml(String(attrs.name || 'Attachment'))
        if (node.type === 'image_block') {
          const width = typeof attrs.width === 'number' && Number.isFinite(attrs.width) ? Math.min(100, Math.max(10, attrs.width)) : 100
          html = `<figure>${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(String(attrs.alt ?? ''))}" style="width:${width}%" loading="lazy">` : name}<figcaption>${escapeHtml(String(attrs.caption ?? ''))}</figcaption></figure>`
        } else
          html = url
            ? `<p><a href="${escapeHtml(url)}" download="${name}">${name}</a> ${escapeHtml(String(attrs.caption ?? ''))}</p>`
            : `<p>${name}</p>`
        break
      }
      case 'image': {
        const src = safeUrl(attrs.src, pathname, true)
        const alt = typeof attrs.alt === 'string' ? attrs.alt : ''
        html = src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" referrerpolicy="no-referrer">` : escapeHtml(alt)
        break
      }
      default: {
        const text = options.text?.(node)
        unsupported ||= text == null
        html = text == null ? content || escapeHtml(node.text ?? '') : `<section>${escapeHtml(text)}</section>`
      }
    }
    if (typeof attrs.arxId === 'string' && node.type !== 'text')
      html = html.replace(/^<([a-z][a-z0-9]*)\b/, (_, tag: string) => `<${tag} id="block-${escapeHtml(String(attrs.arxId))}"`)
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
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${readerStyles}</style></head><body><main>${notice ? `<p class="notice" role="status">${notice}</p>` : ''}<article aria-label="Published note">${body}</article><footer><span>Published with ArxHub</span><a href="${escapeHtml(publicUrl(pathname))}?source=1" download>Download source</a><a href="${escapeHtml(publicUrl(pathname))}?html=1" download>Download HTML</a></footer></main></body></html>`
  return { html, status }
}

export function arxMarkdown(raw: string, pathname: string, options: ArxReaderOptions = {}): string {
  const escapeMarkdown = (text: string) =>
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/([\\`*_[\]])/g, '\\$1')
  const destination = (url: string) => `<${url.replace(/</g, '%3C').replace(/>/g, '%3E')}>`
  const fence = (text: string, language = '') => {
    const marker = '`'.repeat(Array.from(text.matchAll(/`+/g)).reduce((size, match) => Math.max(size, match[0].length + 1), 3))
    return `${marker}${language.replace(/[^\w+-]/g, '')}\n${text}\n${marker}`
  }
  const render = (node: ArxNode): string => {
    let content = ['bullet_list', 'ordered_list', 'task_list', 'table', 'code_block'].includes(node.type)
      ? ''
      : node.content.map(render).join(node.type === 'paragraph' || node.type === 'heading' ? '' : '\n\n')
    switch (node.type) {
      case 'text':
        content = escapeMarkdown(node.text ?? '')
        break
      case 'doc':
      case 'paragraph':
      case 'column':
      case 'columns':
      case 'list_item':
        break
      case 'heading':
        content = `${'#'.repeat(Math.min(6, Math.max(1, Number(node.attrs.level) || 1)))} ${content}`
        break
      case 'section':
        content = `**${escapeMarkdown(String(node.attrs.title ?? 'Section'))}**\n\n${content}`
        break
      case 'hard_break':
        content = '  \n'
        break
      case 'horizontal_rule':
        content = '---'
        break
      case 'blockquote':
      case 'callout':
        content = content
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')
        break
      case 'bullet_list':
      case 'ordered_list':
      case 'task_list':
        content = node.content
          .map((item, i) => {
            const prefix =
              node.type === 'ordered_list'
                ? `${i + (Number(node.attrs.order) || 1)}. `
                : node.type === 'task_list'
                  ? `- [${item.attrs.checked ? 'x' : ' '}] `
                  : '- '
            return prefix + render(item).replace(/\n/g, `\n${' '.repeat(prefix.length)}`)
          })
          .join('\n')
        break
      case 'task_item':
        break
      case 'code_block':
        content = fence(textOf(node), String(node.attrs.language ?? ''))
        break
      case 'table':
        content = `<table>${node.content.map((row) => `<tr>${row.content.map((cell) => `<${cell.type === 'table_header' ? 'th' : 'td'} colspan="${Math.min(1000, Math.max(1, Number(cell.attrs.colspan) || 1))}" rowspan="${Math.min(1000, Math.max(1, Number(cell.attrs.rowspan) || 1))}">${escapeHtml(textOf(cell))}</${cell.type === 'table_header' ? 'th' : 'td'}>`).join('')}</tr>`).join('')}</table>`
        break
      case 'image_block':
      case 'attachment': {
        const path = typeof node.attrs.path === 'string' ? node.attrs.path : ''
        const url = options.assets?.get(path) ?? safeUrl(`/${path}`, pathname)
        content = url
          ? `${node.type === 'image_block' ? '!' : ''}[${escapeMarkdown(String(node.attrs.alt || node.attrs.name || 'Attachment'))}](${destination(url)})`
          : escapeMarkdown(String(node.attrs.name || 'Attachment'))
        if (node.attrs.caption) content += `\n\n${escapeMarkdown(String(node.attrs.caption))}`
        break
      }
      case 'image': {
        const url = safeUrl(node.attrs.src, pathname, true)
        content = url ? `![${escapeMarkdown(String(node.attrs.alt ?? ''))}](${destination(url)})` : escapeMarkdown(String(node.attrs.alt ?? ''))
        break
      }
      case 'select':
        content = escapeMarkdown(String(node.attrs.value ?? 'Not selected'))
        break
      case 'data_view':
        content = `Data view: ${escapeMarkdown(String(node.attrs.source ?? ''))} (requires ArxHub)`
        break
      default: {
        const text = options.text?.(node)
        content = text != null ? escapeMarkdown(text) : fence(JSON.stringify(node, null, 2), 'json')
      }
    }
    for (const mark of node.marks) {
      if (mark.type === 'strong') content = `**${content}**`
      else if (mark.type === 'em') content = `*${content}*`
      else if (mark.type === 'strike') content = `~~${content}~~`
      else if (mark.type === 'code') {
        const marker = '`'.repeat(Array.from((node.text ?? '').matchAll(/`+/g)).reduce((size, match) => Math.max(size, match[0].length + 1), 1))
        content = `${marker} ${node.text ?? ''} ${marker}`
      } else if (mark.type === 'link') {
        const url = safeUrl(mark.attrs.href, pathname)
        if (url) content = `[${content}](${destination(url)})`
      }
    }
    return content
  }
  return `${render(parseDocument(raw))}\n`
}
