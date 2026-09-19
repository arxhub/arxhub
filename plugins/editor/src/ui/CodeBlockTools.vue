<script setup lang="ts">
import { Button, Dialog, Input, Row } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed, ref } from 'vue'
import { CODE_LANGUAGES, MAX_HIGHLIGHT_LENGTH } from '../code-highlighting'
import type { ArxEditorControlProps } from '../control-views'

defineProps<ArxEditorControlProps>()
const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'sm'
const open = ref(false)
const query = ref('')
const choices = computed(() => CODE_LANGUAGES.filter((language) => language.toLowerCase().includes(query.value.toLowerCase())))
</script>

<template>
  <Button v-if="mode === 'editable'" :size="buttonSize" variant="ghost" aria-label="Code language" @click="open = true">{{ node.attrs.language || 'Plain text' }}</Button>
  <span v-else class="language-label" :class="{ touch }">{{ node.attrs.language || 'Plain text' }}</span>
  <span v-if="node.content.size > MAX_HIGHLIGHT_LENGTH" class="language-label" :class="{ touch }">Syntax highlighting paused for this large block.</span>
  <Dialog v-if="open && mode === 'editable'" open title="Code language" size="sm" @update:open="open = $event">
    <Input v-model="query" aria-label="Search code languages" placeholder="Search languages" />
    <nav aria-label="Code languages">
      <Row as="button" type="button" :selected="!node.attrs.language" @click="change({ language: '' }); open = false">Plain text</Row>
      <Row v-for="language in choices" :key="language" as="button" type="button" :selected="node.attrs.language === language" @click="change({ language }); open = false">{{ language }}</Row>
    </nav>
  </Dialog>
</template>

<style scoped>
nav { margin-top: 8px; max-height: 280px; overflow: auto; }
.language-label { font-size: var(--font-size-xs); color: var(--gray-11); padding: 8px; display: block; }
.language-label.touch { font-size: var(--font-size-sm); }
</style>
