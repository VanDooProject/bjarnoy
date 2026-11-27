<script setup lang="ts">
// The pointy-top hex dial of a building marker: level (or the countdown of a running upgrade) inside, ring colour = upgrade
// state, a yellow arc from the top vertex = elapsed fraction (like the Pixi construction dial, lib/map/constructionDial.ts).
// The arc flows: from the order's start / end time it is one linear Web Animation of the hex outline's dash offset over the
// remaining time (information, so it plays under reduced motion too), not a step per polled second.
// It also draws every state of the hex's order dial the way the canvas does (`order`, read through `dialPhase`): queued (plain
// track and `#place`), pending (orbiting sweep and dots), refused (red flash, cross, shrink) and the finish animation.
import { computed, nextTick, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue';
import type { HudRing } from '../../lib/hud/buildingHud';
import {
  CONSTRUCTION_DIAL_ELAPSED_COLOR,
  BLOCKED_DIAL_OPTIONS,
  CONSTRUCTION_DIAL_REJECT_COLOR,
  DIAL_PENDING_SWEEP_MS,
  dialLevelFontPx,
  dialPhase,
  dialProgress,
  dialRejectFrame,
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
  /** The label is shown in the elapsed colour (a countdown in its last minute). */
  urgent?: boolean;
  /** The pending dial's centre dots show with the number (not on the far tier, like the canvas dial). */
  labelVisible?: boolean;
  /**
   * A glyph in place of the level (the quick upgrade look of a marker): `up` = a gold-filled hex with a dark double chevron (the
   * upgrade can be ordered now), `wait` = the dark hex with a clock (it cannot yet). Only drawn on the plain state dial.
   */
  glyph?: 'up' | 'wait';
  /**
   * The building's level, shown in a small hex on the dial's lower right corner point while a glyph replaces it in the dial.
   * Switching the glyph in, a copy of the dial with the level slides there; switching out plays that in reverse.
   */
  level?: number;
  /**
   * When a quick upgrade hit this blocked building (the renderer's `flashBlockedMarker`): the refusal animation plays over the
   * plain dial without the cross and the fade-out, so the marker stays as it was (`BLOCKED_DIAL_OPTIONS`).
   */
  blockedAtMs?: number;
  /** The elapsed arc runs counter-clockwise (a raze); an upgrade's runs clockwise. */
  counterClockwise?: boolean;
}>();

const RING_COLOR: Record<HudRing, string> = { ready: '#5fd08a', blocked: '#e2705f', upgrading: '#fff', max: '#ffd23f', none: '#fff' };
const GOLD = '#ffc55c';
const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const YELLOW = css(CONSTRUCTION_DIAL_ELAPSED_COLOR);
const RED = css(CONSTRUCTION_DIAL_REJECT_COLOR);
const DARK = '#08121a';
const DARK_FILL = '#0b1720';

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
  // The arc is this outline (from the top vertex, clockwise or, for a raze, counter-clockwise; closed), drawn `progress` of the
  // way round by its dash offset.
  const arcHex = props.counterClockwise ? [hex[0]!, ...hex.slice(1).reverse()] : hex;
  const outline = `M${arcHex.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' L')} Z`;
  const font = props.time ? (14.4 * r) / 27.5 : dialLevelFontPx(r);
  return { sw, size: 2 * c, c, hex: fmt(hex), hexAt, outline, font, unit: sw / 6 };
});

/** The marks of the glyphs, in the dial's own units (the radius scales them). */
const glyphMarks = computed(() => {
  const { c } = geometry.value;
  const r = props.radius;
  const w = 0.42 * r;
  const h = 0.3 * r;
  const chevron = (apexY: number) => fmt([[c - w, apexY + h], [c, apexY], [c + w, apexY + h]]);
  return {
    chevrons: [chevron(c - 0.34 * r), chevron(c + 0.04 * r)],
    width: Math.max(2, 0.14 * r),
    clockRadius: 0.38 * r,
    hands: fmt([[c, c - 0.22 * r], [c, c], [c + 0.16 * r, c + 0.1 * r]]),
  };
});

