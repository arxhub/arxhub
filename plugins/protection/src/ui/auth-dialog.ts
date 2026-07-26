import { modals, openModals } from '@arxhub/uikit/core'
import { markRaw } from 'vue'
import { authStatus, describeRejection } from '../auth-status'
import AuthRejectedDialog from './AuthRejectedDialog.vue'

// One fixed id: the dialog is about a condition, not an event, so a second refusal reuses it instead of
// stacking another copy behind the first.
export const AUTH_MODAL_ID = 'arxhub.protection.rejected'

// Opened through the shared modal registry rather than rendered inside the status-bar item, because on
// the mobile frame that item only mounts while the More sheet is open — a dialog living there would
// never announce anything until the user went looking for it. ModalsProvider sits at the root of both
// frames, so this reaches the screen from a plugin, before anything of protection's own is mounted.
export function openAuthRejectedDialog(): void {
  if (openModals.value.some((modal) => modal.id === AUTH_MODAL_ID)) return
  modals.open({
    modalId: AUTH_MODAL_ID,
    title: describeRejection(authStatus.rejection.value?.reason ?? null).title,
    size: 'md',
    centered: true,
    content: markRaw(AuthRejectedDialog),
  })
}

export function closeAuthRejectedDialog(): void {
  modals.close(AUTH_MODAL_ID)
}
