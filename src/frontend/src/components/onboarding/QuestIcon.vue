<script setup lang="ts">
// The quest scroll: the quest strip on phones (QuestTray) and the Quests icon of the desktop panel column. It draws in the
// colour it is given (`--quest-icon-stroke`, default the text colour) at `--quest-icon-width`.
</script>

<template>
  <svg class="quest-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
    <path d="M18 17V6a2 2 0 0 0-2-2H5" />
    <path d="M8 20h11a2 2 0 0 0 2-2v-.5a.5.5 0 0 0-.5-.5H10.5a.5.5 0 0 0-.5.5v.5a2 2 0 1 1-4 0V6a2 2 0 1 0-4 0v1.5a.5.5 0 0 0 .5.5H6" />
    <path d="M10 9h5M10 12.5h5" />
  </svg>
</template>

<style scoped>
.quest-icon {
  fill: none;
  stroke: var(--quest-icon-stroke, currentColor);
  stroke-width: var(--quest-icon-width, 1.8);
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
