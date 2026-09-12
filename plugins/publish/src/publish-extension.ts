import { Extension, type ExtensionArgs } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import { basename } from '@arxhub/path'
import type { ActionItem } from '@arxhub/uikit/core'
import { toaster } from '@arxhub/uikit/hooks'
import { publicUrl } from './public-url'
import type { Publisher } from './publisher'
import { type ArxNode, arxAssetPaths, arxMarkdown, arxReader } from './server/arx-reader'
import { contentTypeFor } from './server/content-type'

// Local export uses the same reader without requiring a configured public server.
export class PublishExtension extends Extension {
  publisher: Publisher | null = null
  // The origin published content is readable from — the same server the publisher uploads to.
  serverUrl = ''
  readFile: ((path: string) => Promise<Uint8Array>) | null = null
  beforeRead: ((path: string) => Promise<boolean>) | null = null
  normalizeArx: ((raw: string) => string) | null = null
  private readonly textProviders = new Map<string, (node: ArxNode) => string | null>()

  registerArxTextProvider(id: string, provider: (node: ArxNode) => string | null): void {
    if (this.textProviders.has(id)) throw illegalState(`Duplicate publication text provider: ${id}`)
    this.textProviders.set(id, provider)
  }

  renderArx(raw: string, path: string, assets?: ReadonlyMap<string, string>) {
    try {
      raw = this.normalizeArx?.(raw) ?? raw
    } catch {
      return arxReader(raw, path, { assets })
    }
    return arxReader(raw, path, {
      assets,
      text: (node) => {
        for (const provider of this.textProviders.values()) {
          const result = provider(node)
          if (result !== null) return result
        }
        return null
      },
    })
  }

  private async exportContent(path: string): Promise<{ raw: string; assets: Map<string, string> }> {
    if (!this.readFile) throw illegalState('Publication storage is not available')
    if (this.beforeRead && !(await this.beforeRead(path))) throw illegalState('Save or recover the document before exporting it')
    const raw = new TextDecoder().decode(await this.readFile(path))
    const assets = new Map<string, string>()
    for (const asset of arxAssetPaths(raw)) {
      const bytes = await this.readFile(asset)
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768))
      assets.set(asset, `data:${contentTypeFor(asset)};base64,${btoa(binary)}`)
    }
    return { raw, assets }
  }

  async exportHtml(path: string): Promise<{ html: string; filename: string }> {
    const { raw, assets } = await this.exportContent(path)
    const page = this.renderArx(raw, path, assets)
    if (page.status !== 200) throw illegalState('This document cannot be exported with the installed plugins')
    const source = new TextEncoder().encode(raw)
    let binary = ''
    for (let offset = 0; offset < source.length; offset += 32768) binary += String.fromCharCode(...source.subarray(offset, offset + 32768))
    const html = page.html
      .replace(
        /<a href="[^"]*\?source=1" download>Download source<\/a>/,
        () => `<a href="data:application/json;base64,${btoa(binary)}" download="document.arx">Download source</a>`,
      )
      .replace(/<a href="[^"]*\?html=1" download>Download HTML<\/a>/, '')
    return { html, filename: `${basename(path, '.arx')}.html` }
  }

  async exportMarkdown(path: string): Promise<{ markdown: string; filename: string }> {
    const { raw, assets } = await this.exportContent(path)
    const normalized = this.normalizeArx?.(raw) ?? raw
    const markdown = arxMarkdown(normalized, path, {
      assets,
      text: (node) => {
        for (const provider of this.textProviders.values()) {
          const result = provider(node)
          if (result !== null) return result
        }
        return null
      },
    })
    return { markdown, filename: `${basename(path, '.arx')}.md` }
  }

  documentActions(path: string): ActionItem[] {
    if (!path.toLowerCase().endsWith('.arx')) return []
    const run = (action: Promise<void>) => {
      action.catch((error) =>
        toaster.create({ title: 'Export failed', description: error instanceof Error ? error.message : String(error), type: 'error' }),
      )
    }
    return [
      { id: 'export-markdown', label: 'Export Markdown', icon: 'lu:download', onSelect: () => run(this.downloadMarkdown(path)) },
      { id: 'export-html', label: 'Export HTML', icon: 'lu:download', onSelect: () => run(this.downloadHtml(path)) },
      { id: 'print-document', label: 'Print / Save PDF', icon: 'lu:printer', onSelect: () => run(this.printDocument(path)) },
    ]
  }

  private async downloadHtml(path: string): Promise<void> {
    const { html, filename } = await this.exportHtml(path)
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }

  private async downloadMarkdown(path: string): Promise<void> {
    const { markdown, filename } = await this.exportMarkdown(path)
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30000)
  }

  private async printDocument(path: string): Promise<void> {
    const { html } = await this.exportHtml(path)
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-modals allow-same-origin')
    frame.setAttribute('aria-hidden', 'true')
    Object.assign(frame.style, { position: 'fixed', left: '-10000px', width: '800px', height: '600px' })
    frame.srcdoc = html.replaceAll('loading="lazy"', 'loading="eager"')
    frame.onload = async () => {
      try {
        await Promise.all(Array.from(frame.contentDocument?.images ?? []).map((image) => image.decode().catch(() => {})))
        frame.contentWindow?.addEventListener('afterprint', () => frame.remove(), { once: true })
        frame.contentWindow?.focus()
        frame.contentWindow?.print()
      } catch (error) {
        toaster.create({ title: 'Printing failed', description: String(error), type: 'error' })
      } finally {
        setTimeout(() => frame.remove(), 60000)
      }
    }
    document.body.append(frame)
  }

  constructor(args: ExtensionArgs) {
    super(args)
  }

  // The address to hand to a reader. Publishing that produces no shareable link is publishing the
  // owner cannot use.
  publicUrl(path: string): string | null {
    if (!this.enabled || !this.serverUrl) return null
    return publicUrl(path, this.serverUrl)
  }

  get enabled(): boolean {
    return this.publisher != null
  }

  isPublished(path: string): boolean {
    return this.publisher?.isPublished(path) ?? false
  }

  async publish(path: string): Promise<void> {
    if (this.publisher == null) throw illegalState('Publishing is not configured — set the server URL and identity in Settings')
    await this.publisher.publish(path)
  }

  async unpublish(path: string): Promise<void> {
    if (this.publisher == null) throw illegalState('Publishing is not configured — set the server URL and identity in Settings')
    await this.publisher.unpublish(path)
  }
}
