import { describe, expect, test } from 'vitest'
import { publicUrl } from '../public-url'
import { arxMarkdown, arxReader } from '../server/arx-reader'

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

  test('a dropdown shows the label of its chosen option, whichever shape the file stores', () => {
    const select = (options: unknown, value: unknown) => ({ type: 'select', attrs: { label: 'Priority', options, value } })
    const raw = document([
      select(['Low', 'High'], 'High'),
      select([{ id: 'k1', label: 'Done <b>' }], 'k1'),
      select([{ id: 'k1', label: 'Done' }], 'gone'),
      select(['Low'], null),
    ])
    const { html } = arxReader(raw, 'notes/example.arx')
    expect(html).toContain('<span>High</span>')
    expect(html).toContain('<span>Done &lt;b&gt;</span>')
    expect(html.match(/<span>Not selected<\/span>/g)).toHaveLength(2)
    expect(html).not.toContain('k1')
    const markdown = arxMarkdown(raw, 'notes/example.arx')
    expect(markdown).toContain('High')
    expect(markdown).toContain('Done')
    expect(markdown).not.toContain('k1')
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

test('renders structured editor blocks and escaped plugin text with stable anchors', () => {
  const { html, status } = arxReader(
    document([
      {
        type: 'columns',
        attrs: { arxId: 'layout' },
        content: [
          {
            type: 'column',
            content: [{ type: 'section', attrs: { title: 'Details' }, content: [{ type: 'paragraph', content: [text('Inside')] }] }],
          },
          {
            type: 'column',
            content: [
              {
                type: 'table',
                content: [
                  { type: 'table_row', content: [{ type: 'table_header', content: [{ type: 'paragraph', content: [text('Cell')] }] }] },
                ],
              },
            ],
          },
        ],
      },
      { type: 'rating', attrs: { value: '<script>bad</script>' } },
      { type: 'image_block', attrs: { path: 'attachments/image.png', alt: 'Picture' } },
    ]),
    'note.arx',
    { text: (node) => (node.type === 'rating' ? String(node.attrs.value) : null) },
  )
  expect(status).toBe(200)
  expect(html).toContain('id="block-layout"')
  expect(html).toContain('<details open><summary>Details</summary>')
  expect(html).toContain('<table><tr><th colspan="1" rowspan="1">')
  expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;')
  expect(html).not.toContain('<script>bad')
  expect(html).toContain('/attachments/image.png')
})

test('markdown export preserves nesting and literal code while escaping plugin text', () => {
  const markdown = arxMarkdown(
    document([
      {
        type: 'task_list',
        content: [{ type: 'task_item', attrs: { checked: true }, content: [{ type: 'paragraph', content: [text('Finished')] }] }],
      },
      { type: 'code_block', attrs: { language: 'ts' }, content: [text('const code = "```"')] },
      { type: 'rating', attrs: { value: '<script>bad()</script>' } },
    ]),
    'note.arx',
    { text: (node) => (node.type === 'rating' ? String(node.attrs.value) : null) },
  )
  expect(markdown).toContain('- [x] Finished')
  expect(markdown).toContain('````ts')
  expect(markdown).not.toContain('<script>')
  expect(markdown).toContain('&lt;script&gt;')
})

test('nested markdown lists render each plugin value once and keep parentheses in link destinations', () => {
  let value: unknown = { type: 'rating' }
  for (let i = 0; i < 10; i++) value = { type: 'bullet_list', content: [{ type: 'list_item', content: [value] }] }
  let calls = 0
  const markdown = arxMarkdown(
    document([
      value,
      {
        type: 'paragraph',
        content: [{ ...text('Link'), marks: [{ type: 'link', attrs: { href: 'https://example.org/a(b)' } }] }],
      },
    ]),
    'note.arx',
    {
      text: () => {
        calls++
        return 'Rating'
      },
    },
  )
  expect(calls).toBe(1)
  expect(markdown).toContain('[Link](<https://example.org/a(b)>)')
})
