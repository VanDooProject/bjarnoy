<script setup lang="ts">
// The pointy-top hex dial of a building marker: level (or the countdown of a running upgrade) inside, ring colour = upgrade
// state, a yellow arc from the top vertex = elapsed fraction (like the Pixi construction dial, lib/map/constructionDial.ts).
// The arc flows: from the order's start / end time it is one linear Web Animation of the hex outline's dash offset over the
// remaining time (information, so it plays under reduced motion too), not a step per polled second.
// It also draws every state of the hex's order dial the way the canvas does (`order`, read through `dialPhase`): queued (plain
// track and `#place`), pending (orbiting sweep and dots), refused (red flash, cross, shrink) and the finish animation.
import { computed, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import type { HudRing } from '../../lib/hud/buildingHud';
import {
  CONSTRUCTION_DIAL_ELAPSED_COLOR,
  CONSTRUCTION_DIAL_REJECT_COLOR,
  DIAL_PENDING_SWEEP_MS,
  dialPhase,
  dialProgress,
  hexPerimeterSegment,
  pendingDotFrame,
  polylinePartial,
  type ConstructionDial,
} from '../../lib/map/constructionDial';
import { prefersReducedMotion } from '../../lib/motion';

const props = defineProps<{
  radius: number;
  ring: HudRing;
  /** Elapsed fraction of a running upgrade, as last polled; the arc takes it where the order has no times. */
  progress?: number;
  /** What sits inside: the level, the time left or `#place`; empty = the ring only. */
  label?: string;
  /** The label is a countdown (smaller font on near/mid, where it replaces the level). */
  time?: boolean;
  /** Fades the number in / out when it appears or goes away (far <-> dial); null = it just switches. */
  labelFade?: ((el: Element, direction: 'in' | 'out', done: () => void) => void) | null;
  /** The hex's order dial: its pending / refused / finish frames are drawn from it, frame by frame. */
  order?: ConstructionDial | null;
  /** The pending dial's centre dots show with the number (not on the far tier, like the canvas dial). */
  labelVisible?: boolean;
}>();

const RING_COLOR: Record<HudRing, string> = { ready: '#5fd08a', blocked: '#e2705f', upgrading: '#fff', max: '#ffd23f', none: '#fff' };
const GOLD = '#ffc55c';
const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const YELLOW = css(CONSTRUCTION_DIAL_ELAPSED_COLOR);
const RED = css(CONSTRUCTION_DIAL_REJECT_COLOR);
const DARK = '#08121a';

type Pts = readonly (readonly number[])[];
const fmt = (pts: Pts) => pts.map((p) => `${p[0]!.toFixed(2)},${p[1]!.toFixed(2)}`).join(' ');
/** A flat [x, y, ...] polyline (the lib's shape) as an SVG points string. */
const flat = (path: number[]) => {
  const out: string[] = [];
  for (let i = 0; i + 1 < path.length; i += 2) out.push(`${path[i]!.toFixed(2)},${path[i + 1]!.toFixed(2)}`);
  return out.join(' ');
};

const geometry = computed(() => {
  const r = props.radius;
  const sw = (6 * r) / 27.5;
  const pad = sw / 2 + 1;
  const c = r + pad;
  const vertex = (i: number, rr: number) => {
    const a = ((-90 + 60 * i) * Math.PI) / 180;
    return [c + rr * Math.cos(a), c + rr * Math.sin(a)] as const;
  };
  const hexAt = (rr: number) => fmt([0, 1, 2, 3, 4, 5].map((i) => vertex(i, rr)));
  const hex = [0, 1, 2, 3, 4, 5].map((i) => vertex(i, r));
  // The arc is this outline (from the top vertex, clockwise, closed), drawn `progress` of the way round by its dash offset.
  const outline = `M${hex.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' L')} Z`;
  const font = props.time ? (14.4 * r) / 27.5 : 13 + (r - 14) * 0.5;
  return { sw, size: 2 * c, c, hex: fmt(hex), hexAt, outline, font, unit: sw / 6 };
});

// ---- the elapsed arc --------------------------------------------------------------------------------------------------------

/** The order's own start and end (the canvas dial's `dialProgress`); without them the polled `progress` is all there is. */
const timed = computed(() => {
  const o = props.order;
  return !!o && o.state === 'building' && o.startMs !== null && o.endMs !== null && o.endMs > o.startMs;
});
const arcShown = computed(() => props.ring === 'upgrading' && (timed.value || (props.progress ?? 0) > 0));
const arcProgress = (nowMs: number) => (timed.value ? dialProgress(props.order!, nowMs) : Math.min(1, Math.max(0, props.progress ?? 0)));
/** `stroke-dashoffset` of the outline (path length 1, dash 1, gap 1): 1 - progress shows `progress` of it from the top vertex. */
const arcOffset = computed(() => 1 - arcProgress(Date.now()));

const arcEl = ref<Element | null>(null);
const setArcEl = (el: Element | ComponentPublicInstance | null) => (arcEl.value = el instanceof Element ? el : null);
let arcAnim: Animation | null = null;
function stopArc() {
  arcAnim?.cancel();
  arcAnim = null;
}
// One linear animation from the progress now to the full ring at the order's end; restarted only when the order's times change.
watch(
  [arcEl, () => (timed.value ? `${props.order!.startMs}|${props.order!.endMs}` : null)],
  ([el, times]) => {
    stopArc();
    if (!el || times === null || typeof (el as { animate?: unknown }).animate !== 'function') return;
    const nowMs = Date.now();
    const remaining = props.order!.endMs! - nowMs;
    if (remaining <= 0) return;
    arcAnim = el.animate([{ strokeDashoffset: 1 - arcProgress(nowMs) }, { strokeDashoffset: 0 }], { duration: remaining, easing: 'linear', fill: 'forwards' });
  },
  { flush: 'post', immediate: true },
);

const trackColor = computed(() => RING_COLOR[props.ring]);
const trackOpacity = computed(() => (props.ring === 'upgrading' ? 0.3 : props.ring === 'none' ? 0.2 : 1));
const labelColor = computed(() => (props.ring === 'max' ? GOLD : '#fff'));

// ---- the order dial's frames ----------------------------------------------------------------------------------------------
// `now` only moves while a frame-by-frame animation plays (pending sweep, refusal, finish); a running order's end schedules
// one refresh so its finish starts on time.

const now = ref(Date.now());
const phase = computed(() => (props.order ? dialPhase(props.order, now.value, prefersReducedMotion()) : null));
const animated = computed(() => {
  const p = phase.value;
  return p !== null && (p.kind === 'finish' || p.kind === 'reject' || (p.kind === 'pending' && !prefersReducedMotion()));
});

let raf = 0;
function loop() {
  now.value = Date.now();
  raf = requestAnimationFrame(loop);
}
watch(
  animated,
  (on) => {
    cancelAnimationFrame(raf);
    raf = 0;
    if (!on) return;
    now.value = Date.now();
    raf = requestAnimationFrame(loop);
  },
  { immediate: true },
);

let endTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => props.order,
  (order) => {
    if (endTimer !== null) clearTimeout(endTimer);
    endTimer = null;
    now.value = Date.now();
    if (order && order.endMs !== null && order.endMs > now.value) {
      endTimer = setTimeout(() => (now.value = Date.now()), order.endMs - now.value + 1);
    }
  },
  { immediate: true },
);
onUnmounted(() => {
  stopArc();
  cancelAnimationFrame(raf);
  if (endTimer !== null) clearTimeout(endTimer);
});

