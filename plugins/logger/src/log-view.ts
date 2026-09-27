import type { Logger, LogRecord } from '@arxhub/logger'
import type { ObjectBar } from '@arxhub/plugin-shell'
import { computed, ref, shallowRef } from 'vue'
import { t } from './i18n/messages'
import type { LoggerExtension } from './logger-extension'

export type LevelName = 'debug' | 'info' | 'warn' | 'error'

export const LEVELS: { name: LevelName; value: number }[] = [
  { name: 'debug', value: 20 },
  { name: 'info', value: 30 },
  { name: 'warn', value: 40 },
  { name: 'error', value: 50 },
]

// Read at render time rather than stored on LEVELS, so a language switch reaches the sheet and the band.
export function levelLabel(name: LevelName): string {
  return t(`levels.${name}`)
}

export function levelName(level: number): LevelName {
  if (level >= 50) return 'error'
  if (level >= 40) return 'warn'
  if (level >= 30) return 'info'
  return 'debug'
}

// What the log viewer is showing: which levels, which session, what text. It outlives the panel because the
// phone's band says what the filter is and the second-tap sheet changes it — a filter held in the panel would
// be one the sheet cannot reach.
export class LogView {
  readonly enabled = ref<Record<LevelName, boolean>>({ debug: true, info: true, warn: true, error: true })
  readonly search = ref('')
  // '' is the live buffer, anything else a past session file.
  readonly source = ref('')
  readonly sessions = ref<string[]>([])
  private readonly loaded = shallowRef<LogRecord[]>([])
  private ticket = 0

  readonly records = computed(() => (this.source.value === '' ? this.ext.records.value : this.loaded.value))

  readonly visible = computed(() => {
    const q = this.search.value.trim().toLowerCase()
    return this.records.value.filter((r) => {
      if (!this.enabled.value[levelName(r.level)]) return false
      if (q === '') return true
      return r.msg.toLowerCase().includes(q) || (r.name ?? '').toLowerCase().includes(q)
    })
  })

  readonly allLevels = computed(() => LEVELS.every((level) => this.enabled.value[level.name]))

  constructor(
    private readonly ext: LoggerExtension,
    private readonly logger: Logger,
  ) {}

  toggle(name: LevelName): void {
    this.enabled.value = { ...this.enabled.value, [name]: !this.enabled.value[name] }
  }

  showAllLevels(): void {
    this.enabled.value = { debug: true, info: true, warn: true, error: true }
  }

  async loadSessions(): Promise<void> {
    this.sessions.value = await this.ext.listSessions()
  }

  // Two picks in a row load in parallel; only the last one's records are kept.
  async showSource(source: string): Promise<void> {
    this.source.value = source
    const ticket = ++this.ticket
    if (source === '') {
      this.loaded.value = []
      return
    }
    try {
      const records = await this.ext.loadSession(source)
      if (ticket === this.ticket) this.loaded.value = records
    } catch (error) {
      this.logger.error('Failed to load log session', error)
      if (ticket === this.ticket) this.loaded.value = []
    }
  }

  clear(): void {
    this.ext.clear()
  }
}

const views = new WeakMap<LoggerExtension, LogView>()

export function logView(ext: LoggerExtension, logger: Logger): LogView {
  let view = views.get(ext)
  if (view == null) {
    view = new LogView(ext, logger)
    views.set(ext, view)
  }
  return view
}

export function sessionLabel(source: string): string {
  return source === '' ? t('session.live') : source.replace(/^logs\//, '')
}

// The phone's band in Logs: what the filter lets through and how many errors are in what is shown. Clearing is
// in More only — it throws the live window away and is not something done by reflex.
export function logBar(view: LogView): ObjectBar {
  const shown = LEVELS.filter((level) => view.enabled.value[level.name])
  const name = view.allLevels.value
    ? t('levels.all')
    : shown.length === 0
      ? t('levels.none')
      : shown.map((level) => levelLabel(level.name)).join(', ')
  const errors = view.records.value.filter((record) => levelName(record.level) === 'error').length
  const parts = [view.source.value === '' ? null : sessionLabel(view.source.value), t('bar.errors', { count: errors })]
  return {
    icon: 'lu:scroll-text',
    name,
    sub: parts.filter((part) => part != null).join(' · '),
    actions: [{ id: 'logs.reload', label: t('bar.reload'), icon: 'lu:refresh-cw', onSelect: () => void view.loadSessions() }],
    menu: [
      {
        id: 'logs.clear',
        label: t('bar.clear'),
        icon: 'lu:trash-2',
        tone: 'danger',
        disabled: view.source.value !== '',
        onSelect: () => view.clear(),
      },
    ],
  }
}
