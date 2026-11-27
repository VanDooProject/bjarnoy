<script setup lang="ts">
// The explanatory note at the bottom of a `?debug=1` panel. Collapsed to one
// line by default: the notes run to a paragraph each and pushed the numbers
// they explain out of view. A click opens the whole note; it starts collapsed
// again on the next mount, since it is read once, not kept open.
import { ref } from 'vue';

const open = ref(false);
</script>

<template>
  <button type="button" class="legend" :class="{ open }" :aria-expanded="open" @click="open = !open">
    <span class="chevron" aria-hidden="true" />
    <span class="text"><slot /></span>
  </button>
</template>

<style scoped>
.legend {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  margin-top: 8px;
  padding: 0;
  appearance: none;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  font: inherit;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--muted);
}
.legend:hover {
  color: var(--text);
}
.text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.open .text {
  white-space: normal;
}
/* Drawn in CSS rather than a glyph in the template: right when closed, down when open, like DebugPanel's own title. */
.chevron::before {
  content: '▾';
  display: inline-block;
  font-size: 10px;
  transform: rotate(-90deg);
  transition: transform 120ms ease;
}
.open .chevron::before {
  transform: none;
}
</style>
