<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, watchPostEffect } from 'vue';
import { introText, type IntroLocale } from './introText';
import type { IntroState } from './sequencer';
import { chapterIndexAt, fmtTime, rowFraction, seekLimitMs, type LoadRow, type Timeline } from './timeline';

/**
 * The intro's control row: play/pause, the timeline with one segment per chapter, the time and the speaker with its
 * volume range. The host (LandingIntro) owns all state; this reports what the player did.
 */
const props = defineProps<{
  timeline: Timeline;
  state: IntroState;
  /** the run's position in ms (the sequencer's clock) */
  getPosition: () => number;
  locale: IntroLocale;
  /** the player paused the run (not a drag in progress) */
  paused: boolean;
  /** landing, tiles not loaded: the landfall is locked */
  gated: boolean;
  /** the landing exit runs: no seeking */
  locked: boolean;
  /** 0..1, mean of the gating groups; fills the locked landfall */
  loadFraction: number;
  /** the load groups to list while the bar is open; empty: nothing to show */
  loadRows: LoadRow[];
  sound: boolean;
  /** 0..100 */
  volume: number;
  reducedMotion: boolean;
}>();
const emit = defineEmits<{
  seek: [ms: number];
  'drag-start': [];
  'drag-end': [];
  'toggle-pause': [];
  sound: [];
  volume: [value: number];
  'detail-open': [open: boolean];
}>();

const NARROW_PX = 360;
const KEY_STEP_MS = 5000;
const PREVIOUS_CHAPTER_GRACE_MS = 1500;

const pos = ref(props.getPosition());
const sync = () => (pos.value = props.getPosition());
let frame = 0;
function loop(): void {
  sync();
  frame = requestAnimationFrame(loop);
}
// The playhead only needs frames while it moves.
const running = computed(() => !props.state.paused && !props.state.waiting && (props.state.phase === 'playing' || props.state.phase === 'exiting'));
watch(
  () => props.state,
  () => sync(),
);
watch(
  running,
  (go) => {
    cancelAnimationFrame(frame);
    if (go) frame = requestAnimationFrame(loop);
  },
  { immediate: true },
);
onBeforeUnmount(() => cancelAnimationFrame(frame));

const total = computed(() => props.timeline.totalMs);
const chapters = computed(() => props.timeline.chapters);
const currentIndex = computed(() => chapters.value.findIndex((c) => c.id === props.state.beat));
const name = (id: string) => introText(props.locale, `chapters.${id}`);
const limitMs = computed(() => seekLimitMs(props.timeline, props.gated));

