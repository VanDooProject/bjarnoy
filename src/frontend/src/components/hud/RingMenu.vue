<script setup lang="ts">
// Issue #16 "ring menu on click of tile": replaces the old
// instant-open-BuildingModal click behaviour with a radial menu of
// contextual actions around the clicked hex, matching the mockup's bubbles
// arranged around a tile ("Move" / "Details" / "Raze" / "Troops" style).
// Generic on purpose: SettlementView decides *which* actions apply for a
// given tile's state (own empty tile, own building, enemy tile, unclaimed
// hex) and passes them in; this component only lays them out and reports a
// selection back.
import { computed } from 'vue';

export interface RingAction {
  id: string;
  label: string;
  disabled?: boolean;
  /** Shown as a tooltip on a disabled action, e.g. why it's unavailable. */
  hint?: string;
}

const props = defineProps<{
  x: number;
  y: number;
  actions: RingAction[];
  /** Small floating badge above the ring, e.g. "Lv 5 upgrade" over a building. */
  badge?: string;
}>();
const emit = defineEmits<{ select: [id: string]; close: [] }>();

const RADIUS = 92;

const positioned = computed(() => {
  const n = props.actions.length;
  // 4 actions read best as an X (NW/NE/SW/SE, like the mockup); anything
  // else is spread evenly starting from the top.
  const rotationOffset = n === 4 ? 45 : -90;
  const angleStep = 360 / Math.max(1, n);
  return props.actions.map((action, i) => {
    const angleDeg = angleStep * i + rotationOffset;
    const rad = (angleDeg * Math.PI) / 180;
    return {
      action,
      left: props.x + Math.cos(rad) * RADIUS,
      top: props.y + Math.sin(rad) * RADIUS,
    };
  });
});

function select(action: RingAction) {
  if (action.disabled) return;
  emit('select', action.id);
}
</script>

<template>
  <div class="ring-backdrop" @click.self="emit('close')" @contextmenu.prevent="emit('close')">
    <div v-if="badge" class="ring-badge" :style="{ left: `${x}px`, top: `${y - RADIUS - 34}px` }">
      {{ badge }}
    </div>
    <div class="ring-center" :style="{ left: `${x}px`, top: `${y}px` }" />
    <button
      v-for="p in positioned"
      :key="p.action.id"
      class="ring-bubble"
      :class="{ disabled: p.action.disabled }"
      :style="{ left: `${p.left}px`, top: `${p.top}px` }"
      :disabled="p.action.disabled"
      :title="p.action.disabled ? p.action.hint : undefined"
      @click="select(p.action)"
    >
      {{ p.action.label }}
    </button>
  </div>
</template>

<style scoped>
.ring-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
}
.ring-center {
  position: absolute;
  width: 10px;
  height: 10px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: var(--gold);
  box-shadow: 0 0 0 4px rgba(255, 197, 92, 0.25);
  pointer-events: none;
}
.ring-badge {
  position: absolute;
  transform: translate(-50%, -50%);
  background: var(--panel-bg);
  border: 1px solid var(--gold);
  color: var(--gold);
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  white-space: nowrap;
  pointer-events: none;
}
.ring-bubble {
  position: absolute;
  transform: translate(-50%, -50%);
  min-width: 84px;
  padding: 10px 14px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
}
.ring-bubble:hover:not(.disabled) {
  border-color: var(--gold);
  color: var(--gold);
}
.ring-bubble.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
