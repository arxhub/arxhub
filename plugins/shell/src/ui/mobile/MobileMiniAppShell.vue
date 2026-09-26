<script setup lang="ts">
// Accepted for one shape across both frames; a phone has neither a second column to size nor a panel to
// put a rail in. A mini-app's navigation reaches the phone through its type instead — `TabType.nav` or
// `TabType.sheet`, behind a second tap on the type — which is one road for every type rather than a
// teleport only a mini-app could use.
defineProps<{ widthKey?: string; rail?: boolean }>()
</script>

<template>
  <!-- The content is the whole screen. -->
  <div class="mini-app-shell">
    <slot />
  </div>
</template>

<style scoped>
.mini-app-shell {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
