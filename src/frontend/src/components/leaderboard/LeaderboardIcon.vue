<script setup lang="ts">
// The few line icons the leaderboard draws (lock, chevrons). Decorative: the control around each one carries the
// accessible name, so they are aria-hidden.
defineProps<{ name: 'lock' | 'chevron-left' | 'chevron-right'; size?: number }>();
</script>

<template>
  <svg
    aria-hidden="true"
    :width="size ?? 16"
    :height="size ?? 16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <template v-if="name === 'lock'">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </template>
    <path v-else-if="name === 'chevron-left'" d="M15 18l-6-6 6-6" />
    <path v-else d="M9 18l6-6-6-6" />
  </svg>
</template>
