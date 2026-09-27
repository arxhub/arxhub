<script setup lang="ts">
import { Card } from '@arxhub/uikit/core'
import { onBeforeUnmount, onMounted } from 'vue'
import { t } from '../../i18n/messages'
import PhraseWords from '../entry/PhraseWords.vue'

// The twelve words, shown after the code. They are hidden the moment the screen is left — closed, or
// the app sent to the background — so a phrase is never left on screen for whoever picks the device up.
defineProps<{ words: readonly string[] }>()
const emit = defineEmits<{ hide: [] }>()

function onVisibility(): void {
  if (document.visibilityState === 'hidden') emit('hide')
}

onMounted(() => document.addEventListener('visibilitychange', onVisibility))
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  emit('hide')
})
</script>

<template>
  <p class="text">{{ t('phrase.hideNote') }}</p>
  <div data-testid="recovery-phrase"><PhraseWords :words="words" /></div>
  <Card notice variant="warning" icon="lu:triangle-alert" :title="t('phrase.warning')" />
</template>

<style scoped>
.text {
  margin: 0;
  line-height: var(--line-height-normal);
  color: var(--gray-11);
}
</style>