// ---- the quick look: the level hex and the switch --------------------------------------------------------------------------
// While a glyph shows, the level sits in a small hex on the dial's lower right corner point. It is a copy of the whole dial
// (dark hex, ring, level) at 0.6 scale, so switching is one element sliding: in, a full-size copy starts over the dial and moves
// to the corner while the dial underneath turns gold and the glyph fades in; out, the same in reverse.

const CORNER_SCALE = 0.6;
const SWITCH_MS = 450;
const SWITCH_EASING = 'cubic-bezier(.3, 0, .2, 1)';
/** The glyph starts to fade in this far into the switch (a share of it). */
const GLYPH_DELAY = 120 / SWITCH_MS;
const FULL_COPY = 'translate(0px, 0px) scale(1)';
const cornerCopy = computed(() => `translate(${(0.866 * props.radius * 0.98).toFixed(2)}px, ${(0.5 * props.radius * 0.98).toFixed(2)}px) scale(${CORNER_SCALE})`);
/** The copy's level in its own (full-size) units: scaled to the corner it is 1.05 x the small hex's radius. */
const cornerFont = computed(() => (1.05 * props.radius).toFixed(2));

/** The glyph the dial draws now: follows `glyph`, except while the switch-out plays (the old glyph stays until it is done). */
const shown = ref(props.glyph);
const svgEl = ref<SVGSVGElement | null>(null);
let switchAnims: Animation[] = [];
let switchDir: 'in' | 'out' | null = null;

function stopSwitch() {
  switchAnims.forEach((a) => a.cancel());
  switchAnims = [];
  switchDir = null;
}

/** The animated parts of the switch, each with the keyframes of the switch-in (the switch-out plays them in reverse). */
function switchParts(): { el: Element; frames: Keyframe[] }[] {
  const root = svgEl.value;
  if (!root) return [];
  const parts: { el: Element; frames: Keyframe[] }[] = [];
  const add = (selector: string, frames: Keyframe[]) => {
    const el = root.querySelector(selector);
    if (el && typeof (el as { animate?: unknown }).animate === 'function') parts.push({ el, frames });
  };
  add('.hud-dial__level', [{ transform: FULL_COPY }, { transform: cornerCopy.value }]);
  add('.hud-dial__level-text', [{ fontSize: `${geometry.value.font}px` }, { fontSize: `${cornerFont.value}px` }]);
  if (shown.value === 'up') add('.hud-dial__body', [{ fill: DARK_FILL }, { fill: GOLD }]);
  add('.hud-dial__glyph', [
    { opacity: 0, transform: 'translateY(5px)', offset: 0 },
    { opacity: 0, transform: 'translateY(5px)', offset: GLYPH_DELAY },
    { opacity: 1, transform: 'translateY(0)', offset: 1 },
  ]);
  return parts;
}

function playSwitch(direction: 'in' | 'out') {
  const parts = switchParts();
  if (!parts.length) {
    if (direction === 'out') shown.value = undefined;
    return;
  }
  switchDir = direction;
  switchAnims = parts.map(({ el, frames }) =>
    el.animate(frames, { duration: SWITCH_MS, easing: SWITCH_EASING, fill: 'both', direction: direction === 'in' ? 'normal' : 'reverse' }),
  );
  const anims = switchAnims;
  const done = () => {
    // Only the last of a batch settles the state (they all run the same time).
    if (switchAnims !== anims || anims.some((a) => a.playState === 'running')) return;
    if (switchDir !== 'out') return stopSwitch();
    // The animations hold the first frame (the dial as it was) until the plain dial is drawn.
    shown.value = undefined;
    void nextTick(() => {
      if (switchAnims === anims) stopSwitch();
    });
  };
  anims.forEach((a) => a.addEventListener('finish', done));
}

/**
 * The level copy is drawn (the quick look, and every frame of its switch in and out). The dial's own label waits for it: the copy
 * carries the level the whole way, so the label only comes back once the copy has landed on the dial and is gone.
 */
const levelCopyOn = computed(() => shown.value !== undefined && props.level !== undefined);
/**
 * The label is handing over to / from the level copy in this render: the level switches without its fade (the copy sits right on
 * it). Any other label (`#place`, a countdown) that arrives as the copy lands keeps its fade.
 */
