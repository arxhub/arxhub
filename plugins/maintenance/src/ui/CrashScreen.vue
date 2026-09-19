<script setup lang="ts">
import type { BootFailure, PluginInfo } from '@arxhub/core'
import { computed, reactive, ref } from 'vue'
import type { BootLedger } from '../boot-ledger'
import type { BootPolicy } from '../boot-policy'
import { pluginLabel } from '../plugin-label'

const props = defineProps<{
  error: unknown
  failures: BootFailure[]
  catalog: readonly PluginInfo[]
  // How far the boot got. Null when nothing was watching — the screen simply omits the section.
  ledger: BootLedger | null
  policy: BootPolicy
  maintenance: boolean
  continuable: boolean
  // Called when the user decides to go on into the half-booted app.
  onContinue: () => void
}>()

const culprits = computed(() => new Set(props.failures.flatMap((it) => (it.plugin == null ? [] : [it.plugin]))))

// A local, uncommitted view of the switches: nothing is written until Apply, so a misclick costs
// nothing. It starts from the stored policy rather than from what this boot ran — in maintenance mode
// those differ, and showing every plugin as already-off would talk the user into persisting that.
const enabled = reactive<Record<string, boolean>>(
  Object.fromEntries(props.catalog.map((it) => [it.name, it.essential || (!props.policy.isDisabled(it.name) && !culprits.value.has(it.name))])),
)

const switchable = computed(() => props.catalog.filter((it) => !it.essential))
const changed = computed(() => switchable.value.filter((it) => enabled[it.name] === props.policy.isDisabled(it.name)))

// Every plugin this boot actually ran, in the order the boot walked them. A plugin that was switched off
// is left out here — it is already listed, with its switch, in the section below.
const reached = computed(() => (props.ledger?.entries ?? []).filter((it) => it.state !== 'off'))

const LEDGER_PHASE: Record<string, string> = { setup: 'preparing', create: 'registering', configure: 'wiring', start: 'starting' }

function ledgerState(entry: { state: string; phase: string | null }): string {
  if (entry.state === 'ready') return 'loaded'
  if (entry.state === 'failed') return `failed while ${LEDGER_PHASE[entry.phase ?? ''] ?? entry.phase}`
  if (entry.state === 'running') return `stopped while ${LEDGER_PHASE[entry.phase ?? ''] ?? entry.phase}`
  return 'never started'
}

const busy = ref(false)
const copyState = ref<'idle' | 'copied' | 'failed'>('idle')

function apply(maintenance = props.maintenance): void {
  busy.value = true
  for (const it of switchable.value) props.policy.setEnabled(it.name, enabled[it.name])
  props.policy.setMaintenance(maintenance)
  window.location.reload()
}

function resetPolicy(): void {
  busy.value = true
  props.policy.clear()
  window.location.reload()
}

