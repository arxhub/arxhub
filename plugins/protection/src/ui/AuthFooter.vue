<script setup lang="ts">
import { computed } from 'vue'
import { authStatus, describeRejection } from '../auth-status'
import { openAuthRejectedDialog } from './auth-dialog'

// The standing reminder only. The dialog itself is opened through the modal registry (see auth-dialog)
// so it does not depend on this item being mounted — on the mobile frame it is not, until the More
// sheet is open.
const rejection = computed(() => authStatus.rejection.value)
const copy = computed(() => describeRejection(rejection.value?.reason ?? null))
</script>

<template>
  <button v-if="rejection != null" class="auth-alert" type="button" :title="copy.title" @click="openAuthRejectedDialog()">
    {{ copy.label }}
  </button>
</template>

<style scoped>
.auth-alert {
  height: var(--size-md);
  padding: 0 8px;
  border: none;
  border-radius: var(--radius-xs);
  background: var(--danger-3);
  color: var(--danger-11);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

.auth-alert:hover {
  background: var(--danger-4);
}

.auth-alert:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: 1px;
}
</style>