/** The finish and refusal animations, as the canvas draws them (same frames, same shapes), in the dial's own units. */
const burst = computed(() => {
  const p = phase.value;
  if (!p || (p.kind !== 'finish' && p.kind !== 'reject')) return null;
  const { c, hexAt, sw, unit } = geometry.value;
  const r = props.radius;
  const rejected = p.kind === 'reject';
  const color = rejected ? RED : YELLOW;
  const frame = p.frame;
  const a = frame.alpha;
  const size = r * frame.scale;
  const rings = frame.rings.filter((ring) => ring.alpha > 0).map((ring) => ({ points: hexAt(r * ring.scale), opacity: ring.alpha * a }));
  let marks: string[];
  if (p.kind === 'finish') {
    marks = [
      flat(
        polylinePartial(
          [
            { x: c - 0.38 * size, y: c + 0.02 * size },
            { x: c - 0.1 * size, y: c + 0.3 * size },
            { x: c + 0.4 * size, y: c - 0.25 * size },
          ],
          p.frame.check,
        ),
      ),
    ];
  } else {
    const h = 0.34 * size;
    marks = [
      flat(polylinePartial([{ x: c - h, y: c - h }, { x: c + h, y: c + h }], p.frame.cross * 2)),
      flat(polylinePartial([{ x: c + h, y: c - h }, { x: c - h, y: c + h }], p.frame.cross * 2 - 1)),
    ];
  }
  return {
    color,
    body: hexAt(size),
    bodyOpacity: 0.85 * a,
    flashOpacity: (rejected ? 0.7 : 0.75) * frame.flash * a,
    edgeOpacity: a,
    rings,
    marks: marks.filter((m) => m !== ''),
    ringWidth: 3 * unit,
    markWidth: 5 * unit,
    edgeWidth: sw,
    shake: p.kind === 'reject' ? p.frame.offsetX : 0,
  };
});

