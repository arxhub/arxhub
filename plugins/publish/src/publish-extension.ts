import { Extension, type ExtensionArgs } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import type { Publisher } from './publisher'

// The inter-plugin surface for publishing. `publisher` is injected by PublishPlugin.start() once
// the server URL and identity are configured; until then the extension reports disabled and other
// plugins (explorer menu) simply contribute nothing.
export class PublishExtension extends Extension {
  publisher: Publisher | null = null

  constructor(args: ExtensionArgs) {
    super(args)
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
