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

export interface BadgeAction extends RingAction {
  /** Second, dimmer line under `label` — e.g. label "Lv 5", sublabel "upgrade". */
  sublabel?: string;
}

const props = defineProps<{
  x: number;
  y: number;
  actions: RingAction[];
  // Issue #16 "ring menu" target: a circular gold badge ("Lv 5" / "upgrade")
  // floats above the ring, connected to it by a thin guide line — and in
  // the reference, that badge *is* the upgrade control, not a separate dark
  // bubble duplicating it in the ring below. So this is a real clickable
  // action, not just a text label.
  badgeAction?: BadgeAction;
  // Issue #16 "build should open a new outer ring, concentric rings moving
  // out": the caller renders one RingMenu per open level and spaces them by
  // passing an increasing radius, instead of one ring replacing another.
  radius?: number;
  // Only the innermost/first ring in that stack owns the full-screen
  // backdrop (closing on outside click, starting a drag, right-click to
  // close) — the outer rings are just another orbit of bubbles floating
  // above the same backdrop, so their own backdrop div must not intercept
  // pointer events meant for it.
  backdrop?: boolean;
  // Extra rotation (degrees) added on top of this ring's own layout
  // rotation. Without it, every ring starts its bubbles from the same
  // angle, so an outer ring's bubbles land radially in line with the inner
  // ring's — a "bullseye" rather than a menu unfolding outward. The caller
  // staggers each successive ring by half its parent's angular spacing.
  angleOffset?: number;
  // Shrinks bubble/badge size (1 = full 88px) so outer rings read as
  // further away, not just further out.
  bubbleScale?: number;
  // 0 = innermost ring (solid, brightest track); each level out fades and
  // sparsens its own orbit track, purely a depth cue.
  depth?: number;
}>();
const emit = defineEmits<{
  select: [id: string];
  hover: [id: string];
  close: [];
  // Issue #16 "mouse down on the map should close the ring so we can drag":
  // a mousedown on the backdrop (not a bubble) closes the ring *and* hands
  // the same PointerEvent back so the caller can immediately start a map
  // drag from it — a plain `close` on click would only fire after the
  // mouse is released, too late for that same gesture to become a drag.
  outsidePointerDown: [event: PointerEvent];
}>();

// Issue #16 "ring menu": reference shows the bubbles spread clear of the
// tile in an orbit, not crowded around it — but the radius alone isn't what
// was making the innermost ring feel oversized, the 88px bubbles were (see
// BUBBLE_DIAMETER below); a smaller radius paired with smaller bubbles is
// what actually tightens the footprint without cramming them together.
const RADIUS = 64;
// A ring with a badge (an owned building, "Lv n upgrade") also has the
// canvas's own floating settlement-name pill sitting right at the tile's
// centre, underneath the ring — the same RADIUS that keeps a badge-less
// ring feeling spread out crowds this one from both above (the badge) and
// the middle (that pill), so it gets extra breathing room.
const effectiveRadius = computed(() => {
  const base = props.radius ?? RADIUS;
  return props.badgeAction ? base + 24 : base;
});
const badgeY = computed(() => props.y - effectiveRadius.value - 34);
// Issue #16 "ring menu" target: "connected down to the ring by a thin
// curved guide line" — a quadratic curve from the badge's bottom edge to
// the top of the ring track below it (a slight horizontal bow, not a
// straight drop, to read as "curved").
const guidePath = computed(() => {
  if (!props.badgeAction) return '';
  const startY = badgeY.value + 26;
  const endY = props.y - effectiveRadius.value;
  const midY = (startY + endY) / 2;
  return `M ${props.x} ${startY} Q ${props.x + 16} ${midY} ${props.x} ${endY}`;
});

const positioned = computed(() => {
  const n = props.actions.length;
  const angleStep = 360 / Math.max(1, n);
  // 4 actions read best as an X (NW/NE/SW/SE, like the mockup), which also
  // happens to leave true north clear. Anything else spreads evenly
  // starting from the top — except when a badge floats above the ring
  // (the "Lv n upgrade" badge on an owned building): a bubble landing
  // exactly at north then sits underneath the badge instead of beside it,
  // so the ring is rotated half a step to move that gap to the top instead.
  const rotationOffset = (n === 4 ? 45 : props.badgeAction ? -90 + angleStep / 2 : -90) + (props.angleOffset ?? 0);
  const radius = effectiveRadius.value;
  return props.actions.map((action, i) => {
    const angleDeg = angleStep * i + rotationOffset;
    const rad = (angleDeg * Math.PI) / 180;
    return {
      action,
      left: props.x + Math.cos(rad) * radius,
      top: props.y + Math.sin(rad) * radius,
    };
  });
});

// 60px still clears the ~44-48px touch-target minimum with a little room
// to spare — tighter than the original 88px bubbles, since bubble size (not
// ring spacing) was what dominated how big the whole thing looked.
const BUBBLE_DIAMETER = 60;
const bubbleSize = computed(() => BUBBLE_DIAMETER * (props.bubbleScale ?? 1));
const bubbleFontSize = computed(() => 11 * (props.bubbleScale ?? 1));
// Depth cue: each ring out is fainter and its dashes sparser, so the
// innermost ring reads as the "current" one and outer rings whisper. A
// plain low-alpha white stroke (the original values here) reads fine
// against the map's own dark backdrop overlay, but washes out completely
// over bright terrain/fog — the drop-shadow gives it a dark halo so the
// track stays visible over both.
const trackStyle = computed(() => {
  const depth = props.depth ?? 0;
  const opacity = [0.55, 0.4, 0.28][Math.min(depth, 2)];
  const dash = [[4, 4], [3, 5], [2, 6]][Math.min(depth, 2)];
  return {
    stroke: `rgba(255, 255, 255, ${opacity})`,
    strokeWidth: depth === 0 ? 2 : 1.5,
    strokeDasharray: dash.join(' '),
    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55))',
  };
});

