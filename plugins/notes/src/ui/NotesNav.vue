<script setup lang="ts">
import { useArxHub } from '@arxhub/uikit/hooks'
import { NotesExtension } from '../notes-extension'

// A wrapper with a permanent identity. The type is registered once and for good, while its navigation
// is put in by the explorer — a plugin that can be switched off and that configures later. Putting the
// component in directly is not an option: the type registry keeps its entries `markRaw`, and swapping
// a field there would go unnoticed.
const notes = useArxHub().extensions.get(NotesExtension)
</script>

<template>
  <component :is="notes.nav.value" v-if="notes.nav.value != null" />
  <!-- No tree means the explorer is off. That state is reachable (the plugin is switchable) and
       staying quiet about it is not an option: an empty column reads as broken. -->
  <p v-else class="notes-nav-empty">The explorer is switched off, so there is no vault tree here. Notes open from search.</p>
</template>

<style scoped>
.notes-nav-empty {
  margin: 0;
  padding: 16px;
  color: var(--gray-10);
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
}
</style>
