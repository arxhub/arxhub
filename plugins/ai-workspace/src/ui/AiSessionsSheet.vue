<script setup lang="ts">
import { posix } from '@arxhub/path'
import { useNavHost } from '@arxhub/plugin-shell/ui'
import { EmptyState, Row, SectionLabel } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { AiWorkspaceExtension } from '../ai-workspace-extension'
import type { SessionView } from '../session-view'
import { aiWorkspaceState, CHANGE_ICONS, sessionDetail } from './use-ai-workspace'

// The second tap on the AI workspace: its sessions, and under the open one the files its proposal changes — the
// same files the band's name opens, reached here without first going back to the proposal.
const state = aiWorkspaceState(useArxHub().extensions.get(AiWorkspaceExtension))
const navHost = useNavHost()
const { sessions, active, selectedPath, diffOpen } = state

function pickSession(session: SessionView): void {
  state.selectSession(session)
  diffOpen.value = false
  navHost?.navigated?.()
}

function pickChange(pathname: string): void {
  state.openChange(pathname)
  navHost?.navigated?.()
}
</script>

<template>
  <nav aria-label="AI workspace sessions" data-testid="ai-sessions">
    <SectionLabel inset>Sessions</SectionLabel>
    <EmptyState v-if="sessions.length === 0" compact icon="lu:bot" text="No agent sessions yet." />
    <Row
      v-for="session in sessions"
      :key="session.sessionId"
      as="button"
      type="button"
      icon="lu:bot"
      :label="session.sessionId"
      :detail="sessionDetail(session)"
      :selected="session.sessionId === active?.sessionId"
      :checked="session.sessionId === active?.sessionId"
      :aria-current="session.sessionId === active?.sessionId ? 'true' : undefined"
      @click="pickSession(session)"
    />
    <template v-if="active != null && active.changes.length > 0">
      <SectionLabel inset>Proposal files</SectionLabel>
      <Row
        v-for="change in active.changes"
        :key="change.pathname"
        as="button"
        type="button"
        :icon="CHANGE_ICONS[change.kind]"
        :label="posix.basename(change.pathname)"
        :detail="change.kind"
        :selected="diffOpen && change.pathname === selectedPath"
        @click="pickChange(change.pathname)"
      />
    </template>
  </nav>
</template>

