<script setup lang="ts">
import { useNavHost } from '@arxhub/plugin-shell/ui'
import { EmptyState, Row } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { PublishExtension } from '../publish-extension'
import { publicationsView } from './publications-view'

// The second tap on Publications: the published paths. Choosing one puts it in the band, where its link and
// the rest of what is done to a publication are.
const publish = useArxHub().extensions.get(PublishExtension)
const view = publicationsView(publish)
const navHost = useNavHost()
const roots = publish.roots
const current = view.current

function pick(root: string): void {
  view.choose(root)
  navHost?.navigated?.()
}
</script>

<template>
  <nav aria-label="Published paths" data-testid="published-paths">
    <EmptyState v-if="roots.length === 0" compact icon="lu:globe" text="Nothing is published." />
    <Row
      v-for="root in roots"
      :key="root"
      as="button"
      type="button"
      icon="lu:globe"
      :label="root"
      :detail="publish.publicUrl(root) ?? undefined"
      :selected="root === current"
      :checked="root === current"
      :aria-current="root === current ? 'true' : undefined"
      @click="pick(root)"
    />
  </nav>
</template>
