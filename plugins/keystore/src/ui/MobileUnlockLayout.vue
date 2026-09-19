<template>
  <!-- This remains outside the app landmark for the same reason as the desktop gate. The inner flex
       item uses auto block margins: it centres on a tall phone and falls back to the safe top edge
       when the keypad and recovery copy are taller than a short viewport. -->
  <div class="gate">
    <div class="viewport">
      <div class="card">
        <header class="intro">
          <slot name="title" />
          <slot name="help" />
        </header>
        <div class="content"><slot /></div>
        <div class="actions"><slot name="actions" /></div>
        <div v-if="$slots.recovery" class="recovery"><slot name="recovery" /></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gate {
  position: fixed;
  inset: 0;
  z-index: 9999;
  overflow-y: auto;
  background-color: var(--gray-1);
  font-family: var(--font-sans);
}

.viewport {
  display: flex;
  min-height: 100%;
  padding: max(24px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
}

.card {
  --unlock-copy-align: center;
  --unlock-action-direction: column;
  --unlock-action-align: stretch;
  --unlock-action-width: 100%;
  --unlock-recovery-align: center;

  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 360px;
  margin: auto;
}

.intro,
.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.intro {
  align-items: center;
}

.intro :deep(.title) {
  font-size: var(--font-size-2xl);
}

.content,
.actions,
.recovery {
  width: 100%;
}
</style>
