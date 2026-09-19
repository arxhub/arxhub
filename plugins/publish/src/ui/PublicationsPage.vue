<script setup lang="ts">
import { Badge, IconButton, PageLayout, Row } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { PublishExtension } from '../publish-extension'
import type { PublicationKind, PublicationRecord } from '../publish-history'
import PublicationActions from './PublicationActions.vue'

const arxhub = useArxHub()
const publish = arxhub.extensions.get(PublishExtension)
const roots = publish.roots
const history = publish.history
const rowIconSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'

const KIND_LABEL: Record<PublicationKind, string> = { publish: 'Published', unpublish: 'Unpublished', rollback: 'Rolled back' }

const enabled = computed(() => publish.enabled)
// One mono fact about where the page comes from — the server, or the reason there is none. The identity
// case (a server set, no phrase) lands here too, because the extension carries no origin until both hold;
// the log names which one is missing.
const meta = computed(() => (enabled.value ? publish.serverUrl : 'Publishing is off — set a server URL in Settings'))
// The newest entry IS the head as far as the synced record knows; every other entry with that hash says
// the same state, so none of them is offered as a place to go back to.
const head = computed(() => history.value[0]?.hash ?? null)

// One operation at a time from this page: the Publisher serialises them anyway, so a second click would
// only queue a duplicate behind the first.
const busy = ref(false)
function act(action: Promise<void>, context: string): void {
  busy.value = true
  publish.run(
    action.finally(() => {
      busy.value = false
    }),
    context,
  )
}

function copyLink(root: string): void {
  const url = publish.publicUrl(root)
  if (url == null) return
  act(
    navigator.clipboard.writeText(url).then(() => {
      toaster.create({ title: 'Link copied', description: url, type: 'success' })
    }),
    `copy link for ${root}`,
  )
}

function openInBrowser(root: string): void {
  const url = publish.publicUrl(root)
  if (url == null) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function republish(root: string): void {
  act(
    publish.publish(root).then(() => {
      toaster.create({ title: 'Published', description: publish.publicUrl(root) ?? root, type: 'success' })
    }),
    `publish ${root}`,
  )
}

function unpublish(root: string): void {
  act(
    publish.unpublish(root).then(() => {
      toaster.create({ title: 'Unpublished', description: root, type: 'success' })
    }),
    `unpublish ${root}`,
  )
}

function rollback(entry: PublicationRecord): void {
  act(
    publish.rollback(entry.hash).then(() => {
      toaster.create({ title: 'Rolled back', description: `${counts(entry)} are public again`, type: 'success' })
    }),
    `roll back to ${short(entry.hash)}`,
  )
}

function short(hash: string): string {
  return hash.slice(0, 8)
}

function when(at: string): string {
  return new Date(at).toLocaleString()
}

function counts(entry: PublicationRecord): string {
  const roots = `${entry.roots.length} ${entry.roots.length === 1 ? 'root' : 'roots'}`
  const files = `${entry.files} ${entry.files === 1 ? 'file' : 'files'}`
  return `${roots} · ${files}`
}
</script>

<template>
  <PageLayout
    title="Publications"
    :meta="[meta]"
    data-testid="publications-page"
    :data-publishing="enabled ? 'on' : 'off'"
  >
    <section class="block">
      <h3 class="block-title">Published</h3>
      <p v-if="roots.length === 0" class="hint" :data-testid="enabled ? 'publications-empty' : 'publishing-off-hint'">
        {{ enabled ? 'Nothing is published. Publish a note or a folder from the tree.' : 'Turn publishing on to share a note or a folder by link.' }}
      </p>
      <ul v-else class="list" data-testid="publications">
        <Row v-for="root in roots" :key="root" as="li" plain wrap class="publication">
          <div class="text">
            <span class="title">{{ root }}</span>
            <span class="meta mono">{{ publish.publicUrl(root) }}</span>
          </div>
          <div class="actions">
            <PublicationActions
              :busy="busy"
              :on-copy="() => copyLink(root)"
              :on-open="() => openInBrowser(root)"
              :on-republish="() => republish(root)"
              :on-unpublish="() => unpublish(root)"
            />
          </div>
        </Row>
      </ul>
    </section>

    <section class="block">
      <h3 class="block-title">History</h3>
      <p v-if="history.length === 0" class="hint">History starts with the first publication.</p>
      <ul v-else class="list" data-testid="publication-history">
        <Row v-for="entry in history" :key="`${entry.at}:${entry.hash}`" as="li" plain wrap class="publication">
          <div class="text">
            <span class="title">{{ KIND_LABEL[entry.kind] }} · {{ when(entry.at) }}</span>
            <span class="meta">{{ counts(entry) }} · <span class="mono">{{ short(entry.hash) }}</span></span>
          </div>
          <div class="actions">
            <Badge v-if="entry.hash === head">Current</Badge>
            <IconButton v-else :size="rowIconSize" icon="lu:undo-2" tooltip="Roll back" :disabled="busy" @click="rollback(entry)" />
          </div>
        </Row>
      </ul>
    </section>
  </PageLayout>
</template>

<style scoped>
.block + .block {
  margin-top: 24px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.hint {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--gray-11);
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.title {
  color: var(--gray-12);
  overflow-wrap: anywhere;
}

.meta {
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  overflow-wrap: anywhere;
}

.mono {
  font-family: var(--font-mono);
}

.actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
}
</style>
