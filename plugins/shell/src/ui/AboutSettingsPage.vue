<script setup lang="ts">
import { PageLayout } from '@arxhub/uikit/core'
import { ref } from 'vue'

const props = defineProps<{ version: string; repository?: string }>()
const state = ref<'idle' | 'checking' | 'current' | 'available' | 'failed'>('idle')
const latest = ref<{ version: string; url: string } | null>(null)

async function checkForUpdates(): Promise<void> {
  state.value = 'checking'
  latest.value = null
  try {
    const response = await fetch(`https://api.github.com/repos/${props.repository ?? 'arxhub/arxhub'}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`)
    const release = (await response.json()) as { tag_name?: string; html_url?: string }
    if (!release.tag_name || !release.html_url) throw new Error('GitHub release has no version or URL')
    const version = release.tag_name.replace(/^v/, '')
    latest.value = { version, url: release.html_url }
    state.value = version === props.version ? 'current' : 'available'
  } catch {
    state.value = 'failed'
  }
}
</script>

<template>
  <PageLayout
    title="About"
    description="Quote this version when reporting a problem — the session log records it too."
  >
    <div class="about-row">
      <span class="label">Version</span>
      <code class="value" data-testid="app-version">{{ props.version }}</code>
    </div>
    <div class="update-row">
      <button class="update-button" type="button" :disabled="state === 'checking'" @click="checkForUpdates">
        {{ state === 'checking' ? 'Checking…' : 'Check for updates' }}
      </button>
      <span v-if="state === 'current'" class="update-message">You are up to date.</span>
      <span v-else-if="state === 'failed'" class="update-message update-error">Could not check GitHub Releases.</span>
      <template v-else-if="state === 'available' && latest">
        <span class="update-message">Version {{ latest.version }} is available.</span>
        <a class="update-link" :href="latest.url" target="_blank" rel="noreferrer">Open download page</a>
      </template>
    </div>
  </PageLayout>
</template>

<style scoped>
.about-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  font-size: var(--font-size-sm);
  color: var(--gray-11);
}

.value {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--gray-12);
}

.update-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.update-button {
  height: var(--size-xs);
  padding: 0 12px;
  border: 1px solid var(--gray-7);
  border-radius: var(--radius-xs);
  background: var(--gray-1);
  color: var(--gray-12);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-size-sm);
}

.update-button:disabled {
  color: var(--gray-9);
  cursor: wait;
}

.update-message {
  color: var(--gray-11);
  font-size: var(--font-size-sm);
}

.update-error {
  color: var(--danger-11);
}

.update-link {
  color: var(--accent-11);
  font-size: var(--font-size-sm);
}
</style>
