<script setup lang="ts">
// issue #16 "ring menu on click of tile": clicking a hex now opens this
// contextual radial menu instead of jumping straight to BuildingModal — the
// action set depends on what's actually on the tile (see actionsFor in
// SettlementView.vue). A nested "outer ring" of building choices (the
// mockup's "build ... opens another ring outside with available buildings")
// is deliberately not built here: the demo/live building catalogue is one
// buildable type per empty tile today (see BuildingModal.vue's ART/
// BUILDING_NAMES), so Build opens the existing single-choice detail modal
// instead of a picker ring that would have nothing to pick between.
import { computed } from 'vue';

export interface RingAction {
  key: string;
  label: string;
  disabled?: boolean;
  /** Shown as a small note under the label when disabled — why it can't be used yet. */
  reason?: string;
}

const props = defineProps<{
  x: number;
  y: number;
  title: string;
  actions: RingAction[];
}>();
const emit = defineEmits<{ select: [key: string]; close: [] }>();

const RADIUS = 96;

const placed = computed(() =>
  props.actions.map((action, i) => {
    // Start at the top (-90deg) and go clockwise, evenly spaced.
    const angle = (i / props.actions.length) * Math.PI * 2 - Math.PI / 2;
    return { action, dx: Math.cos(angle) * RADIUS, dy: Math.sin(angle) * RADIUS };
  }),
);
</script>

<template>
  <div class="ring-backdrop" @click.self="emit('close')" @contextmenu.prevent="emit('close')">
    <div class="ring" :style="{ left: `${x}px`, top: `${y}px` }">
      <div class="center panel">{{ title }}</div>
      <button
        v-for="p in placed"
        :key="p.action.key"
        type="button"
        class="slice hex"
        :class="{ disabled: p.action.disabled }"
        :style="{ transform: `translate(${p.dx}px, ${p.dy}px) translate(-50%, -50%)` }"
        :title="p.action.disabled ? p.action.reason : undefined"
        @click="!p.action.disabled && emit('select', p.action.key)"
      >
        <span class="label">{{ p.action.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ring-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
}
.ring {
  position: absolute;
  transform: translate(-50%, -50%);
}
.center {
  position: absolute;
  left: 0;
  top: 0;
  transform: translate(-50%, -50%);
  padding: 6px 12px;
  max-width: 120px;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  pointer-events: none;
}
.slice {
  position: absolute;
  left: 0;
  top: 0;
  width: 76px;
  height: 68px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  color: var(--text);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
  cursor: pointer;
}
.slice:hover:not(.disabled) {
  border-color: var(--gold);
  color: var(--gold);
}
.slice.disabled {
  color: var(--muted-2);
  cursor: not-allowed;
  opacity: 0.55;
}
.label {
  pointer-events: none;
}
</style>