// ---- geometry
const trackEl = ref<HTMLElement | null>(null);
const barEl = ref<HTMLElement | null>(null);
const trackWidth = ref(0);
const barWidth = ref(0);
let observer: ResizeObserver | undefined;
function measure(): void {
  trackWidth.value = trackEl.value?.offsetWidth ?? 0;
  barWidth.value = barEl.value?.clientWidth ?? 0;
}
onMounted(() => {
  measure();
  if (typeof ResizeObserver !== 'undefined' && barEl.value) {
    observer = new ResizeObserver(measure);
    observer.observe(barEl.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
const narrow = computed(() => barWidth.value > 0 && barWidth.value < NARROW_PX);
const px = (ms: number) => (total.value > 0 ? (ms / total.value) * trackWidth.value : 0);
const pct = (ms: number) => (total.value > 0 ? (ms / total.value) * 100 : 0);
const segStyle = (c: { startMs: number; durMs: number }) => ({ left: `calc(${pct(c.startMs)}% + 1.5px)`, width: `calc(${pct(c.durMs)}% - 3px)` });
const fillStyle = (c: { startMs: number; durMs: number }) => ({
  transform: `scaleX(${Math.min(1, Math.max(0, (pos.value - c.startMs) / c.durMs))})`,
});
const thumbStyle = computed(() => ({ transform: `translateX(${px(pos.value)}px)` }));

// the narrow bar names only the current chapter, centred over the playhead and kept inside the bar
const oneEl = ref<HTMLElement | null>(null);
const oneWidth = ref(0);
watchPostEffect(() => {
  void currentIndex.value;
  void props.locale;
  oneWidth.value = oneEl.value?.offsetWidth ?? 0;
});
const oneStyle = computed(() => {
  const x = px(pos.value) - oneWidth.value / 2;
  return { left: `${Math.max(0, Math.min(barWidth.value - oneWidth.value, x))}px` };
});

// ---- expanded: hover on the timeline, keyboard focus, a drag or a pause
const hover = ref(false);
const focus = ref(false);
const dragging = ref(false);
const expanded = computed(() => !props.locked && (hover.value || focus.value || dragging.value || props.paused));
// the rows stay (faded out) when the last group finishes while the bar is open
const shownRows = ref<LoadRow[]>([]);
watch(
  () => props.loadRows,
  (rows) => {
    if (rows.length > 0) shownRows.value = rows;
  },
  { immediate: true },
);
const showDetail = computed(() => expanded.value && props.loadRows.length > 0);
watch(showDetail, (open) => emit('detail-open', open), { immediate: true });

// ---- seeking
const hitEl = ref<HTMLElement | null>(null);
function msFromX(x: number): number {
  const r = trackEl.value?.getBoundingClientRect();
  if (!r || r.width === 0) return 0;
  return ((x - r.left) / r.width) * total.value;
}
function onPointerDown(e: PointerEvent): void {
  if (props.locked) return;
  hitEl.value?.setPointerCapture?.(e.pointerId);
  dragging.value = true;
  tipMs.value = null;
  emit('drag-start');
  emit('seek', msFromX(e.clientX));
  e.preventDefault();
}
function onPointerMove(e: PointerEvent): void {
  if (dragging.value) emit('seek', msFromX(e.clientX));
}
function endDrag(): void {
  if (!dragging.value) return;
  dragging.value = false;
  emit('drag-end');
}
function onKeydown(e: KeyboardEvent): void {
  if (props.locked || e.altKey || e.ctrlKey || e.metaKey) return;
  const at = props.getPosition();
  const i = Math.max(0, currentIndex.value);
  const c = chapters.value[i];
  let target: number | undefined;
  switch (e.key) {
    case 'ArrowRight':
      target = at + KEY_STEP_MS;
      break;
    case 'ArrowLeft':
      target = at - KEY_STEP_MS;
      break;
    case 'PageDown':
      target = chapters.value[Math.min(chapters.value.length - 1, i + 1)].startMs;
      break;
    case 'PageUp':
      target = at - c.startMs > PREVIOUS_CHAPTER_GRACE_MS || i === 0 ? c.startMs : chapters.value[i - 1].startMs;
      break;
    case 'Home':
      target = 0;
      break;
    case 'End':
      target = limitMs.value;
      break;
  }
  if (target === undefined) return;
  e.preventDefault();
  emit('seek', target);
}

// the position while dragging
const tipMs = ref<number | null>(null);
watch(
  () => [dragging.value, pos.value] as const,
  ([drag, at]) => (tipMs.value = drag ? at : null),
);
const tipText = computed(() => {
  const ms = Math.max(0, Math.min(total.value, tipMs.value ?? 0));
  return `${name(chapters.value[chapterIndexAt(props.timeline, ms)].id)} · ${fmtTime(ms)}`;
});
const tipStyle = computed(() => ({ left: `${Math.min(85, Math.max(15, pct(tipMs.value ?? 0)))}%` }));

const valueText = computed(() =>
  introText(props.locale, 'timelineValue')
    .replace('{chapter}', name(props.state.beat))
    .replace('{time}', fmtTime(pos.value))
    .replace('{total}', fmtTime(total.value)),
);

// ---- load
const landfall = computed(() => chapters.value.find((c) => c.role === 'exit'));
const bufferStyle = computed(() => ({ transform: `scaleX(${props.gated ? props.loadFraction : 0})` }));
const stackStyle = computed(() => ({
  right: '1.5px',
  width: `max(calc(${pct(landfall.value?.durMs ?? 0)}% - 3px), 64px)`,
}));

// ---- volume
const shownVolume = computed(() => (props.sound ? props.volume : 0));
const level = computed(() => (shownVolume.value === 0 ? 0 : shownVolume.value < 50 ? 1 : 2));
const soundLabel = computed(() => introText(props.locale, props.sound ? 'soundOff' : 'soundOn'));
const volumeOpen = ref(false);
const trackVolEl = ref<HTMLElement | null>(null);
function volumeFromY(y: number): number {
  const r = trackVolEl.value?.getBoundingClientRect();
  if (!r || r.height === 0) return props.volume;
  return Math.round(Math.max(0, Math.min(1, (r.bottom - y) / r.height)) * 100);
}
function onVolumeDown(e: PointerEvent): void {
  (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  volumeOpen.value = true;
  emit('volume', volumeFromY(e.clientY));
  e.preventDefault();
}
function onVolumeMove(e: PointerEvent): void {
  if (volumeOpen.value) emit('volume', volumeFromY(e.clientY));
}
function onVolumeKey(e: KeyboardEvent): void {
  const steps: Record<string, number> = { ArrowUp: 10, ArrowRight: 10, ArrowDown: -10, ArrowLeft: -10, PageUp: 25, PageDown: -25 };
  let v: number;
  if (e.key === 'Home') v = 0;
  else if (e.key === 'End') v = 100;
  else if (e.key in steps) v = Math.max(0, Math.min(100, shownVolume.value + steps[e.key]));
  else return;
  e.preventDefault();
  emit('volume', v);
}
</script>

<template>
  <div class="ctrl" :class="{ 'is-still': reducedMotion }" data-testid="intro-controls">
    <button
      type="button"
      class="bico"
      :aria-label="introText(locale, paused ? 'resume' : 'pause')"
      :aria-pressed="paused"
      data-testid="intro-pause"
      @click="emit('toggle-pause')"
    >
      <svg v-if="paused" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor" /></svg>
      <svg v-else viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
        <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
      </svg>
    </button>

    <div
      ref="barEl"
      class="bar"
      :class="{ expanded, narrow, locked }"
      @pointerenter="hover = true"
      @pointerleave="hover = false"
    >
      <div ref="trackEl" class="track">
        <div
          v-for="c in chapters"
          :key="c.id"
          class="sg"
          :class="{ lockd: gated && c.role === 'exit', waiting: state.waiting && c.role === 'hold' }"
          :data-chapter="c.id"
          :style="segStyle(c)"
        >
          <div v-if="c.role === 'exit'" class="bufl" :style="bufferStyle"></div>
          <div class="fill" :style="fillStyle(c)"></div>
        </div>
      </div>

      <div class="clabels" aria-hidden="true">
        <span
          v-for="(c, i) in chapters"
          :key="c.id"
          class="clabel"
          :class="{ cur: i === currentIndex }"
          :style="segStyle(c)"
        >{{ name(c.id) }}</span>
        <span v-if="currentIndex >= 0" ref="oneEl" class="clabel cur one" :style="oneStyle">{{ name(state.beat) }}</span>
      </div>

      <div class="thumb" :class="{ hidden: state.waiting }" :style="thumbStyle"></div>
      <div class="spinwrap" :style="thumbStyle"><div class="spin" :class="{ show: state.waiting }"></div></div>
      <div class="tip" :class="{ show: tipMs !== null }" :style="tipStyle" aria-hidden="true">{{ tipText }}</div>

      <div v-if="shownRows.length > 0" class="stack" :class="{ show: showDetail }" :style="stackStyle" aria-hidden="true" data-testid="intro-load-detail">
        <div v-for="row in shownRows" :key="row.id" class="srow" :class="{ anim: !row.gating, done: row.total > 0 && row.loaded >= row.total }" :data-group="row.id">
          <span class="nm">{{ introText(locale, `loadGroups.${row.id}`) }}</span>
          <span class="lb"><i :style="{ transform: `scaleX(${rowFraction(row)})` }"></i></span>
          <span class="ct">{{ row.loaded }}/{{ row.total > 0 ? row.total : '?' }}</span>
        </div>
      </div>

      <div
        ref="hitEl"
        class="hit"
        role="slider"
        tabindex="0"
        :aria-label="introText(locale, 'timeline')"
        :aria-valuemin="0"
        :aria-valuemax="Math.round(limitMs / 1000)"
        :aria-valuenow="Math.round(pos / 1000)"
        :aria-valuetext="valueText"
        :aria-disabled="locked"
        data-testid="intro-timeline"
        @focus="focus = true"
        @blur="focus = false"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @keydown="onKeydown"
      ></div>
    </div>

    <span class="itime" data-testid="intro-time">{{ fmtTime(pos) }} / {{ fmtTime(total) }}</span>

    <div class="vol" :class="{ open: volumeOpen }">
      <div class="vpop">
        <div
          class="vslider"
          role="slider"
          tabindex="0"
          aria-orientation="vertical"
          :aria-label="introText(locale, 'volume')"
          :aria-valuemin="0"
          :aria-valuemax="100"
          :aria-valuenow="shownVolume"
          data-testid="intro-volume"
          @pointerdown="onVolumeDown"
          @pointermove="onVolumeMove"
          @pointerup="volumeOpen = false"
          @pointercancel="volumeOpen = false"
          @keydown="onVolumeKey"
        >
          <div ref="trackVolEl" class="vtrack"><div class="vfill" :style="{ transform: `scaleY(${shownVolume / 100})` }"></div></div>
          <div class="vknob" :style="{ bottom: `calc(10px + ${shownVolume / 100} * (100% - 20px))` }"></div>
        </div>
      </div>
      <button
        type="button"
        class="bico sound"
        :class="{ 'is-muted': !sound, 'is-still': reducedMotion }"
        :aria-label="soundLabel"
        :aria-pressed="sound"
        data-testid="intro-sound"
        :data-sound="sound ? 'on' : 'off'"
        :data-level="level"
        @click="emit('sound')"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" />
          <path v-if="level === 0" d="M16 9.5l5 5M21 9.5l-5 5" />
          <template v-else>
            <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
            <path v-if="level === 2" d="M18 7a7 7 0 0 1 0 10" />
          </template>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ctrl {
  --i-fg: #f4f1ea;
  --i-dim: rgba(244, 241, 234, 0.28);
  --i-mid: rgba(244, 241, 234, 0.55);
  --i-load: #9fc4cf;
  --i-anim: #8a9aa3;
  position: absolute;
  left: max(16px, env(safe-area-inset-left));
  right: max(16px, env(safe-area-inset-right));
  bottom: max(16px, env(safe-area-inset-bottom));
  height: 44px;
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--i-fg);
}
.bico {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--i-fg);
  cursor: pointer;
  padding: 0;
}
.bico:hover {
  background: rgba(244, 241, 234, 0.1);
}
.bico:focus-visible {
  outline: 2px solid var(--i-fg);
  outline-offset: 0;
}
.itime {
  flex: none;
  font-size: 0.75rem;
  color: var(--i-mid);
  font-variant-numeric: tabular-nums;
  padding: 0 4px;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
}

/* ---- the timeline */
.bar {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 44px;
}
.hit {
  position: absolute;
  inset: 0;
  cursor: pointer;
  touch-action: none;
  outline: none;
}
.hit:focus-visible {
  box-shadow: 0 0 0 2px var(--i-fg);
  border-radius: 6px;
}
.bar.locked .hit {
  cursor: not-allowed;
}
.track {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 3px;
  translate: 0 -50%;
  pointer-events: none;
  transition: height 160ms ease, opacity 400ms ease;
}
.bar.expanded .track {
  height: 8px;
}
.bar.locked .track {
  opacity: 0.45;
}
.sg {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--i-dim);
  border-radius: 2px;
  overflow: hidden;
}
.bar.expanded .sg {
  border-radius: 3px;
}
.fill {
  position: absolute;
  inset: 0;
  background: var(--i-fg);
  transform-origin: left;
  transform: scaleX(0);
}
/* the tiles are not loaded: the landfall is locked, a moving hatch says so */
.sg.lockd {
  background: rgba(244, 241, 234, 0.06);
}
.sg.lockd::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -12px;
  right: -12px;
  background: repeating-linear-gradient(-45deg, rgba(244, 241, 234, 0.34) 0 3px, transparent 3px 6px);
  animation: hatch 0.9s linear infinite;
}
.bufl {
  position: absolute;
  inset: 0;
  background: rgba(159, 196, 207, 0.7);
  transform-origin: left;
  transform: scaleX(0);
}
/* the hold is parked at its end, the loop keeps running */
.sg.waiting .fill {
  background: linear-gradient(90deg, rgba(159, 196, 207, 0.15), rgba(159, 196, 207, 0.55), rgba(159, 196, 207, 0.15));
  background-size: 200% 100%;
  background-color: rgba(159, 196, 207, 0.35);
  animation: shimmer 1.6s linear infinite;
}
.thumb {
  position: absolute;
  top: 50%;
  left: 0;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  translate: 0 -50%;
  border-radius: 50%;
  background: var(--i-fg);
  box-shadow: 0 0 0 3px rgba(11, 17, 22, 0.5);
  pointer-events: none;
  transition: width 160ms ease, height 160ms ease, margin-left 160ms ease;
}
.thumb.hidden {
  opacity: 0;
}
.bar.expanded .thumb {
  width: 16px;
  height: 16px;
  margin-left: -8px;
}
.spinwrap {
  position: absolute;
  top: 50%;
  left: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.spin {
  position: absolute;
  left: -9px;
  top: -9px;
  width: 18px;
  height: 18px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 2.5px solid rgba(244, 241, 234, 0.22);
  border-top-color: var(--i-fg);
  border-right-color: var(--i-fg);
  background: rgba(11, 17, 22, 0.6);
  opacity: 0;
  transition: opacity 200ms ease;
  animation: spin 0.8s linear infinite;
}
.spin.show {
  opacity: 1;
}
.clabels {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(50% + 9px);
  height: 16px;
  pointer-events: none;
}
.clabel {
  position: absolute;
  bottom: 0;
  font-size: 0.7rem;
  line-height: 16px;
  color: var(--i-mid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 160ms ease, transform 160ms ease;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
}
.clabel.cur {
  color: var(--i-fg);
  font-weight: 600;
}
.bar.expanded .clabel {
  opacity: 1;
  transform: none;
}
/* a narrow bar names only the current chapter, in full, over the playhead */
.clabel.one {
  display: none;
  width: auto;
  overflow: visible;
}
.bar.narrow .clabel:not(.one) {
  display: none;
}
.bar.narrow .clabel.one {
  display: block;
}
.tip {
  position: absolute;
  bottom: 50px;
  translate: -50% 0;
  white-space: nowrap;
  font-size: 0.75rem;
  padding: 3px 8px;
  border-radius: 5px;
  background: rgba(11, 17, 22, 0.85);
  border: 1px solid var(--i-dim);
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms ease;
  font-variant-numeric: tabular-nums;
}
.tip.show {
  opacity: 1;
}

/* ---- what is still loading, over the landfall */
.stack {
  position: absolute;
  bottom: calc(50% + 30px);
  display: grid;
  gap: 4px;
  padding: 6px 0;
  pointer-events: none;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 160ms ease, transform 160ms ease;
}
.stack.show {
  opacity: 1;
  transform: none;
}
.srow {
  position: relative;
  height: 11px;
  display: flex;
  align-items: center;
}
.lb {
  position: relative;
  flex: 1;
  height: 4px;
  background: rgba(159, 196, 207, 0.18);
  border-radius: 2px;
  overflow: hidden;
}
.lb i {
  position: absolute;
  inset: 0;
  background: var(--i-load);
  transform-origin: left;
  transform: scaleX(0);
}
.srow.anim .lb i {
  background: var(--i-anim);
}
.nm,
.ct {
  position: absolute;
  font-size: 0.68rem;
  line-height: 11px;
  color: var(--i-mid);
  white-space: nowrap;
}
.nm {
  right: calc(100% + 6px);
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.ct {
  left: calc(100% + 6px);
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.srow.done .nm,
.srow.done .ct {
  color: var(--i-fg);
}

/* ---- speaker and volume: the range opens upward, joined to the button */
.vol {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
}
.vpop {
  position: absolute;
  left: 50%;
  bottom: 100%;
  width: 40px;
  height: 128px;
  translate: -50% 0;
  padding: 10px 0 6px;
  box-sizing: border-box;
  border-radius: 10px 10px 0 0;
  background: rgba(11, 17, 22, 0.86);
  opacity: 0;
  transform: scaleY(0.6);
  transform-origin: bottom;
  pointer-events: none;
  transition: opacity 140ms ease, transform 140ms ease;
  z-index: 3;
}
.vol:hover .vpop,
.vol:focus-within .vpop,
.vol.open .vpop {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}
.vol:hover .bico,
.vol:focus-within .bico {
  background: rgba(11, 17, 22, 0.86);
  border-radius: 0 0 8px 8px;
}
.vslider {
  position: relative;
  height: 100%;
  cursor: pointer;
  touch-action: none;
  outline: none;
}
.vslider:focus-visible {
  box-shadow: inset 0 0 0 2px var(--i-fg);
  border-radius: 6px;
}
.vtrack {
  position: absolute;
  left: 50%;
  top: 10px;
  bottom: 10px;
  width: 4px;
  translate: -50% 0;
  border-radius: 2px;
  background: rgba(244, 241, 234, 0.22);
  overflow: hidden;
}
.vfill {
  position: absolute;
  inset: 0;
  background: var(--i-fg);
  transform-origin: bottom;
  transform: scaleY(0);
}
.vknob {
  position: absolute;
  left: 50%;
  width: 12px;
  height: 12px;
  translate: -50% 50%;
  border-radius: 50%;
  background: var(--i-fg);
  pointer-events: none;
}
/* the sound is off (the browser starts it so): the button draws the eye until it is turned on */
.bico.sound.is-muted {
  border-color: #f4f1ea;
  box-shadow: 0 0 0 2px rgba(244, 241, 234, 0.45);
}
.bico.sound.is-muted:not(.is-still) {
  animation: intro-sound-blink 1200ms ease-in-out infinite;
}

/* reduced motion: nothing moves in the bar (a static hatch, a static arc) */
.is-still,
.is-still *,
.is-still ::before {
  transition: none !important;
}
.is-still .sg.lockd::before,
.is-still .spin,
.is-still .sg.waiting .fill {
  animation: none;
}

@keyframes hatch {
  to {
    transform: translateX(8.485px);
  }
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -100% 0;
  }
}
@keyframes intro-sound-blink {
  0%,
  100% {
    border-color: rgba(244, 241, 234, 0.6);
    box-shadow: 0 0 0 0 rgba(244, 241, 234, 0);
  }
  50% {
    border-color: #f4f1ea;
    box-shadow: 0 0 10px 3px rgba(244, 241, 234, 0.6);
  }
}
</style>
