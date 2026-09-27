<script setup lang="ts">
import { Button, modals, PageLayout, Switch } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, reactive, ref } from 'vue'
import { t } from '../i18n/messages'
import { MaintenanceExtension } from '../maintenance-extension'
import { pluginDescription, pluginLabel } from '../plugin-label'

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
    title: t('page.confirmTitle'),
    content: t('page.confirmText'),
    labels: { confirm: t('page.confirm'), cancel: t('page.cancel') },
    onConfirm: () => setMaintenance(true),
  })
}

function reset(): void {
  policy.clear()
  window.location.reload()
}
</script>

<template>
  <PageLayout :title="t('page.title')" :description="t('page.description')">
    <div class="plugins-body" :class="{ touch: mobile }">
    <section v-if="arxhub.maintenance" class="banner">
      <div>
        <p class="banner-title">{{ t('page.bannerTitle') }}</p>
        <p class="hint">{{ t('page.bannerHint') }}</p>
      </div>
      <Button :size="buttonSize" @click="setMaintenance(false)">{{ t('page.leave') }}</Button>
    </section>

    <section class="block">
      <h3 class="block-title">{{ t('page.installed') }}</h3>
      <p class="hint">{{ t('page.installedHint') }}</p>

      <ul class="list">
        <li v-for="plugin in plugins" :key="plugin.name" class="row" :class="{ touch: mobile }">
          <div class="row-text">
            <p class="row-title">
              <span class="name">{{ pluginLabel(plugin.name) }}</span>
              <span class="version">{{ plugin.version }}</span>
              <span v-if="plugin.essential" class="tag">{{ t('page.essential') }}</span>
              <span v-else-if="!plugin.enabled" class="tag">{{ t('page.notRunning') }}</span>
            </p>
            <p v-if="pluginDescription(plugin)" class="hint">{{ pluginDescription(plugin) }}</p>
          </div>
          <Switch
            :model-value="plugin.essential || enabled[plugin.name]"
            :disabled="plugin.essential"
            :aria-label="t('page.enable', { name: pluginLabel(plugin.name) })"
            :data-testid="`plugin-switch-${plugin.name}`"
            @update:model-value="toggle(plugin.name, $event)"
          />
        </li>
      </ul>

      <div v-if="pending" class="pending" role="status">
        <span class="hint">{{ t('page.pending') }}</span>
        <Button :size="buttonSize" @click="restart">{{ t('page.restartNow') }}</Button>
      </div>
    </section>

    <section class="block">
      <h3 class="block-title">{{ t('page.recovery') }}</h3>
      <p class="hint">{{ t('page.recoveryHint') }}</p>
      <div class="row-actions">
        <Button v-if="!arxhub.maintenance" :size="buttonSize" variant="secondary" @click="confirmMaintenance">
          {{ t('page.enterMaintenance') }}
        </Button>
        <Button
          v-if="anyDisabled || arxhub.maintenance"
          :size="buttonSize"
          variant="secondary"
          @click="reset"
        >
          {{ t('page.reset') }}
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

.plugins-body.touch .hint {
  font-size: var(--font-size-sm);
}

.plugins-body.touch .block-title {
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
