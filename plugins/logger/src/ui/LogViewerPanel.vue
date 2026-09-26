<script setup lang="ts">
import type { LogRecord } from '@arxhub/logger'
// biome-ignore lint/style/useImportType: ScrollArea is used in template and as a type
import { Button, EmptyState, IconButton, Row, ScrollArea, SearchField } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import dayjs from 'dayjs'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { LEVELS, levelName, logView } from '../log-view'
import { LoggerExtension } from '../logger-extension'
import LogToolbar from './LogToolbar.vue'

const STRUCTURAL = new Set(['level', 'time', 'msg', 'name'])

// What the row role calls a condition. The level is the entry's own vocabulary; danger/warning is the
// product's, and it is what puts the marker on the leading edge of the line that failed.
function levelTone(level: number): 'neutral' | 'danger' | 'warning' {
  if (level >= 50) return 'danger'
  if (level >= 40) return 'warning'
  return 'neutral'
}

const arxhub = useArxHub()
const ext = arxhub.extensions.get(LoggerExtension)
const view = logView(ext, arxhub.logger)
const { enabled, source, sessions, visible } = view

function extras(record: LogRecord): string {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (!STRUCTURAL.has(k)) out[k] = v
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : ''
}

// Follow-tail: keep pinned to the bottom on new live records unless the user has scrolled up.
const area = ref<InstanceType<typeof ScrollArea> | null>(null)
const pinned = ref(true)

function onScroll(): void {
  const el = area.value?.viewport
  if (!el) return
  pinned.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24
}

watch(
  () => visible.value.length,
  () => {
    if (source.value !== '' || !pinned.value) return
    nextTick(() => {
      const el = area.value?.viewport
      if (el) el.scrollTop = el.scrollHeight
    })
  },
)

// On the viewport itself: scroll does not bubble, so a listener on the scroll area's root never fires.
let listening: HTMLElement | null = null
onMounted(() => {
  listening = area.value?.viewport ?? null
  listening?.addEventListener('scroll', onScroll, { passive: true })
  void view.loadSessions()
})
onBeforeUnmount(() => listening?.removeEventListener('scroll', onScroll))
</script>

<template>
  <div class="log-panel">
    <LogToolbar>
      <template #levels>
        <Button
          v-for="lvl in LEVELS"
          :key="lvl.name"
          type="button"
          class="chip"
          variant="ghost"
          size="sm"
          :active="enabled[lvl.name]"
          :aria-pressed="enabled[lvl.name]"
          @click="view.toggle(lvl.name)"
        >
          {{ lvl.name }}
        </Button>
      </template>
      <template #actions>
        <IconButton size="lg" icon="lu:refresh-cw" tooltip="Reload sessions" @click="view.loadSessions()" />
        <Button variant="secondary" size="sm" :disabled="source !== ''" @click="view.clear()">Clear</Button>
      </template>
      <template #search>
      <div class="search">
        <SearchField v-model="view.search.value" placeholder="Filter logs…" aria-label="Filter logs" />
      </div>
      </template>
      <template #session>
      <select :value="source" class="session" aria-label="Log session" @change="view.showSource(($event.target as HTMLSelectElement).value)">
        <option value="">Live</option>
        <option v-for="s in sessions" :key="s" :value="s">{{ s.replace('logs/', '') }}</option>
      </select>
      </template>
    </LogToolbar>

    <ScrollArea ref="area" class="rows" content-class="rows-content">
      <EmptyState v-if="visible.length === 0" icon="lu:scroll-text" text="No log entries." />
      <!-- An entry is read and copied, never activated, and a long message grows the line downwards. -->
      <Row v-for="(r, i) in visible" :key="i" plain wrap class="log-row" :tone="levelTone(r.level)">
        <span class="time">{{ dayjs(r.time).format('HH:mm:ss.SSS') }}</span>
        <span class="level" :class="levelName(r.level)">{{ levelName(r.level) }}</span>
        <span v-if="r.name" class="scope">{{ r.name }}</span>
        <span class="msg">{{ r.msg }}</span>
        <span v-if="extras(r)" class="extras">{{ extras(r) }}</span>
      </Row>
    </ScrollArea>
  </div>
</template>

<style scoped>
.log-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--gray-1);
  color: var(--gray-12);
}

.chip {
  text-transform: uppercase;
}

.search {
  flex: 1;
  min-width: 0;
}

.session {
  width: 40%;
  max-width: 220px;
  min-width: 0;
  height: var(--size-xs);
  background: var(--gray-1);
  color: var(--gray-12);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  padding: 0 8px;
}

.session:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.rows {
  flex: 1;
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-xs);
}

.rows :deep(.rows-content) {
  padding: 4px 0;
}

.log-row {
  white-space: pre-wrap;
  word-break: break-word;
}

/* A log line is a mono fact, not a label, so it keeps the ramp's xs step in both frames rather than the
   row role's text size — at 16px a message breaks mid-word in a phone-width column. Set on the columns
   rather than on the row, so the role still owns the row's own type. */
.log-row > span {
  font-size: var(--font-size-xs);
}

.time { color: var(--gray-10); flex-shrink: 0; }

.level {
  flex-shrink: 0;
  width: 44px;
  text-transform: uppercase;
  font-weight: var(--font-weight-bold);
}
.level.debug { color: var(--gray-10); }
.level.info { color: var(--accent-11); }
.level.warn { color: var(--warning-11); }
.level.error { color: var(--danger-11); }

.scope { color: var(--accent-11); flex-shrink: 0; }
.msg { color: var(--gray-12); }
.extras { color: var(--gray-10); }
</style>
