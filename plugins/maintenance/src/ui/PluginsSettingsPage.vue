<script setup lang="ts">
import { Button, modals, PageLayout, Switch } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, reactive, ref } from 'vue'
import { MaintenanceExtension } from '../maintenance-extension'
import { pluginLabel } from '../plugin-label'

const arxhub = useArxHub()
const policy = arxhub.extensions.get(MaintenanceExtension).policy
const plugins = arxhub.catalog
const buttonSize = useShellFrame() === 'mobile' ? 'md' : 'sm'

// The policy is plain storage, so the switches keep their own reactive mirror of it.
const enabled = reactive<Record<string, boolean>>(Object.fromEntries(plugins.map((it) => [it.name, !policy.isDisabled(it.name)])))

// A switch takes effect on the next boot: create()/configure() have already run and there is no
// plugin-unload model, so the honest thing is to ask for a restart rather than fake a live reload.
const pending = ref(false)
const anyDisabled = computed(() => plugins.some((it) => !it.essential && !enabled[it.name]))

function toggle(name: string, value: boolean): void {
  enabled[name] = value
  policy.setEnabled(name, value)
  pending.value = true
}

function restart(): void {
  window.location.reload()
}

function setMaintenance(on: boolean): void {
  policy.setMaintenance(on)
  restart()
}

function confirmMaintenance(): void {
  modals.openConfirmModal({
    title: 'Restart in maintenance mode',
    content:
      'Only essential plugins will load — no explorer, no editors, no sync. Use it when the app will not start ' +
      'normally. You can leave it again from this page.',
    labels: { confirm: 'Restart', cancel: 'Cancel' },
    onConfirm: () => setMaintenance(true),
  })
}

function reset(): void {
  policy.clear()
  window.location.reload()
}
</script>

<template>
  <PageLayout title="Plugins" description="Which plugins this device loads. A switch takes effect on the next start.">
    <section v-if="arxhub.maintenance" class="banner">
      <div>
        <p class="banner-title">Maintenance mode is on</p>
        <p class="hint">Only essential plugins are running. Switch off whatever broke, then leave maintenance mode.</p>
      </div>
      <Button :size="buttonSize" @click="setMaintenance(false)">Leave and restart</Button>
    </section>

    <section class="block">
      <h3 class="block-title">Installed plugins</h3>
      <p class="hint">
        A plugin that is switched off does not load at all — it registers nothing and its settings disappear with it.
        Essential plugins keep the app itself running and cannot be switched off.
      </p>

      <ul class="list">
        <li v-for="plugin in plugins" :key="plugin.name" class="row">
          <div class="row-text">
            <p class="row-title">
              <span class="name">{{ pluginLabel(plugin.name) }}</span>
              <span class="version">{{ plugin.version }}</span>
              <span v-if="plugin.essential" class="tag">essential</span>
              <span v-else-if="!plugin.enabled" class="tag">not running</span>
            </p>
            <p v-if="plugin.description" class="hint">{{ plugin.description }}</p>
          </div>
          <Switch
            :model-value="plugin.essential || enabled[plugin.name]"
            :disabled="plugin.essential"
            :aria-label="`Enable ${pluginLabel(plugin.name)}`"
            :data-testid="`plugin-switch-${plugin.name}`"
            @update:model-value="toggle(plugin.name, $event)"
          />
        </li>
      </ul>

      <div v-if="pending" class="pending" role="status">
        <span class="hint">Plugin changes apply on the next start.</span>
        <Button :size="buttonSize" @click="restart">Restart now</Button>
      </div>
    </section>

    <section class="block">
      <h3 class="block-title">Recovery</h3>
      <p class="hint">
        If the app stops starting at all, it shows a crash screen with the same switches. Maintenance mode is the same
        thing from the inside: boot the essentials only, fix what broke, come back.
      </p>
      <div class="row-actions">
        <Button v-if="!arxhub.maintenance" size="sm" variant="secondary" @click="confirmMaintenance">
          Restart in maintenance mode
        </Button>
        <Button
          v-if="anyDisabled || arxhub.maintenance"
          size="sm"
          variant="secondary"
          @click="reset"
        >
          Reset all switches
        </Button>
      </div>
    </section>
  </PageLayout>
</template>

<style scoped>
.banner + .block,
.block + .block {
  margin-top: 24px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.block-title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--gray-12);
}

.hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--gray-11);
}

.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem;
  border: 1px solid var(--warning-6);
  border-radius: var(--radius-sm);
  background: var(--warning-2);
}

.banner-title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--warning-11);
}

.list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
  /* Hairline INSIDE one region (the plugin list), not a border BETWEEN regions — --gray-4 per
     .claude/rules/design.md, not --gray-6. */
  border-bottom: 1px solid var(--gray-4);
}

.row:last-child {
  border-bottom: none;
}

.row-title {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--gray-12);
}

.version,
.tag {
  font-size: var(--font-size-xs);
  color: var(--gray-11);
}

.tag {
  padding: 0 0.25rem;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-xs);
}

.pending {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.5rem;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
}
</style>