let labelHandoff = false;
watch(levelCopyOn, () => {
  labelHandoff = true;
  void nextTick(() => {
    labelHandoff = false;
  });
});
function fadeLabel(el: Element, direction: 'in' | 'out', done: () => void) {
  if (!props.labelFade || (labelHandoff && el.textContent?.trim() === String(props.level))) return done();
  props.labelFade(el, direction, done);
}

watch(
  () => props.glyph,
  async (next, prev) => {
    if (next === undefined) {
      if (prev === undefined || shown.value === undefined) return;
      if (prefersReducedMotion()) {
        stopSwitch();
        shown.value = undefined;
        return;
      }
      if (switchDir === 'in') {
        // Reverse from where it is.
        switchAnims.forEach((a) => a.reverse());
        switchDir = 'out';
      } else playSwitch('out');
      return;
    }
    if (prev === undefined) {
      // On or back from a switch-out in progress.
      if (switchDir === 'out' && next === shown.value) {
        switchAnims.forEach((a) => a.reverse());
        switchDir = 'in';
        return;
      }
      stopSwitch();
      shown.value = next;
      if (prefersReducedMotion() || props.level === undefined) return;
      await nextTick();
      playSwitch('in');
      return;
    }
    // up <-> wait: just swap.
    stopSwitch();
    shown.value = next;
  },
);

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

// While the blocked-upgrade refusal plays, the ring is red whatever the upgrade state says (a full queue blocks a building whose
// ring is green): the refusal reads as one red signal, the same red as its flash and shockwaves.
const trackColor = computed(() => (blockedFrame.value !== null ? RED : RING_COLOR[props.ring]));
const trackOpacity = computed(() => (blockedFrame.value !== null ? 1 : props.ring === 'upgrading' ? 0.3 : props.ring === 'none' ? 0.2 : 1));
const labelColor = computed(() => (props.urgent ? YELLOW : props.ring === 'max' ? GOLD : '#fff'));

// ---- the order dial's frames ----------------------------------------------------------------------------------------------
// `now` only moves while a frame-by-frame animation plays (pending sweep, refusal, finish); a running order's end schedules
// one refresh so its finish starts on time.

