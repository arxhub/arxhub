<template>
  <!-- Deliberately not <main>: the app's own main landmark is what tells the rest of the suite (and
       a screen reader) that the app itself has come up, and the gate must not answer to that. -->
  <div class="gate">
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
</template>

<style scoped>
.gate {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: 16px;
  overflow-y: auto;
  background-color: var(--gray-1);
  font-family: var(--font-sans);
}

.card,
.intro,
.content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.intro :deep(.title) {
  font-size: var(--font-size-lg);
}

.card {
  width: 100%;
  max-width: 320px;
}
</style>
