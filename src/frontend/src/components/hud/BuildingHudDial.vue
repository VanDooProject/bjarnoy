<script setup lang="ts">
// The pointy-top hex dial of a building marker: level (or the countdown of a running upgrade) inside, ring colour = upgrade
// state, a yellow arc from the top vertex = elapsed fraction (like the Pixi construction dial, lib/map/constructionDial.ts).
import { computed } from 'vue';
import type { HudRing } from '../../lib/hud/buildingHud';

const props = defineProps<{
  radius: number;
  ring: HudRing;
  /** Elapsed fraction of a running upgrade. */
  progress?: number;
  /** What sits inside: the level, or the time left; empty = the ring only. */
  label?: string;
  /** The label is a countdown (smaller font on near/mid, where it replaces the level). */
  time?: boolean;
  /** Fades the number in / out when it appears or goes away (far <-> dial); null = it just switches. */
  labelFade?: ((el: Element, direction: 'in' | 'out', done: () => void) => void) | null;
}>();

const RING_COLOR: Record<HudRing, string> = { ready: '#5fd08a', blocked: '#e2705f', upgrading: '#fff', max: '#ffd23f' };
const GOLD = '#ffc55c';

const geometry = computed(() => {
  const r = props.radius;
  const sw = (6 * r) / 27.5;
  const pad = sw / 2 + 1;
  const c = r + pad;
  const vertex = (i: number, rr: number) => {
    const a = ((-90 + 60 * i) * Math.PI) / 180;
    return [c + rr * Math.cos(a), c + rr * Math.sin(a)] as const;
  };
  const hex = [0, 1, 2, 3, 4, 5].map((i) => vertex(i, r));
  const fmt = (pts: readonly (readonly number[])[]) => pts.map((p) => `${p[0]!.toFixed(2)},${p[1]!.toFixed(2)}`).join(' ');
  // The arc runs clockwise from the top vertex along the hex edges, `progress` of the way round.
  let arc = '';
  const progress = props.ring === 'upgrading' ? (props.progress ?? 0) : 0;
  if (progress > 0) {
    let rem = Math.min(1, progress) * 6;
    const out: (readonly number[])[] = [hex[0]!];
    for (let i = 0; i < 6 && rem > 1e-6; i++) {
      const a = hex[i]!;
      const b = hex[(i + 1) % 6]!;
      const t = Math.min(1, rem);
      out.push([a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t]);
      rem -= t;
    }
    arc = fmt(out);
  }
  const font = props.time ? (14.4 * r) / 27.5 : 13 + (r - 14) * 0.5;
  return { sw, size: 2 * c, c, hex: fmt(hex), arc, font };
});

const trackColor = computed(() => RING_COLOR[props.ring]);
const trackOpacity = computed(() => (props.ring === 'upgrading' ? 0.3 : 1));
const labelColor = computed(() => (props.ring === 'max' ? GOLD : '#fff'));
</script>

<template>
  <svg class="hud-dial" :width="geometry.size" :height="geometry.size" :viewBox="`0 0 ${geometry.size} ${geometry.size}`" aria-hidden="true">
    <polygon :points="geometry.hex" fill="#0b1720" />
    <polygon :points="geometry.hex" fill="none" :stroke="trackColor" :stroke-opacity="trackOpacity" :stroke-width="geometry.sw" stroke-linejoin="round" />
    <polyline v-if="geometry.arc" :points="geometry.arc" fill="none" stroke="#ffd23f" :stroke-width="geometry.sw" stroke-linecap="round" stroke-linejoin="round" />
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
  </svg>
</template>

<style scoped>
.hud-dial {
  display: block;
}
</style>
