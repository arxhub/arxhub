import type { ObjectBar } from '@arxhub/plugin-shell'
import { toaster } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { t } from '../i18n/messages'
import type { PublishExtension } from '../publish-extension'
import type { PublicationRecord } from '../publish-history'

export function counts(entry: PublicationRecord): string {
  return `${t('counts.roots', { count: entry.roots.length })} · ${t('counts.files', { count: entry.files })}`
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

  private act(action: Promise<void>, context: string, failure: string): void {
    this.busy.value = true
    this.publish.run(
      action.finally(() => {
        this.busy.value = false
      }),
      context,
      failure,
    )
  }

  copyLink(root: string): void {
    const url = this.publish.publicUrl(root)
    if (url == null) return
    this.act(
      navigator.clipboard.writeText(url).then(() => {
        toaster.create({ title: t('toast.linkCopied'), description: url, type: 'success' })
      }),
      `copy link for ${root}`,
      t('failed.copyLink', { path: root }),
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
        toaster.create({ title: t('toast.published'), description: this.publish.publicUrl(root) ?? root, type: 'success' })
      }),
      `publish ${root}`,
      t('failed.publish', { path: root }),
    )
  }

  unpublish(root: string): void {
    this.act(
      this.publish.unpublish(root).then(() => {
        toaster.create({ title: t('toast.unpublished'), description: root, type: 'success' })
      }),
      `unpublish ${root}`,
      t('failed.unpublish', { path: root }),
    )
  }

  rollback(entry: PublicationRecord): void {
    this.act(
      this.publish.rollback(entry.hash).then(() => {
        toaster.create({
          title: t('toast.rolledBack'),
          description: t('toast.rolledBackDescription', { counts: counts(entry) }),
          type: 'success',
        })
      }),
      `roll back to ${short(entry.hash)}`,
      t('failed.rollBack', { hash: short(entry.hash) }),
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
  if (root == null) return { icon: 'lu:globe', name: t('type.title'), sub: publish.enabled ? t('bar.nothingPublished') : t('bar.off') }
  const busy = view.busy.value
  return {
    icon: 'lu:globe',
    name: root,
    sub: t('counts.paths', { count }),
    actions: [{ id: 'publish.copy', label: t('action.copyLink'), icon: 'lu:link', disabled: busy, onSelect: () => view.copyLink(root) }],
    menu: [
      {
        id: 'publish.open',
        label: t('action.openInBrowser'),
        icon: 'lu:external-link',
        disabled: busy,
        onSelect: () => view.openInBrowser(root),
      },
      { id: 'publish.republish', label: t('action.republish'), icon: 'lu:globe', disabled: busy, onSelect: () => view.republish(root) },
      {
        id: 'publish.unpublish',
        label: t('action.unpublish'),
        icon: 'lu:eye-off',
        tone: 'danger',
        disabled: busy,
        onSelect: () => view.unpublish(root),
      },
    ],
  }
}
