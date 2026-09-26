<script setup lang="ts">
import { useNavHost } from '@arxhub/plugin-shell/ui'
import { Row, SectionLabel } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onMounted } from 'vue'
import { LEVELS, logView, sessionLabel } from '../log-view'
import { LoggerExtension } from '../logger-extension'

// The second tap on Logs: which levels the log shows, and which session it reads. Levels are toggles — several
// are shown at once — so ticking one leaves the sheet up; a session is one choice, and picking it is done.
const arxhub = useArxHub()
const view = logView(arxhub.extensions.get(LoggerExtension), arxhub.logger)
const navHost = useNavHost()
const { enabled, allLevels, source, sessions } = view

function pickSource(next: string): void {
  void view.showSource(next)
  navHost?.navigated?.()
}

onMounted(() => void view.loadSessions())
</script>

<template>
  <nav aria-label="Log levels and sessions" data-testid="log-levels">
    <SectionLabel inset>Levels</SectionLabel>
    <Row
      as="button"
      type="button"
      icon="lu:list"
      label="All levels"
      :checked="allLevels"
      :aria-pressed="allLevels"
      @click="view.showAllLevels()"
    />
    <Row
      v-for="level in LEVELS"
      :key="level.name"
      as="button"
      type="button"
      icon="lu:list-filter"
      :label="level.label"
      :checked="enabled[level.name]"
      :aria-pressed="enabled[level.name]"
      :data-testid="`log-level:${level.name}`"
      @click="view.toggle(level.name)"
    />
    <SectionLabel inset>Session</SectionLabel>
    <Row
      v-for="entry in ['', ...sessions]"
      :key="entry"
      as="button"
      type="button"
      :icon="entry === '' ? 'lu:radio' : 'lu:file-text'"
      :label="sessionLabel(entry)"
      :selected="entry === source"
      :checked="entry === source"
      :aria-current="entry === source ? 'true' : undefined"
      @click="pickSource(entry)"
    />
  </nav>
</template>

