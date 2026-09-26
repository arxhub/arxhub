import type { ObjectBar } from '@arxhub/plugin-shell'
import { toaster } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import type { PublishExtension } from '../publish-extension'
import type { PublicationRecord } from '../publish-history'

export function counts(entry: PublicationRecord): string {
  const roots = `${entry.roots.length} ${entry.roots.length === 1 ? 'root' : 'roots'}`
  const files = `${entry.files} ${entry.files === 1 ? 'file' : 'files'}`
  return `${roots} · ${files}`
}

export function short(hash: string): string {
  return hash.slice(0, 8)
}

// The Publications screen's own state: which path is in hand, and whether an operation is running. It outlives
// the page because the phone's band acts on the chosen path and the second-tap sheet chooses it.
export class PublicationsView {
  // One operation at a time: the Publisher serialises them anyway, so a second tap would only queue a
  // duplicate behind the first.
  readonly busy = ref(false)
  private readonly chosen = ref<string | null>(null)

  // The chosen path while it is still published, otherwise the first — a band naming a path that was just
  // unpublished would offer to copy a link that no longer answers.
  readonly current = computed(() => {
    const roots = this.publish.roots.value
    return this.chosen.value != null && roots.includes(this.chosen.value) ? this.chosen.value : (roots[0] ?? null)
  })

  constructor(private readonly publish: PublishExtension) {}

  choose(root: string): void {
    this.chosen.value = root
  }

  private act(action: Promise<void>, context: string): void {
    this.busy.value = true
    this.publish.run(
      action.finally(() => {
        this.busy.value = false
      }),
      context,
    )
  }

  copyLink(root: string): void {
    const url = this.publish.publicUrl(root)
    if (url == null) return
    this.act(
      navigator.clipboard.writeText(url).then(() => {
        toaster.create({ title: 'Link copied', description: url, type: 'success' })
      }),
      `copy link for ${root}`,
    )
  }

  openInBrowser(root: string): void {
    const url = this.publish.publicUrl(root)
    if (url == null) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  republish(root: string): void {
    this.act(
      this.publish.publish(root).then(() => {
        toaster.create({ title: 'Published', description: this.publish.publicUrl(root) ?? root, type: 'success' })
      }),
      `publish ${root}`,
    )
  }

  unpublish(root: string): void {
    this.act(
      this.publish.unpublish(root).then(() => {
        toaster.create({ title: 'Unpublished', description: root, type: 'success' })
      }),
      `unpublish ${root}`,
    )
  }

  rollback(entry: PublicationRecord): void {
    this.act(
      this.publish.rollback(entry.hash).then(() => {
        toaster.create({ title: 'Rolled back', description: `${counts(entry)} are public again`, type: 'success' })
      }),
      `roll back to ${short(entry.hash)}`,
    )
  }
}

const views = new WeakMap<PublishExtension, PublicationsView>()

export function publicationsView(publish: PublishExtension): PublicationsView {
  let view = views.get(publish)
  if (view == null) {
    view = new PublicationsView(publish)
    views.set(publish, view)
  }
  return view
}

// The phone's band in Publications: the path in hand and what is done to it — its link first, the rest in More
// with Unpublish last. Nothing published leaves a name and no keys: there is nothing to act on.
export function publicationsBar(publish: PublishExtension): ObjectBar {
  const view = publicationsView(publish)
  const count = publish.roots.value.length
  const root = view.current.value
  if (root == null) return { icon: 'lu:globe', name: 'Publications', sub: publish.enabled ? 'Nothing published' : 'Publishing is off' }
  const busy = view.busy.value
  return {
    icon: 'lu:globe',
    name: root,
    sub: `${count} published ${count === 1 ? 'path' : 'paths'}`,
    actions: [{ id: 'publish.copy', label: 'Copy link', icon: 'lu:link', disabled: busy, onSelect: () => view.copyLink(root) }],
    menu: [
      { id: 'publish.open', label: 'Open in browser', icon: 'lu:external-link', disabled: busy, onSelect: () => view.openInBrowser(root) },
      { id: 'publish.republish', label: 'Republish', icon: 'lu:globe', disabled: busy, onSelect: () => view.republish(root) },
      { id: 'publish.unpublish', label: 'Unpublish', icon: 'lu:eye-off', tone: 'danger', disabled: busy, onSelect: () => view.unpublish(root) },
    ],
  }
}