function message(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

// The wrapper's own stack points at the error factory, so the cause is the part worth reading. AppError
// keeps it on `originalError`; a bare Error uses `cause`.
function causeOf(error: unknown): Error | null {
  if (error == null || typeof error !== 'object') return null
  const { originalError, cause } = error as { originalError?: unknown; cause?: unknown }
  const found = originalError ?? cause
  return found instanceof Error ? found : null
}

function trace(error: unknown): string {
  const own = error instanceof Error ? (error.stack ?? message(error)) : String(error)
  const cause = causeOf(error)
  return cause == null ? own : `${own}\n\nCaused by: ${cause.stack ?? message(cause)}`
}

const report = computed(() =>
  [
    'ArxHub failed to boot',
    `when: ${new Date().toISOString()}`,
    `agent: ${navigator.userAgent}`,
    `maintenance boot: ${props.maintenance}`,
    `switched off: ${props.policy.disabled.join(', ') || '(none)'}`,
    '',
    ...(props.failures.length === 0
      ? [trace(props.error)]
      : props.failures.map((it) => `--- ${it.plugin ?? 'boot'} failed during ${it.phase}()\n${trace(it.error)}`)),
    '',
    'plugins:',
    ...props.catalog.map((it) => `  ${it.name}@${it.version}${it.essential ? ' [essential]' : ''}${it.enabled ? '' : ' [off]'}`),
  ].join('\n'),
)

function copyReport(): void {
  navigator.clipboard.writeText(report.value).then(
    () => {
      copyState.value = 'copied'
    },
    () => {
      // No clipboard (an insecure context, or a webview that denies it) — show the text instead, so
      // the report is still gettable from the one screen where it matters most.
      copyState.value = 'failed'
    },
  )
}
</script>

<template>
  <!-- Deliberately not <main>: the app's own main landmark is what tells the rest of the suite (and a
       screen reader) that the app itself came up, and a crash screen must not answer to that. -->
  <div class="crash" role="alertdialog" aria-labelledby="crash-title">
    <div class="card">
      <header class="head">
        <h1 id="crash-title" class="title">ArxHub could not start</h1>
        <p class="lede">
          <template v-if="failures.length > 0">
            {{ failures.length }} plugin{{ failures.length > 1 ? 's' : '' }} failed during startup. Turn the plugin off to boot
            without it — your files are untouched.
          </template>
          <template v-else>The boot failed outside any plugin, so there is nothing specific to switch off.</template>
        </p>
        <p v-if="maintenance" class="note">
          This was already a maintenance boot: only essential plugins ran, and one of them is what broke.
        </p>
      </header>

      <section class="block">
        <h2 class="block-title">What broke</h2>
        <div v-for="(failure, i) in failures" :key="i" class="failure">
          <p class="failure-head">
            <strong>{{ failure.plugin == null ? 'Boot' : pluginLabel(failure.plugin) }}</strong>
            <span class="phase">{{ failure.phase }}()</span>
          </p>
          <p class="failure-message">{{ message(failure.error) }}</p>
          <details>
            <summary>Stack trace</summary>
            <pre class="trace">{{ trace(failure.error) }}</pre>
          </details>
        </div>
        <div v-if="failures.length === 0" class="failure">
          <p class="failure-message">{{ message(error) }}</p>
          <details>
            <summary>Stack trace</summary>
            <pre class="trace">{{ trace(error) }}</pre>
          </details>
        </div>
      </section>

      <!-- What the failure alone cannot say: the plugin it names is one of many, and which of the others
           were already through is most of what tells a broken plugin apart from a broken order. -->
      <section v-if="reached.length > 0" class="block">
        <h2 class="block-title">How far it got</h2>
        <ul class="ledger">
          <li v-for="entry in reached" :key="entry.name" class="ledger-row" :class="`ledger-row--${entry.state}`">
            <span class="ledger-name">{{ pluginLabel(entry.name) }}</span>
            <span class="ledger-state">{{ ledgerState(entry) }}</span>
          </li>
        </ul>
      </section>

      <section class="block">
        <h2 class="block-title">Plugins</h2>
        <p class="hint">
          Unchecked plugins will not load on the next start. Essential ones keep the app and this screen working, so they
          cannot be switched off.
        </p>
        <ul class="plugins">
          <li v-for="plugin in catalog" :key="plugin.name" class="plugin" :class="{ 'plugin--blamed': culprits.has(plugin.name) }">
            <label class="plugin-label">
              <!-- Not the themed `Switch` (@arxhub/uikit/core): that barrel has no per-component export,
                   so pulling it in means the whole `core` entry — the full lucide icon set registered as
                   an import side effect, Ark UI's modal stack, everything — for one control on the screen
                   that exists to still work when something else already didn't. Its own CSS also has no
                   literal fallbacks for its custom properties, unlike every rule below, so it would go
                   invisible in exactly the scenario this screen is written to survive (tokens not painted
                   yet). Styled native input instead, with the same fallback discipline as the rest of the
                   file. -->
              <input v-model="enabled[plugin.name]" class="plugin-toggle" type="checkbox" :disabled="plugin.essential || busy" />
              <span class="plugin-name">{{ pluginLabel(plugin.name) }}</span>
              <span v-if="plugin.essential" class="tag">essential</span>
              <span v-if="culprits.has(plugin.name)" class="tag tag--danger">failed</span>
            </label>
            <p v-if="plugin.description" class="plugin-description">{{ plugin.description }}</p>
          </li>
        </ul>
      </section>

      <footer class="actions">
        <button class="primary" type="button" :disabled="busy" @click="apply()">
          {{ changed.length > 0 ? `Apply and restart (${changed.length} changed)` : 'Restart' }}
        </button>
        <button v-if="continuable" class="secondary" type="button" :disabled="busy" @click="onContinue">Continue anyway</button>
        <button v-if="!maintenance" class="secondary" type="button" :disabled="busy" @click="apply(true)">
          Restart in maintenance mode
        </button>
        <button v-else class="secondary" type="button" :disabled="busy" @click="apply(false)">Leave maintenance mode</button>
        <button class="link" type="button" :disabled="busy" @click="copyReport">
          {{ copyState === 'copied' ? 'Report copied' : copyState === 'failed' ? 'Could not copy — shown below' : 'Copy report' }}
        </button>
        <button
          v-if="policy.disabled.length > 0 || maintenance"
          class="link"
          type="button"
          :disabled="busy"
          @click="resetPolicy"
        >
          Reset all switches
        </button>
      </footer>

      <pre v-if="copyState === 'failed'" class="trace">{{ report }}</pre>
    </div>
  </div>
