<script setup lang="ts">
import { Badge, IconButton, PageLayout, Row } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { PublishExtension } from '../publish-extension'
import type { PublicationKind } from '../publish-history'
import PublicationActions from './PublicationActions.vue'
import { counts, publicationsView, short } from './publications-view'

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

const view = publicationsView(publish)
const busy = view.busy

function when(at: string): string {
  return new Date(at).toLocaleString()
}
</script>

<template>
  <!-- Attrs on a native root: PageLayout is a Vue SFC and does not declare these, and fallthrough
       onto its root is easy to lose across the uikit entry — e2e needs a stable hook for "off". -->
  <div class="publications" data-testid="publications-page" :data-publishing="enabled ? 'on' : 'off'">
    <PageLayout title="Publications" :meta="[meta]">
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
              :on-copy="() => view.copyLink(root)"
              :on-open="() => view.openInBrowser(root)"
              :on-republish="() => view.republish(root)"
              :on-unpublish="() => view.unpublish(root)"
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
            <IconButton v-else :size="rowIconSize" icon="lu:undo-2" tooltip="Roll back" :disabled="busy" @click="view.rollback(entry)" />
          </div>
        </Row>
      </ul>
    </section>
    </PageLayout>
  </div>
</template>

<style scoped>
.publications {
  height: 100%;
  min-height: 0;
}

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
