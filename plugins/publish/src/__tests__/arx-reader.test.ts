import { describe, expect, test } from 'vitest'
import { publicUrl } from '../public-url'
import { arxReader } from '../server/arx-reader'

const document = (content: unknown[]) => JSON.stringify({ version: 1, doc: { type: 'doc', content } })
const text = (value: string) => ({ type: 'text', text: value })

describe('public .arx rendering', () => {
  test('preserves document structure, marks, task state and code as text', () => {
    const { html, status } = arxReader(
      document([
        { type: 'heading', attrs: { level: 1 }, content: [text('A title')] },
        {
          type: 'paragraph',
          content: [
            { ...text('bold'), marks: [{ type: 'strong' }] },
            { type: 'hard_break' },
            { ...text('link'), marks: [{ type: 'link', attrs: { href: 'https://example.org', title: 'A link' } }] },
          ],
        },
        {
          type: 'ordered_list',
          attrs: { order: 3 },
          content: [{ type: 'list_item', content: [{ type: 'paragraph', content: [text('third')] }] }],
        },
        {
          type: 'task_list',
          content: [
            { type: 'task_item', attrs: { checked: true }, content: [{ type: 'paragraph', content: [text('done')] }] },
            { type: 'task_item', content: [{ type: 'paragraph', content: [text('todo')] }] },
          ],
        },
        { type: 'code_block', content: [text('<script>\nalert(1)\n</script>')] },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [text('quote')] }] },
      ]),
      'notes/example.arx',
    )
    expect(status).toBe(200)
    expect(html).toContain('<title>A title</title>')
    expect(html).toContain('<strong>bold</strong><br>')
    expect(html).toContain('<ol start="3">')
    expect(html).toContain('disabled checked aria-label="Completed task"')
    expect(html).toContain('disabled aria-label="Incomplete task"')
    expect(html).toContain(
      '<pre tabindex="0" role="region" aria-label="Code block"><code>&lt;script&gt;\nalert(1)\n&lt;/script&gt;</code></pre>',
    )
    expect(html).toContain('<blockquote><p>quote</p></blockquote>')
  })

  test('escapes markup and attributes, rejects executable URLs, and never injects unknown nodes', () => {
    const { html } = arxReader(
      document([
        { type: 'heading', attrs: { level: '1 onclick="alert(1)"' }, content: [text('</title><script>bad()</script>')] },
        {
          type: 'paragraph',
          content: [
            { ...text('unsafe'), marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] },
            { ...text('data'), marks: [{ type: 'link', attrs: { href: 'data:text/html,<script>bad()</script>' } }] },
          ],
        },
        { type: 'image', attrs: { src: 'javascript:alert(1)', alt: '<img onerror=bad()>' } },
        { type: 'script', content: [text('unknown block preserved')] },
        { type: 'image', attrs: { src: 'https://example.org/image.png', alt: '" onerror="bad()' } },
      ]),
      'malicious.arx',
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('href="data:')
    expect(html).not.toContain('src="javascript:')
    expect(html).toContain('alt="&quot; onerror=&quot;bad()"')
    expect(html).toContain('unknown block preserved')
    expect(html).toContain('Some formatting is not supported')
  })

  test('resolves vault-relative links and images through the public surface', () => {
    const { html } = arxReader(
      document([
        { type: 'paragraph', content: [{ ...text('another note'), marks: [{ type: 'link', attrs: { href: '../Other note.arx#part' } }] }] },
        { type: 'image', attrs: { src: 'images/photo.png', alt: 'Photo' } },
      ]),
      'notes/current.arx',
    )
    expect(html).toContain('href="/api/publish/public/Other%20note.arx#part"')
    expect(html).toContain('src="/api/publish/public/notes/images/photo.png"')
    expect(publicUrl('notes/a #1?.arx', 'https://hub.example.org')).toBe('https://hub.example.org/api/publish/public/notes/a%20%231%3F.arx')
  })

  test.each([
    'not json',
    '{"version":99}',
    document([{ type: 'paragraph', content: 'invalid' }]),
  ])('invalid source renders a readable failure: %s', (raw) => {
    const page = arxReader(raw, 'broken.arx')
    expect(page.status).toBe(422)
    expect(page.html).toContain('Download source')
  })
})
