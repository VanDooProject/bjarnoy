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
//
// landing-page-defects.md L2: `--anchor-x/-y` (written by useMapAnchor, or
// by the `screen` watchEffect below) is the TARGET's screen point, and
// `.anchor` centres its own box there — which centres the SVG's *bounding
// box*, not the arrowhead's tip, on the target. `arrowTipOffset` computes,
// from the angle alone, the shift that puts the tip back on the target
// (minus a small standoff) instead of hardcoding a translate per angle —
// see that module's own doc comment for the full derivation. This applies
// to BOTH anchor modes identically: the centre-vs-tip mismatch is a
// property of the arrow's own geometry, not of what supplies the anchor
// point, so the hex-anchored and screen-anchored cases need the same fix.
import { computed, ref, watchEffect } from 'vue';
import type { AxialCoord } from '../../lib/hex/coords';
import { useMapAnchor, type MapAnchorRenderer } from '../../composables/useMapAnchor';
import { arrowTipOffset, HEX_TARGET_RADIUS_PX } from '../../lib/map/guidanceArrowGeometry';

const props = withDefaults(
  defineProps<{
    coord?: AxialCoord;
    renderer?: MapAnchorRenderer | null;
    screen?: { x: number; y: number };
    label: string;
    /** Degrees; the mockup's arrow points down-and-toward the hex at roughly this range across its frames. */
    angle?: number;
    /**
     * Radius, in screen px, of the thing being pointed at, so the tip stops
     * clear of its edge rather than inside it. Defaults to a point target,
     * which is what the hex-anchored screens want (a hex has no fixed screen
     * size — it changes with zoom). The ring-menu bubble mode passes its own
     * real radius; see `guidanceArrowGeometry`'s `ARROW_TIP_GAP_PX` for why
     * one flat value for both was wrong.
     */
    targetRadius?: number;
    /** Which side of the arrow the label chip sits on. */
    chipSide?: 'left' | 'right';
  }>(),
  { angle: 38, targetRadius: HEX_TARGET_RADIUS_PX, chipSide: 'left' },
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

// `angle` is a static prop per pointer target (it changes only when the
// guidance step changes, not every frame the way the anchor position does),
// so a plain computed — recalculated on prop change, not per animation
// frame — is the right cost here.
const tipOffset = computed(() => arrowTipOffset(props.angle, props.targetRadius));
</script>

<template>
  <div
    ref="anchorEl"
    class="anchor"
    data-testid="guidance-pointer"
    :style="{ '--rotate': `${angle}deg`, '--tip-dx': `${tipOffset.x}px`, '--tip-dy': `${tipOffset.y}px` }"
  >
    <!-- `.shift` carries the tip-offset translate for BOTH the arrow and the
         chip, so the chip stays visually attached to the (now correctly
         placed) arrow instead of staying pinned to the old, unshifted
         anchor point — see guidanceArrowGeometry.ts. `.rotate` keeps only
         the rotation, so the bob keyframe nested inside it still reads as
         "along the shaft" (see the header comment above). -->
    <div class="shift">
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
/* `.shift` (outer) translates in plain screen space; `.rotate` (its child)
   then rotates about the ALREADY-SHIFTED centre. So the net effect on the
   tip is: start at the anchor, move by (--tip-dx, --tip-dy), then rotate
   about that moved point by --rotate — matching arrowTipOffset's own
   derivation (`anchor + offset`, then `+ rotatedTipVector(angle)`). Putting
   the translate on the OUTER element and the rotation on the INNER one is
   what makes this a screen-space shift rather than a shift along the arrow's
   pre-rotation local axis — swapping which element gets which transform
   would rotate the offset itself and send the tip off at the wrong angle. */
.shift {
  transform: translate(var(--tip-dx, 0px), var(--tip-dy, 0px));
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

/* Mobile-readiness audit (finding d): the chip sat to the LEFT of the arrow
   with nowrap uppercase text ("NOW BUILD HERE" / "THIS ONE FITS GRASSLAND"),
   which on a narrow screen ran clean off the left edge. Centring it above
   the arrow instead keeps it inside the viewport regardless of where the
   arrow itself lands horizontally. The arrow's own rendered size (110px, via
   `width`/`height` on `.arrow-svg`) is left untouched here: `arrowTipOffset`
   (guidanceArrowGeometry.ts) derives its shift from `ARROW_RENDERED_SIZE`,
   so shrinking the rendered box without re-deriving that offset would land
   the tip off-target — correctness of the tip position matters more than
   the arrow's on-screen size. */
@media (max-width: 768px) {
  .chip.left,
  .chip.right {
    top: auto;
    bottom: calc(100% + 4px);
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    font-size: 11px;
    letter-spacing: 0.06em;
    padding: 6px 10px;
  }
}
</style>
