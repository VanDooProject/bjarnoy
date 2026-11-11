<script setup lang="ts">
// A 40px square icon toggle of the HUD: the map's icon switches (building info, and the panel column's Construction,
// Garrison, Armies and Quests). Muted icon; gold border and icon while pressed. Attributes (aria-label, title, data-testid,
// click) land on the button.
defineProps<{ pressed: boolean }>();
</script>

<template>
  <button type="button" class="hud-icon-button" :aria-pressed="pressed">
    <slot />
  </button>
</template>

<style scoped>
.hud-icon-button {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  padding: 0;
  color: var(--muted);
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  cursor: pointer;
}
.hud-icon-button:hover {
  color: var(--text);
}
.hud-icon-button[aria-pressed='true'] {
  color: var(--gold, #ffc55c);
  border-color: var(--gold, #ffc55c);
}
.hud-icon-button:focus-visible {
  outline: 2px solid var(--gold, #ffc55c);
  outline-offset: 2px;
}
.hud-icon-button :slotted(svg) {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