function select(action: RingAction) {
  if (action.disabled) return;
  emit('select', action.id);
}

function onBackdropPointerDown(e: PointerEvent) {
  if (props.backdrop === false) return;
  emit('outsidePointerDown', e);
}

function onBackdropContextMenu() {
  if (props.backdrop === false) return;
  emit('close');
}

// Issue #16 "build (which opens another ring outside with available
// buildings on this spot)": the outer build-category/build-building rings
// should open as soon as the player hovers the action that leads to them —
// not wait for a click — the way a real radial/pie menu drills down.
// SettlementView decides which hovers actually advance the ring (only the
// "build" root action and a category's own bubbles do); anything else is a
// no-op there, so hovering "Upgrade" or "Raze" doesn't trigger anything.
function hover(action: RingAction) {
  if (action.disabled) return;
  emit('hover', action.id);
}
</script>

<template>
  <div
    class="ring-backdrop"
    :class="{ 'no-backdrop': backdrop === false }"
    @pointerdown.self="onBackdropPointerDown"
    @contextmenu.prevent="onBackdropContextMenu"
  >
    <!-- Issue #16 "ring menu": a faint orbit track under the bubbles (the
         "ring" itself, not just floating buttons), plus the curved guide
         line down from the badge when one is present. -->
    <svg class="ring-svg">
      <circle class="ring-track" :cx="x" :cy="y" :r="effectiveRadius" :style="trackStyle" />
      <path v-if="badgeAction" class="ring-guide" :d="guidePath" />
    </svg>
    <button
      v-if="badgeAction"
      class="ring-badge"
      :class="{ disabled: badgeAction.disabled }"
      :style="{ left: `${x}px`, top: `${badgeY}px` }"
      :disabled="badgeAction.disabled"
      :title="badgeAction.disabled ? badgeAction.hint : undefined"
      @click="select(badgeAction)"
    >
      <span class="badge-line1">{{ badgeAction.label }}</span>
      <span v-if="badgeAction.sublabel" class="badge-line2">{{ badgeAction.sublabel }}</span>
    </button>
    <button
      v-for="p in positioned"
      :key="p.action.id"
      class="ring-bubble"
      :class="{ disabled: p.action.disabled }"
      :style="{
        left: `${p.left}px`,
        top: `${p.top}px`,
        width: `${bubbleSize}px`,
        height: `${bubbleSize}px`,
        fontSize: `${bubbleFontSize}px`,
      }"
      :disabled="p.action.disabled"
      :title="p.action.disabled ? p.action.hint : undefined"
      @click="select(p.action)"
      @mouseenter="hover(p.action)"
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
/* An outer, concentric ring (see the `radius`/`backdrop` props) shares the
   screen with the innermost ring's own full-screen backdrop underneath it
   — it must not intercept clicks meant for that backdrop (closing the
   rings, starting a drag), only its own bubbles should be interactive. */
.ring-backdrop.no-backdrop {
  pointer-events: none;
}
.ring-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.ring-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.14);
  stroke-width: 1.5;
  stroke-dasharray: 3 5;
}
.ring-guide {
  fill: none;
  stroke: rgba(255, 197, 92, 0.4);
  stroke-width: 2;
}
.ring-badge {
  position: absolute;
  /* Explicit even though it's the CSS default: pointer-events is inherited,
     so an outer ring's `.ring-backdrop.no-backdrop` (pointer-events: none)
     would otherwise make this unclickable too. */
  pointer-events: auto;
  transform: translate(-50%, -50%);
  width: 76px;
  height: 76px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  background: var(--gold);
  border: none;
  color: #201405;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
}
.ring-badge:hover:not(.disabled) {
  filter: brightness(1.08);
}
.ring-badge.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.badge-line1 {
  font-size: 16px;
  font-weight: 700;
}
.badge-line2 {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.75;
}
.ring-bubble {
  position: absolute;
  /* See .ring-badge's own comment: needed for outer, backdrop-less rings. */
  pointer-events: auto;
  transform: translate(-50%, -50%);
  /* Reference: a plain circle, same size regardless of label length — not
     a pill that stretches with its text. Sizing here matches RingMenu's own
     BUBBLE_DIAMETER default; the inline style (bound to bubbleSize) always
     wins, this is just the no-JS/pre-hydration fallback. */
  width: 60px;
  height: 60px;
  border-radius: 50%;
  padding: 0 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  background: rgba(8, 18, 26, 0.88);
  border: none;
  color: var(--text);
  font-size: 11px;
  line-height: 1.1;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
  /* A long single word (e.g. "Watchtower") has nowhere to break on a plain
     `word-break: normal` — it just overflows the circle. This forces a
     mid-word break only when nothing else fits, so short labels still wrap
     on natural word boundaries first. */
  overflow-wrap: anywhere;
  hyphens: auto;
}
.ring-bubble:hover:not(.disabled) {
  color: var(--gold);
}
.ring-bubble.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
