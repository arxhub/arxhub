<script setup lang="ts">
import type { LogRecord } from '@arxhub/logger'
import { Button, IconButton, Input, Row, Strip } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import dayjs from 'dayjs'
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { LoggerExtension } from '../logger-extension'

type LevelName = 'debug' | 'info' | 'warn' | 'error'
const LEVELS: { name: LevelName; value: number }[] = [
  { name: 'debug', value: 20 },
  { name: 'info', value: 30 },
  { name: 'warn', value: 40 },
  { name: 'error', value: 50 },
]
const STRUCTURAL = new Set(['level', 'time', 'msg', 'name'])

function levelName(level: number): LevelName {
  if (level >= 50) return 'error'
  if (level >= 40) return 'warn'
  if (level >= 30) return 'info'
  return 'debug'
}

// What the row role calls a condition. The level is the entry's own vocabulary; danger/warning is the
// product's, and it is what puts the marker on the leading edge of the line that failed.
function levelTone(level: number): 'neutral' | 'danger' | 'warning' {
  if (level >= 50) return 'danger'
  if (level >= 40) return 'warning'
  return 'neutral'
}

const arxhub = useArxHub()
const ext = arxhub.extensions.get(LoggerExtension)

const enabled = ref<Record<LevelName, boolean>>({ debug: true, info: true, warn: true, error: true })
const search = ref('')
// Source: '' = live buffer, otherwise a past session file path.
const source = ref('')
const sessions = ref<string[]>([])
const loaded = shallowRef<LogRecord[]>([])

const records = computed(() => (source.value === '' ? ext.records.value : loaded.value))

const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  return records.value.filter((r) => {
    if (!enabled.value[levelName(r.level)]) return false
    if (q === '') return true
    return r.msg.toLowerCase().includes(q) || (r.name ?? '').toLowerCase().includes(q)
  })
})

function extras(record: LogRecord): string {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(record)) {
    if (!STRUCTURAL.has(k)) out[k] = v
  }
  return Object.keys(out).length > 0 ? JSON.stringify(out) : ''
}

function toggle(name: LevelName): void {
  enabled.value = { ...enabled.value, [name]: !enabled.value[name] }
}

async function loadSessions(): Promise<void> {
  sessions.value = await ext.listSessions()
}

async function onSourceChange(): Promise<void> {
  if (source.value === '') {
    loaded.value = []
    return
  }
  try {
    loaded.value = await ext.loadSession(source.value)
  } catch (error) {
    arxhub.logger.error('Failed to load log session', error)
    loaded.value = []
  }
}

// Follow-tail: keep pinned to the bottom on new live records unless the user has scrolled up.
const scroller = ref<HTMLElement>()
const pinned = ref(true)

function onScroll(): void {
  const el = scroller.value
  if (!el) return
  pinned.value = el.scrollHeight - el.scrollTop - el.clientHeight < 24
}

watch(
  () => visible.value.length,
  () => {
    if (source.value !== '' || !pinned.value) return
    nextTick(() => {
      const el = scroller.value
      if (el) el.scrollTop = el.scrollHeight
    })
  },
)

onMounted(loadSessions)
</script>

<template>
  <div class="log-panel">
    <Strip>
      <div class="levels">
        <button
          v-for="lvl in LEVELS"
          :key="lvl.name"
          type="button"
          class="chip"
          :class="[lvl.name, { off: !enabled[lvl.name] }]"
          :aria-pressed="enabled[lvl.name]"
          @click="toggle(lvl.name)"
        >
          {{ lvl.name }}
        </button>
      </div>
      <template #actions>
        <IconButton icon="lu:refresh-cw" tooltip="Reload sessions" @click="loadSessions" />
        <Button variant="secondary" size="sm" :disabled="source !== ''" @click="ext.clear()">Clear</Button>
      </template>
    </Strip>
    <Strip>
      <div class="search">
        <Input v-model="search" placeholder="Filter logs…" aria-label="Filter logs" />
      </div>
      <select v-model="source" class="session" aria-label="Log session" @change="onSourceChange">
        <option value="">Live</option>
        <option v-for="s in sessions" :key="s" :value="s">{{ s.replace('logs/', '') }}</option>
      </select>
    </Strip>

    <div ref="scroller" class="rows" @scroll="onScroll">
      <div v-if="visible.length === 0" class="empty">No log entries.</div>
      <!-- An entry is read and copied, never activated, and a long message grows the line downwards. -->
      <Row v-for="(r, i) in visible" :key="i" plain wrap class="log-row" :tone="levelTone(r.level)">
        <span class="time">{{ dayjs(r.time).format('HH:mm:ss.SSS') }}</span>
        <span class="level" :class="levelName(r.level)">{{ levelName(r.level) }}</span>
        <span v-if="r.name" class="scope">{{ r.name }}</span>
        <span class="msg">{{ r.msg }}</span>
        <span v-if="extras(r)" class="extras">{{ extras(r) }}</span>
      </Row>
    </div>
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

.levels {
  display: flex;
  gap: 4px;
}

.chip {
  height: var(--size-xs);
  padding: 0 8px;
  border-radius: var(--radius-full);
  border: 1px solid var(--gray-6);
  background: var(--gray-3);
  color: var(--gray-11);
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  text-transform: uppercase;
  cursor: pointer;
}

.chip.off {
  background: var(--gray-2);
  color: var(--gray-9);
  border-color: var(--gray-6);
}

.chip.debug { border-color: var(--gray-7); color: var(--gray-11); }
.chip.info { border-color: var(--accent-7); color: var(--accent-11); }
.chip.warn { border-color: var(--warning-7); color: var(--warning-11); }
.chip.error { border-color: var(--danger-7); color: var(--danger-11); }

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

.chip:focus-visible,
.session:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.rows {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-xs);
  padding: 4px 0;
}

.empty {
  padding: 16px;
  color: var(--gray-10);
  text-align: center;
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
