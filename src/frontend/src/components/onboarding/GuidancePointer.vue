<script setup lang="ts">
// The animated "next click here" pointer (design handoff "2a"): a gold
// arrow bobbing over the map, with an uppercase label chip. Fixed to a hex
// via useMapAnchor so it tracks the camera as it pans/zooms.
//
// chat1: "the arrow needs to move up/down (in dir of itself) and not
// sideways (so 90° of what I want)" — the mockup faked this per fixed angle
// with a hand-picked translate vector (bob30/bob38/bob52, one keyframe per
// angle) because its *outer* wrapper carried the bob translate while only
// an inner <g> rotated the arrow shape. Nesting the bob translate *inside*
// the rotated frame instead means a single plain-vertical keyframe reads as
// "along the shaft's own axis" at any angle — no per-angle keyframe needed.
// The label chip is deliberately kept outside that rotated/bobbing frame
// (upright, positioned to the side) so it stays legible instead of tilting
// and drifting with the arrow.
// Two anchor modes: a hex (`coord`+`renderer`, following the camera via
// useMapAnchor — frames 1/1b/2/4) or a fixed screen point (`screen`, the
// ring menu's own bubble spot for frame 3's "this one fits {terrain}" —
// static while the ring is open, since opening it locks camera drag).
import { ref, watchEffect } from 'vue';
import type { AxialCoord } from '../../lib/hex/coords';
import { useMapAnchor, type MapAnchorRenderer } from '../../composables/useMapAnchor';

const props = withDefaults(
  defineProps<{
    coord?: AxialCoord;
    renderer?: MapAnchorRenderer | null;
    screen?: { x: number; y: number };
    label: string;
    /** Degrees; the mockup's arrow points down-and-toward the hex at roughly this range across its frames. */
    angle?: number;
    /** Which side of the arrow the label chip sits on. */
    chipSide?: 'left' | 'right';
  }>(),
  { angle: 38, chipSide: 'left' },
);

const anchorEl = ref<HTMLElement | null>(null);
useMapAnchor(
  anchorEl,
  () => (props.coord ? props.renderer : null),
  () => props.coord ?? null,
);
watchEffect(() => {
  const screen = props.screen;
  const el = anchorEl.value;
  if (!screen || !el) return;
  el.style.setProperty('--anchor-x', `${screen.x}px`);
  el.style.setProperty('--anchor-y', `${screen.y}px`);
});
</script>

<template>
  <div ref="anchorEl" class="anchor" :style="{ '--rotate': `${angle}deg` }">
    <div class="rotate">
      <div class="bob">
        <svg width="110" height="110" viewBox="0 0 150 150" class="arrow-svg">
          <rect x="60" y="14" width="30" height="66" rx="9" fill="#ffc55c" stroke="#20160a" stroke-width="4" />
          <polygon points="75,136 32,72 118,72" fill="#ffc55c" stroke="#20160a" stroke-width="4" />
        </svg>
      </div>
    </div>
    <div class="chip" :class="chipSide">{{ label }}</div>
  </div>
</template>

<style scoped>
@keyframes pointer-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-14px);
  }
}
.anchor {
  position: absolute;
  left: var(--anchor-x, 50%);
  top: var(--anchor-y, 50%);
  transform: translate(-50%, -50%);
  /* Above RingMenu's own backdrop/bubbles (z-index 30) for the ring-bubble
     anchor mode — the two modes never coexist, so a single z-index works
     for both. */
  z-index: 36;
  pointer-events: none;
}
.rotate {
  transform: rotate(var(--rotate));
}
.bob {
  animation: pointer-bob 1.15s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .bob {
    animation: none;
  }
}
.arrow-svg {
  display: block;
  filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.6));
}
.chip {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  padding: 9px 14px;
  border-radius: 999px;
  background: var(--gold);
  color: #20160a;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5);
}
.chip.left {
  right: calc(100% + 14px);
}
.chip.right {
  left: calc(100% + 14px);
}
</style>
