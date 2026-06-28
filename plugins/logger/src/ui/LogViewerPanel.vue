<script setup lang="ts">
import type { LogRecord } from '@arxhub/logger'
import { Button, IconButton, Input } from '@arxhub/uikit/core'
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
    <div class="toolbar">
      <div class="levels">
        <button
          v-for="lvl in LEVELS"
          :key="lvl.name"
          type="button"
          class="chip"
          :class="[lvl.name, { off: !enabled[lvl.name] }]"
          @click="toggle(lvl.name)"
        >
          {{ lvl.name }}
        </button>
      </div>
      <div class="search">
        <Input v-model="search" placeholder="Filter logs…" />
      </div>
      <select v-model="source" class="session" @change="onSourceChange">
        <option value="">Live</option>
        <option v-for="s in sessions" :key="s" :value="s">{{ s.replace('logs/', '') }}</option>
      </select>
      <IconButton icon="lu:refresh-cw" tooltip="Reload sessions" @click="loadSessions" />
      <Button variant="secondary" size="sm" :disabled="source !== ''" @click="ext.clear()">Clear</Button>
    </div>

    <div ref="scroller" class="rows" @scroll="onScroll">
      <div v-if="visible.length === 0" class="empty">No log entries.</div>
      <div v-for="(r, i) in visible" :key="i" class="row" :class="levelName(r.level)">
        <span class="time">{{ dayjs(r.time).format('HH:mm:ss.SSS') }}</span>
        <span class="level" :class="levelName(r.level)">{{ levelName(r.level) }}</span>
        <span v-if="r.name" class="scope">{{ r.name }}</span>
        <span class="msg">{{ r.msg }}</span>
        <span v-if="extras(r)" class="extras">{{ extras(r) }}</span>
      </div>
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

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--gray-4);
  flex-shrink: 0;
}

.levels {
  display: flex;
  gap: 4px;
}

.chip {
  padding: 2px 8px;
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
  opacity: 0.4;
}

.chip.debug { border-color: var(--gray-7); color: var(--gray-11); }
.chip.info { border-color: var(--accent-7); color: var(--accent-11); }
.chip.warn { border-color: var(--warning-7); color: var(--warning-11); }
.chip.error { border-color: var(--red-7); color: var(--red-11); }

.search {
  flex: 1;
  min-width: 80px;
}

.session {
  max-width: 220px;
  height: var(--size-sm);
  background: var(--gray-1);
  color: var(--gray-12);
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  padding: 0 6px;
}

.rows {
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

.row {
  display: flex;
  gap: 8px;
  padding: 1px 8px;
  white-space: pre-wrap;
  word-break: break-word;
  border-left: 2px solid transparent;
}

.row.warn { border-left-color: var(--warning-9); }
.row.error { border-left-color: var(--red-9); background: var(--red-a2); }

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
.level.error { color: var(--red-11); }

.scope { color: var(--accent-11); flex-shrink: 0; }
.msg { color: var(--gray-12); }
.extras { color: var(--gray-10); }
</style>