</template>

<style scoped>
.ledger {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ledger-row {
  display: flex;
  gap: 8px;
  align-items: center;
  height: var(--size-2xs, 28px);
  font-size: var(--font-size-sm);
}

.ledger-state {
  margin-left: auto;
  color: var(--gray-11, #555);
  font-size: var(--font-size-xs);
}

.ledger-row--waiting .ledger-name {
  color: var(--gray-9, #8f8f8f);
}

.ledger-row--failed .ledger-state,
.ledger-row--running .ledger-state {
  color: var(--red-11, #cd2b31);
}

/* Self-sufficient by design, like the unlock gate: this screen renders when the app did not, so it
   leans on nothing but the design tokens — and falls back when even those did not load. */
.crash {
  position: fixed;
  inset: 0;
  z-index: 9999;
  overflow: auto;
  padding: 32px 16px;
  background: var(--gray-1, #fff);
  font-family: var(--font-sans, system-ui, sans-serif);
  color: var(--gray-12, #111);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 704px;
  margin: 0 auto;
}

.head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-medium, 500);
}

.lede,
.hint,
.note {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--gray-11, #666);
}

.note {
  color: var(--danger-11, #c00);
}

.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium, 500);
}

.failure {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--danger-6, #fdd);
  border-radius: var(--radius-sm, 4px);
  background: var(--danger-2, #fff5f5);
}

.failure-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: var(--font-size-sm);
}

.phase {
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-xs);
  color: var(--gray-11, #666);
}

.failure-message {
  margin: 0;
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-xs);
  color: var(--danger-11, #c00);
  overflow-wrap: anywhere;
}

summary {
  font-size: var(--font-size-xs);
  color: var(--gray-11, #666);
  cursor: pointer;
}

.trace {
  max-height: 224px;
  overflow: auto;
  margin: 8px 0 0;
  padding: 8px;
  border-radius: var(--radius-sm, 4px);
  background: var(--gray-3, #f4f4f5);
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-xs);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.plugins {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.plugin {
  min-height: var(--size-xl, 48px);
  padding: 8px;
  border-radius: var(--radius-sm, 4px);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.plugin--blamed {
  background: var(--danger-2, #fff5f5);
}

.plugin-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.plugin-toggle {
  accent-color: var(--accent-9, #06f);
  width: var(--size-md, 40px);
  height: var(--size-md, 40px);
  flex-shrink: 0;
}

.plugin-toggle:focus-visible {
  outline: 2px solid var(--accent-8, #2f6feb);
  outline-offset: 1px;
}

.plugin-name {
  font-weight: var(--font-weight-medium, 500);
}

.plugin-description {
  margin: 4px 0 0 24px;
  font-size: var(--font-size-xs);
  color: var(--gray-11, #666);
}

.tag {
  padding: 0 4px;
  border: 1px solid var(--gray-6, #e4e4e7);
  border-radius: var(--radius-xs, 2px);
  font-size: var(--font-size-xs);
  color: var(--gray-11, #666);
}

.tag--danger {
  border-color: var(--danger-6, #fdd);
  color: var(--danger-11, #c00);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 16px;
  border-top: 1px solid var(--gray-6, #eee);
}

.primary,
.secondary {
  min-height: var(--size-xl, 48px);
  padding: 8px 12px;
  border-radius: var(--radius-sm, 4px);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.primary {
  border: none;
  background: var(--accent-9, #06f);
  color: var(--accent-contrast, #fff);
}

.secondary {
  border: 1px solid var(--gray-7, #ccc);
  background: var(--gray-1, #fff);
  color: var(--gray-12, #111);
}

.link {
  min-height: var(--size-xl, 48px);
  padding: 8px 4px;
  border: none;
  background: none;
  color: var(--gray-11, #666);
  font-size: var(--font-size-sm);
  text-decoration: underline;
  cursor: pointer;
}

.primary:disabled,
.secondary:disabled,
.link:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
