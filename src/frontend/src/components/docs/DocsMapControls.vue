<script setup lang="ts">
// The overlay every inline docs map carries (composables/useDocsMapRenderer.ts hands over what it needs): "+" / "−" buttons top
// right, and a "Ctrl + scroll to zoom" pill shown for a moment after a plain wheel was left to the page. Place it inside the
// map host (`position: relative`), after the canvas.
import { fadeChip } from '../../lib/hud/chipMotion';

defineProps<{ zoomIn: () => void; zoomOut: () => void; wheelHint: boolean }>();

// Glyphs, not words: the buttons are named by their aria-label.
const PLUS = '+';
const MINUS = '\u2212';
const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function enter(el: Element, done: () => void) {
  void fadeChip(el, 'in').then(done);
}
function leave(el: Element, done: () => void) {
  void fadeChip(el, 'out').then(done);
}
</script>

<template>
  <div class="map-controls">
    <div class="zoom-buttons">
      <button type="button" class="zoom-btn" data-testid="docs-map-zoom-in" :aria-label="$t('docs.mapZoom.zoomIn')" @pointerdown.stop @click="zoomIn()">{{ PLUS }}</button>
      <button type="button" class="zoom-btn" data-testid="docs-map-zoom-out" :aria-label="$t('docs.mapZoom.zoomOut')" @pointerdown.stop @click="zoomOut()">{{ MINUS }}</button>
    </div>
    <Transition :css="false" @enter="enter" @leave="leave">
      <div v-if="wheelHint" class="wheel-hint" data-testid="docs-map-wheel-hint">
        {{ isApple ? $t('docs.mapZoom.hintCmd') : $t('docs.mapZoom.hintCtrl') }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.map-controls {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.zoom-buttons {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.zoom-btn {
  pointer-events: auto;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  color: var(--text);
  font: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}
.zoom-btn:hover {
  border-color: var(--gold);
}
.zoom-btn:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
.wheel-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  padding: 8px 14px;
  border-radius: 999px;
  border: 1px solid var(--panel-border);
  background: var(--panel-bg);
  color: var(--text);
  font-size: 0.9rem;
  white-space: nowrap;
  pointer-events: none;
}
</style>
