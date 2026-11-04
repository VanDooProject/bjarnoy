<script setup lang="ts">
import { sineLoop } from './sineLoop';

/**
 * One burning house on the homeland shore of the sending: a glow, five flame tongues and rising sparks.
 * The flames, glow and sparks loop on fixed periods; `index` offsets their phases per fire.
 */
defineProps<{ x: number; y: number; scale: number; index: number; glow: string }>();

const FLAMES: [number, number][] = [[-34, 0.7], [-17, 1], [0, 1.3], [16, 0.95], [32, 0.65]];
const SPARKS = [0, 1, 2, 3, 4, 5, 6];
const round = (n: number) => Math.round(n * 100) / 100;
</script>

<template>
  <ellipse class="sd-glow" :style="{ '--c': index }" :cx="x" :cy="y - 8" :rx="160 * scale" :ry="80 * scale" :fill="glow" />
  <g :transform="`translate(${x},${y}) scale(${scale})`">
    <g v-for="([dx, h], i) in FLAMES" :key="i" :transform="`translate(${dx},0)`">
      <g class="sd-flame" :style="{ '--h': h, ...sineLoop(9 + i * 1.7, index * 2 + i) }">
        <path d="M-12 0 C -14 -16, -5 -22, -4 -38 C 2 -26, 6 -30, 6 -42 C 14 -28, 15 -14, 12 0 Z" fill="#d2501f" />
        <path d="M-6 0 C -7 -9, -2 -14, -1 -22 C 4 -14, 8 -10, 6 0 Z" fill="#ffb54c" />
      </g>
    </g>
    <circle
      v-for="i in SPARKS"
      :key="`s${i}`"
      class="sd-spark"
      :style="{ '--x': `${(i - 3) * 7}px`, '--dx': `${round(Math.sin(i * 2.3 + 1.8) * 14)}px`, '--o': `${-Math.round((((i * 1.6) / 7 + index * 0.37) / 0.9) * 1000)}ms` }"
      :r="round(2 + (i % 3) * 0.6)"
      fill="#ffc66b"
    />
  </g>
</template>

<style scoped>
.sd-glow, .sd-flame, .sd-spark { transform-box: view-box; transform-origin: 0 0; }
/* sines from the design, as alternating ease-in-outs; flames stretch up as they narrow */
.sd-flame { animation: sd-flame var(--p) cubic-bezier(0.37, 0, 0.63, 1) var(--o) infinite alternate; }
@keyframes sd-flame {
  from { transform: scale(1.09, calc(var(--h) * 0.78)); }
  to { transform: scale(0.91, calc(var(--h) * 1.22)); }
}
.sd-glow { animation: sd-glow 300ms ease-in-out calc(var(--c) * -170ms) infinite alternate; }
@keyframes sd-glow { from { opacity: 0.62; } to { opacity: 0.95; } }
/* a spark rises 130 units over 1.78 s and fades in and out */
.sd-spark { animation: sd-spark-rise 1778ms linear var(--o) infinite, sd-spark-fade 1778ms ease-in-out var(--o) infinite; }
@keyframes sd-spark-rise {
  from { transform: translate(var(--x), 0); }
  to { transform: translate(calc(var(--x) + var(--dx)), -130px); }
}
@keyframes sd-spark-fade { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
</style>
