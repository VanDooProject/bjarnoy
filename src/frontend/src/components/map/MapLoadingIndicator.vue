<script setup lang="ts">
// HexMapRenderer.mount()'s tile-art loading state (see MapLoadState in
// HexMapRenderer.ts), surfaced as a small UI: a centred overlay while
// nothing is drawable yet ('terrain'), a thin sweeping bar along the map's
// top edge while terrain is up but building art is still loading ('buildings'), and nothing once
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
    <div v-else class="top-bar">
      <div class="top-bar-sweep" aria-hidden="true" />
      <span class="visually-hidden">{{ t('hud.mapLoading.buildings') }}</span>
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

/* A thin sweeping line along the map's top edge rather than a chip in a
   corner: every corner of the map is already taken by some view's HUD
   (queue panels, the army panel, the landing page's onboarding card on a
   phone), while the top edge of the canvas is free in all of them. The
   label is kept for screen readers only. */
.top-bar {
  position: absolute;
  /* The canvas runs full-bleed under the HUD header, so the top edge that
     is actually visible starts below it — same inset (and 64px fallback)
     OnboardingBanner.vue uses. */
  top: var(--hud-inset-top, 64px);
  left: 0;
  right: 0;
  height: 3px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}
.top-bar-sweep {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 30%;
  background: var(--gold);
  animation: map-loading-sweep 1.2s ease-in-out infinite;
}
@keyframes map-loading-sweep {
  from {
    left: -30%;
  }
  to {
    left: 100%;
  }
}
.map-loading--reduced .top-bar-sweep {
  animation: none;
  left: 0;
  width: 100%;
  opacity: 0.6;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.hex {
  width: 48px;
  height: 48px;
  fill: none;
  stroke: var(--gold);
  stroke-width: 6;
  stroke-linejoin: round;
}
.hex--pulse {
  animation: map-loading-pulse 1.6s ease-in-out infinite;
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
.map-loading--reduced .hex--pulse {
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
  .top-bar-sweep {
    animation: none;
    opacity: 1;
    transform: none;
  }
  .map-loading {
    transition: none;
  }
}
</style>
