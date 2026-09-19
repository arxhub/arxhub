<script setup lang="ts">
import { Button, Card, modals } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'

// Both branches are irreversible and neither is safer than the other, so neither is offered as a
// default: there is no primary button and no confirm-shaped pair to press through. Dismissing the
// dialog — Cancel, Escape, the back gesture — is always a cancel.
const props = defineProps<{
  modalId: string
  onKeepLocalFiles: () => void
  onTakeFromServer: () => void
}>()
const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const touch = useShellFrame() === 'mobile'

function choose(branch: () => void): void {
  modals.close(props.modalId)
  branch()
}
</script>

<template>
  <div class="handover" :class="{ touch }">
    <p class="lead">
      This recovery phrase belongs to a different owner, and this device holds files. Whichever you choose cannot be
      undone from here.
    </p>

    <Card title="Keep the local files">
      <p class="branch">
        Every file on this device stays where it is and is pushed into the new owner's history on the first sync. The
        new owner ends up holding your files.
      </p>
      <div class="branch-action">
        <Button :size="buttonSize" variant="danger" data-testid="handover-keep" @click="choose(props.onKeepLocalFiles)">
          Keep the local files
        </Button>
      </div>
    </Card>

    <Card title="Take everything from the server">
      <p class="branch">
        Every file on this device is deleted now, and the new owner's files replace them on the first sync. Anything
        here that was never synced is gone for good.
      </p>
      <div class="branch-action">
        <Button :size="buttonSize" variant="danger" data-testid="handover-take-server" @click="choose(props.onTakeFromServer)">
          Delete the local files
        </Button>
      </div>
    </Card>

    <div class="actions">
      <Button :size="buttonSize" variant="secondary" @click="modals.close(props.modalId)">Cancel</Button>
    </div>
  </div>
</template>

<style scoped>
.handover {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lead {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--gray-12);
}

.branch {
  margin: 0;
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-relaxed);
  color: var(--gray-11);
}

.handover.touch .lead,
.handover.touch .branch {
  font-size: var(--font-size-md);
}

.branch-action {
  display: flex;
  margin-top: 4px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}

.handover.touch .branch-action,
.handover.touch .actions {
  display: block;
}

.handover.touch .branch-action :deep(.btn),
.handover.touch .actions :deep(.btn) {
  width: 100%;
}
</style>
