<script setup lang="ts">
import { computed } from 'vue'
import { interpolatedParts } from './interpolated'

// A catalog sentence with markup inside it: `text` is the sentence with its placeholders left in
// (`messages.raw(key)`), and each `{name}` is filled by the slot of that name. A placeholder with no slot
// stays visible, so a missing slot is seen rather than silently dropped.
const props = defineProps<{ text: string }>()
const parts = computed(() => interpolatedParts(props.text))
const placeholder = (name: string) => `{${name}}`
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <template v-if="part.kind === 'text'">{{ part.text }}</template>
    <slot v-else :name="part.name">{{ placeholder(part.name) }}</slot>
  </template>
</template>