const now = ref(Date.now());
const phase = computed(() => (props.order ? dialPhase(props.order, now.value, prefersReducedMotion()) : null));
const blockedFrame = computed(() =>
  props.blockedAtMs === undefined ? null : dialRejectFrame(now.value - props.blockedAtMs, prefersReducedMotion(), BLOCKED_DIAL_OPTIONS),
);
// A new hit starts the animation over from the moment it came in.
watch(
  () => props.blockedAtMs,
  () => (now.value = Date.now()),
);
const animated = computed(() => {
  const p = phase.value;
  if (blockedFrame.value !== null) return true;
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
  stopSwitch();
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

/** The blocked-upgrade animation over the plain dial: the shake and pop of the marker, the red flash and the shockwaves. */
const blocked = computed(() => {
  const frame = blockedFrame.value;
  if (!frame) return null;
  const { c, hexAt } = geometry.value;
  const r = props.radius;
  return {
    transform: `translate(${frame.offsetX.toFixed(2)} 0) translate(${c} ${c}) scale(${frame.scale.toFixed(3)}) translate(${-c} ${-c})`,
    flash: hexAt(r),
    flashOpacity: 0.7 * frame.flash,
    rings: frame.rings.filter((ring) => ring.alpha > 0).map((ring) => ({ points: hexAt(r * ring.scale), opacity: ring.alpha })),
    ringWidth: 3 * geometry.value.unit,
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
    ref="svgEl"
    :data-refused="blocked ? '' : undefined"
  >
    <g v-if="burst" class="hud-dial__burst" :transform="`translate(${burst.shake.toFixed(2)} 0)`">
      <polygon v-for="(ring, i) in burst.rings" :key="i" :points="ring.points" fill="none" :stroke="burst.color" :stroke-opacity="ring.opacity" :stroke-width="burst.ringWidth" stroke-linejoin="round" />
      <polygon :points="burst.body" :fill="DARK" :fill-opacity="burst.bodyOpacity" />
      <polygon :points="burst.body" :fill="burst.color" :fill-opacity="burst.flashOpacity" />
      <polygon :points="burst.body" fill="none" :stroke="burst.color" :stroke-opacity="burst.edgeOpacity" :stroke-width="burst.edgeWidth" stroke-linejoin="round" />
      <polyline v-for="(mark, i) in burst.marks" :key="`m${i}`" :points="mark" fill="none" stroke="#fff" :stroke-opacity="burst.edgeOpacity" :stroke-width="burst.markWidth" stroke-linecap="round" stroke-linejoin="round" />
    </g>
    <g v-else :transform="blocked?.transform">
      <polygon v-for="(ring, i) in blocked?.rings ?? []" :key="`b${i}`" :points="ring.points" fill="none" :stroke="RED" :stroke-opacity="ring.opacity" :stroke-width="blocked!.ringWidth" stroke-linejoin="round" />
      <polygon class="hud-dial__body" :points="geometry.hex" :fill="shown === 'up' ? GOLD : DARK_FILL" />
      <polygon :points="geometry.hex" fill="none" :stroke="trackColor" :stroke-opacity="trackOpacity" :stroke-width="geometry.sw" stroke-linejoin="round" />
      <path v-if="arcShown" :ref="setArcEl" class="hud-dial__arc" :d="geometry.outline" pathLength="1" stroke-dasharray="1 1" :stroke-dashoffset="arcOffset" fill="none" :stroke="YELLOW" :stroke-width="geometry.sw" stroke-linecap="round" stroke-linejoin="round" />
      <template v-if="pending">
        <polyline v-for="(segment, i) in pending.segments" :key="i" class="hud-dial__sweep" :points="segment" fill="none" :stroke="YELLOW" :stroke-width="pending.width" stroke-linecap="round" stroke-linejoin="round" />
        <template v-if="labelVisible">
          <circle v-for="(dot, i) in pending.dots" :key="`d${i}`" class="hud-dial__dot" :cx="dot.x" :cy="dot.y" :r="dot.r" fill="#fff" :fill-opacity="dot.opacity" />
        </template>
      </template>
      <polygon v-if="blocked" class="hud-dial__flash" :points="blocked.flash" :fill="RED" :fill-opacity="blocked.flashOpacity" />
      <g v-if="shown === 'up'" class="hud-dial__glyph hud-dial__glyph--up">
        <polyline v-for="(chevron, i) in glyphMarks.chevrons" :key="i" :points="chevron" fill="none" :stroke="DARK" :stroke-width="glyphMarks.width" stroke-linecap="round" stroke-linejoin="round" />
      </g>
      <g v-else-if="shown === 'wait'" class="hud-dial__glyph hud-dial__glyph--wait">
        <circle :cx="geometry.c" :cy="geometry.c" :r="glyphMarks.clockRadius" fill="none" stroke="#fff" :stroke-width="glyphMarks.width" />
        <polyline :points="glyphMarks.hands" fill="none" stroke="#fff" :stroke-width="glyphMarks.width" stroke-linecap="round" stroke-linejoin="round" />
      </g>
      <Transition :css="false" @enter="(el, done) => fadeLabel(el, 'in', done)" @leave="(el, done) => fadeLabel(el, 'out', done)">
        <text
          v-if="label && !levelCopyOn"
          class="hud-dial__label"
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
      <!-- The level hex of the quick look: the dial's copy, at rest at the lower right corner point. -->
      <g v-if="levelCopyOn" class="hud-dial__level" :style="{ transform: cornerCopy, transformOrigin: `${geometry.c}px ${geometry.c}px`, transformBox: 'view-box' }">
        <polygon :points="geometry.hex" :fill="DARK_FILL" />
        <polygon :points="geometry.hex" fill="none" :stroke="RING_COLOR[ring]" :stroke-width="geometry.sw" stroke-linejoin="round" />
        <text
          class="hud-dial__level-text"
          :x="geometry.c"
          :y="geometry.c"
          dy="0.36em"
          text-anchor="middle"
          font-family="Barlow, sans-serif"
          font-weight="700"
          :style="{ fontSize: `${cornerFont}px`, paintOrder: 'stroke' }"
          fill="#fff"
          stroke="rgba(0,0,0,.6)"
          stroke-width="1.5"
        >
          {{ level }}
        </text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.hud-dial {
  display: block;
}
</style>
