<script setup lang="ts">
import { Button, modals, PageLayout, Switch } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, reactive, ref } from 'vue'
import { MaintenanceExtension } from '../maintenance-extension'
import { pluginLabel } from '../plugin-label'

const arxhub = useArxHub()
const policy = arxhub.extensions.get(MaintenanceExtension).policy
const plugins = arxhub.catalog
const mobile = useShellFrame() === 'mobile'
const buttonSize = mobile ? 'lg' : 'sm'

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
    <div class="plugins-body" :class="{ touch: mobile }">
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
        <li v-for="plugin in plugins" :key="plugin.name" class="row" :class="{ touch: mobile }">
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
        <Button v-if="!arxhub.maintenance" :size="buttonSize" variant="secondary" @click="confirmMaintenance">
          Restart in maintenance mode
        </Button>
        <Button
          v-if="anyDisabled || arxhub.maintenance"
          :size="buttonSize"
          variant="secondary"
          @click="reset"
        >
          Reset all switches
        </Button>
      </div>
    </section>
    </div>
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
  gap: 8px;
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

.plugins-page.touch .hint {
  font-size: var(--font-size-sm);
}

.plugins-page.touch .block-title {
  font-size: var(--font-size-md);
}

.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
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
  gap: 16px;
  padding: 8px 0;
  /* Hairline INSIDE one region (the plugin list), not a border BETWEEN regions — --gray-4 per
     .claude/rules/design.md, not --gray-6. */
  border-bottom: 1px solid var(--gray-4);
}

.row.touch {
  min-height: var(--size-xl);
}

.row:last-child {
  border-bottom: none;
}

.row-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
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
  padding: 0 4px;
  border: 1px solid var(--gray-6);
  border-radius: var(--radius-xs);
}

.pending {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 8px;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}
</style>
