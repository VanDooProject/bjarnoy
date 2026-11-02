<script setup lang="ts">
// One HUD navigation link (top bar, avatar menu, mobile drawer): a real
// `<a href>` so Ctrl/Cmd/middle click opens the destination in a new tab,
// while a plain click stays in the app and runs the caller's own navigation
// (which may carry history state, e.g. a modal route's background view).
import { isPlainLeftClick } from '../../lib/navClick';

defineProps<{ href: string }>();
const emit = defineEmits<{ navigate: [] }>();

function onClick(event: MouseEvent) {
  if (!isPlainLeftClick(event)) return;
  event.preventDefault();
  emit('navigate');
}
</script>

<template>
  <a :href="href" @click="onClick"><slot /></a>
</template>