/** The pending dial: one orbiting sweep (still segments with reduced motion), and the three bouncing dots. */
const pending = computed(() => {
  if (phase.value?.kind !== 'pending') return null;
  const { c, sw } = geometry.value;
  const r = props.radius;
  const reduced = prefersReducedMotion();
  const segments: string[] = [];
  if (reduced) for (let k = 0; k < 3; k++) segments.push(flat(hexPerimeterSegment(c, c, r, k / 3, k / 3 + 1 / 12)));
  else {
    const head = (now.value % DIAL_PENDING_SWEEP_MS) / DIAL_PENDING_SWEEP_MS;
    segments.push(flat(hexPerimeterSegment(c, c, r, head, head + 1 / 6)));
  }
  const s = 0.1 * r;
  const dots = [0, 1, 2].map((i) => {
    const dot = pendingDotFrame(now.value, i, reduced);
    return { x: c + (i - 1) * 3.2 * s, y: c - dot.lift * s, r: s, opacity: dot.alpha };
  });
  return { segments, dots, width: sw };
});
</script>

<template>
  <svg
    class="hud-dial"
    :width="geometry.size"
    :height="geometry.size"
    :viewBox="`0 0 ${geometry.size} ${geometry.size}`"
    style="overflow: visible"
    aria-hidden="true"
  >
    <g v-if="burst" class="hud-dial__burst" :transform="`translate(${burst.shake.toFixed(2)} 0)`">
      <polygon v-for="(ring, i) in burst.rings" :key="i" :points="ring.points" fill="none" :stroke="burst.color" :stroke-opacity="ring.opacity" :stroke-width="burst.ringWidth" stroke-linejoin="round" />
      <polygon :points="burst.body" :fill="DARK" :fill-opacity="burst.bodyOpacity" />
      <polygon :points="burst.body" :fill="burst.color" :fill-opacity="burst.flashOpacity" />
      <polygon :points="burst.body" fill="none" :stroke="burst.color" :stroke-opacity="burst.edgeOpacity" :stroke-width="burst.edgeWidth" stroke-linejoin="round" />
      <polyline v-for="(mark, i) in burst.marks" :key="`m${i}`" :points="mark" fill="none" stroke="#fff" :stroke-opacity="burst.edgeOpacity" :stroke-width="burst.markWidth" stroke-linecap="round" stroke-linejoin="round" />
    </g>
    <template v-else>
      <polygon :points="geometry.hex" fill="#0b1720" />
      <polygon :points="geometry.hex" fill="none" :stroke="trackColor" :stroke-opacity="trackOpacity" :stroke-width="geometry.sw" stroke-linejoin="round" />
      <path v-if="arcShown" :ref="setArcEl" class="hud-dial__arc" :d="geometry.outline" pathLength="1" stroke-dasharray="1 1" :stroke-dashoffset="arcOffset" fill="none" :stroke="YELLOW" :stroke-width="geometry.sw" stroke-linecap="round" stroke-linejoin="round" />
      <template v-if="pending">
        <polyline v-for="(segment, i) in pending.segments" :key="i" class="hud-dial__sweep" :points="segment" fill="none" :stroke="YELLOW" :stroke-width="pending.width" stroke-linecap="round" stroke-linejoin="round" />
        <template v-if="labelVisible">
          <circle v-for="(dot, i) in pending.dots" :key="`d${i}`" class="hud-dial__dot" :cx="dot.x" :cy="dot.y" :r="dot.r" fill="#fff" :fill-opacity="dot.opacity" />
        </template>
      </template>
      <Transition :css="false" @enter="(el, done) => (labelFade ? labelFade(el, 'in', done) : done())" @leave="(el, done) => (labelFade ? labelFade(el, 'out', done) : done())">
        <text
          v-if="label"
          :x="geometry.c"
          :y="geometry.c + geometry.font * 0.36"
          text-anchor="middle"
          font-family="Barlow, sans-serif"
          font-weight="700"
          :font-size="geometry.font"
          :fill="labelColor"
          stroke="rgba(0,0,0,.6)"
          stroke-width="1.5"
          style="paint-order: stroke"
        >
          {{ label }}
        </text>
      </Transition>
    </template>
  </svg>
</template>

<style scoped>
.hud-dial {
  display: block;
}
</style>
