<script setup lang="ts">
// The rising "+N {resource}/h" label (design handoff "2a", frames 2/4/5):
// fires once a guided building is actually placed, at its own real output
// (buildingEconomy.ts's buildingStatsFor — the same formula the hover
// tooltip and build card use), not a fabricated number. One-shot per tick,
// self-removing on `animationend` rather than looping — like the landfall
// burst, the mockup's own keyframe only repeats because it's a static
// preview frame.
import { useI18n } from 'vue-i18n';
import type { ResourceKind } from '../../lib/map/types';
import { resourceName } from '../../i18n/catalogueNames';
import type { MessageSchema } from '../../i18n/schema';

export interface ResourceTick {
  id: number;
  resource: ResourceKind;
  amount: number;
  /** Screen position at the moment the building was placed — a fixed point, not camera-tracked: the tick's ~2.5s lifetime is short enough that this doesn't need to follow a drag. */
  x: number;
  y: number;
}

defineProps<{ ticks: ResourceTick[] }>();
const emit = defineEmits<{ expire: [id: number] }>();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
</script>

<template>
  <div
    v-for="tick in ticks"
    :key="tick.id"
    class="tick"
    :style="{ left: `${tick.x}px`, top: `${tick.y}px`, '--tint': `var(--${tick.resource})` }"
    @animationend="emit('expire', tick.id)"
  >
    {{ t('hud.hoverTooltip.outputResourceRate', { amount: tick.amount, resource: resourceName(tick.resource) }) }}
  </div>
</template>

<style scoped>
@keyframes resource-rise {
  0% {
    transform: translate(-50%, 6px);
    opacity: 0;
  }
  25% {
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -44px);
    opacity: 0;
  }
}
.tick {
  position: absolute;
  z-index: 16;
  transform: translate(-50%, 0);
  font-size: 15px;
  font-weight: 700;
  color: var(--tint);
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
  pointer-events: none;
  animation: resource-rise 2.4s ease-out forwards;
}
@media (prefers-reduced-motion: reduce) {
  /* Not `animation: none` — this animation is also what schedules the
     tick's own removal (@animationend below). Collapsing the duration
     keeps the cleanup firing (no permanently-stuck label) while skipping
     the visible rise. */
  .tick {
    animation-duration: 0.01s;
  }
}
</style>
