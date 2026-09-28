<script setup lang="ts">
// HexMapRenderer.mount()'s tile-art loading state (see MapLoadState in
// HexMapRenderer.ts), surfaced as a small UI: a centred overlay while
// nothing is drawable yet ('terrain'), a corner indicator while terrain is
// up but building art is still loading ('buildings'), and nothing once
// everything has settled ('ready') — after a short fade so the transition
// doesn't just snap away. World-mode mounts never reach 'terrain'/
// 'buildings' at all (see startTextureLoad), so this renders nothing for
// them from the very first tick.
import { onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import type { MapLoadState } from '../../lib/map/HexMapRenderer';

const props = defineProps<{ state: MapLoadState }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// Checked once at setup, same as WastedIsland.vue's own reducedMotion — this
// is a fixed, per-session device preference, not something that needs a
// live-updating watcher for a loading indicator that's on screen for at most
// a few seconds.
const reducedMotion =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

const FADE_MS = 250;

// 'ready' has nothing of its own to draw — it fades out whatever the last
// real phase showed, then this goes false and the template unmounts for
// real. Kept as its own ref (not derived from `props.state.phase`) so it
// survives the phase already having flipped to 'ready' during the fade.
const lastPhase = ref<'terrain' | 'buildings'>(props.state.phase === 'buildings' ? 'buildings' : 'terrain');
// Renders nothing at all if construction starts already 'ready' (world mode)
// — never shown, never faded.
const visible = ref(props.state.phase !== 'ready');
const hiding = ref(false);
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

function clearFadeTimer() {
  if (fadeTimer !== null) {
    clearTimeout(fadeTimer);
    fadeTimer = null;
  }
}

watch(
  () => props.state.phase,
  (phase) => {
    if (phase === 'ready') {
      if (hiding.value) return; // already fading out
      hiding.value = true;
      fadeTimer = setTimeout(() => {
        visible.value = false;
        fadeTimer = null;
      }, FADE_MS);
      return;
    }
    lastPhase.value = phase;
    clearFadeTimer();
    hiding.value = false;
    visible.value = true;
  },
  { immediate: true },
);

onUnmounted(clearFadeTimer);
</script>

<template>
  <div
    v-if="visible"
    class="map-loading"
    :class="[`map-loading--${lastPhase}`, { 'map-loading--hiding': hiding, 'map-loading--reduced': reducedMotion }]"
    role="status"
    aria-live="polite"
  >
    <div v-if="lastPhase === 'terrain'" class="overlay">
      <svg class="hex hex--pulse" viewBox="0 0 100 100" aria-hidden="true">
        <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" />
      </svg>
      <p class="label">{{ t('hud.mapLoading.terrain') }}</p>
      <div v-if="state.progress !== undefined" class="progress-track">
        <div class="progress-fill" :style="{ width: `${Math.round(state.progress * 100)}%` }" />
      </div>
    </div>
    <div v-else class="corner">
      <svg class="hex hex--spin hex--small" viewBox="0 0 100 100" aria-hidden="true">
        <polygon points="50,4 93,27 93,73 50,96 7,73 7,27" />
      </svg>
      <span class="label">{{ t('hud.mapLoading.buildings') }}</span>
    </div>
  </div>
</template>

<style scoped>
.map-loading {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 1;
  transition: opacity 250ms ease;
  z-index: 8;
}
.map-loading--hiding {
  opacity: 0;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px 28px;
}
.overlay .label {
  margin: 0;
  color: #fdf6e8;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
}

/* Bottom-left — MapView/LandingView keep BuildQueuePanel (top-left),
   TrainingQueuePanel (top-right) and ArmyPanel (bottom-right) elsewhere, so
   this corner is the one free of other HUD chrome in both views. Matches
   ArmyPanel.vue's own --hud-inset-bottom handling for the mobile docked
   bottom bar. */
.corner {
  position: absolute;
  left: 16px;
  bottom: calc(16px + var(--hud-inset-bottom, 0px));
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 0;
}
.corner .label {
  color: #fdf6e8;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.hex {
  width: 48px;
  height: 48px;
  fill: none;
  stroke: var(--gold);
  stroke-width: 6;
  stroke-linejoin: round;
}
.hex--small {
  width: 20px;
  height: 20px;
}
.hex--pulse {
  animation: map-loading-pulse 1.6s ease-in-out infinite;
  transform-origin: center;
}
.hex--spin {
  animation: map-loading-spin 1.4s linear infinite;
  transform-origin: center;
}
@keyframes map-loading-pulse {
  0%,
  100% {
    opacity: 0.4;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes map-loading-spin {
  to {
    transform: rotate(360deg);
  }
}
.map-loading--reduced .hex--pulse,
.map-loading--reduced .hex--spin {
  animation: none;
  opacity: 1;
  transform: none;
}

.progress-track {
  width: 160px;
  height: 4px;
  background: rgba(255, 255, 255, 0.15);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: var(--gold);
  transition: width 200ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .hex--pulse,
  .hex--spin {
    animation: none;
    opacity: 1;
    transform: none;
  }
  .map-loading {
    transition: none;
  }
}
</style>
