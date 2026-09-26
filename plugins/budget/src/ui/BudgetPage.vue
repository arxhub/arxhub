<script setup lang="ts">
import { useShellFrame } from '@arxhub/uikit/hooks'
import BudgetScreen from './BudgetScreen.vue'
import DesktopBudgetPage from './DesktopBudgetPage.vue'

const surface = useShellFrame() === 'mobile' ? BudgetScreen : DesktopBudgetPage
</script>

<template><component :is="surface" /></template>
