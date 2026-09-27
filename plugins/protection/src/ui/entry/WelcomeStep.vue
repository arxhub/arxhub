<script setup lang="ts">
import { GateLayout, Row } from '@arxhub/uikit/core'
import type { EntryFlow } from '../../entry/entry-flow'
import { t } from '../../i18n/messages'
import EntryError from './EntryError.vue'

defineProps<{ flow: EntryFlow }>()

// The product's name, not copy: it reads the same in every language.
const PRODUCT = 'ArxHub'
</script>

<template>
  <GateLayout center="mobile" mark="lu:lock">
    <template #title>{{ PRODUCT }}</template>
    <template #text>{{ t('entry.welcome.text') }}</template>

    <template #actions>
      <EntryError :flow="flow" />
      <Row
        as="button"
        choice
        next
        icon="lu:square-plus"
        :label="t('entry.welcome.newVault')"
        :detail="t('entry.welcome.newVaultDetail')"
        :disabled="flow.busy.value"
        data-testid="entry-new-vault"
        @click="flow.chooseNew()"
      />
      <Row
        as="button"
        choice
        next
        icon="lu:smartphone"
        :label="t('entry.welcome.join')"
        :detail="t('entry.welcome.joinDetail')"
        :disabled="flow.busy.value"
        data-testid="entry-join-vault"
        @click="flow.chooseJoin()"
      />
    </template>
  </GateLayout>
</template>
