<script setup lang="ts">
import { modals } from '@arxhub/uikit/core'
import { armExitGuard, leaveApp, useShellFrame } from '@arxhub/uikit/hooks'
import { onUnmounted } from 'vue'

// On a phone the gesture that closes a sheet is the gesture that leaves the app, so the one back too
// many throws the owner out of ArxHub without a word — and there is no forward gesture to come back
// with. This asks first (OR-04).
//
// Mobile only: on the desktop back is the browser's own history, where leaving is what the owner
// meant and a question over it would be the app arguing with the browser. The frame is asked rather
// than assumed, even though only MobileShell mounts this — a component that is honest about the frame
// it needs cannot be quietly reused into the wrong one.
if (useShellFrame() === 'mobile') {
  onUnmounted(
    armExitGuard(() => {
      modals.openConfirmModal({
        title: 'Leave ArxHub?',
        children: 'Nothing is left to close, so back leaves the app.',
        labels: { confirm: 'Exit', cancel: 'Cancel' },
        // Dismissing the question — the close button, a tap outside, back again — is a cancel, which
        // is why leaving hangs off this one callback and off nothing else (F-13).
        onConfirm: leaveApp,
      })
    }),
  )
}
</script>

<template>
  <!-- Nothing to draw: the question is a modal, and the registry owns where a modal goes. -->
</template>
