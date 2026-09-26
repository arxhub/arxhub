<script setup lang="ts">
// The phone's realization of the document's chrome: only the announcement a screen reader hears when a
// save lands. What the desktop draws in its tab strip — the tools, the state — the phone's object band
// carries, from what the editor describes through `registerViewBar`; a bar of its own here was the second
// bottom bar the frame replaced.
// The dispatcher hands both realizations the same props; the ones only the desktop draws must not land
// on this element as attributes.
defineOptions({ inheritAttrs: false })
defineProps<{ status: string }>()
</script>
<template>
  <span class="save-announcement document-save-status" role="status" aria-live="polite">{{ status }}</span>
</template>
<style scoped>
.save-announcement { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
