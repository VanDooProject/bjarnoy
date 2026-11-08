<script lang="ts">
import type { BeatMeta } from './types';
export const meta: BeatMeta = { id: 'prophecy', role: 'intro', durationMs: 7000 };
</script>

<script setup lang="ts">
import { inject } from 'vue';
import HallScene from './HallScene.vue';
import { meta as fireMeta } from './FireBeat.vue';
import { INTRO_BEAT_MS } from './types';

defineProps<{ paused?: boolean }>();
// the fire beat lasts as long as its clip in the player's language; the prophecy continues from its end
const beatMs = inject(INTRO_BEAT_MS, () => fireMeta.durationMs);
const fireMs = beatMs('fire');

// One flame, reused on each burning hall: [outer, inner].
const FLAME = [
  'M-22 0 C -26 -22, -10 -30, -8 -52 C 0 -36, 6 -40, 6 -58 C 20 -40, 26 -22, 22 0 Z',
  'M-12 0 C -14 -14, -4 -20, -2 -34 C 6 -22, 14 -16, 12 0 Z',
];
// Halls catch fire one after another: [x, y on the roof, flicker period ms, class].
const HALL_FIRES: [number, number, number, string][] = [
  [790, 610.6, 420, 'hf1'],
  [980, 556.8, 360, 'hf2'],
  [1034, 569, 480, 'hf3'],
];

const SKYLINE =
  'M618 714 C 626.3 708.3, 651.0 692.3, 668 680 C 685.0 667.7, 704.7 651.0, 720 640 C 735.3 629.0, 749.2 619.7, 760 614 ' +
  'C 770.8 608.3, 775.8 607.5, 785 606 C 794.2 604.5, 806.2 604.0, 815 605 C 823.8 606.0, 829.5 608.2, 838 612 ' +
  'C 846.5 615.8, 857.0 626.3, 866 628 C 875.0 629.7, 883.3 628.0, 892 622 C 900.7 616.0, 910.0 601.3, 918 592 ' +
  'C 926.0 582.7, 930.5 571.3, 940 566 C 949.5 560.7, 963.3 561.3, 975 560 C 986.7 558.7, 998.3 558.0, 1010 558 ' +
  'C 1021.7 558.0, 1034.7 557.3, 1045 560 C 1055.3 562.7, 1062.5 565.7, 1072 574 C 1081.5 582.3, 1091.3 596.3, 1102 610 ' +
  'C 1112.7 623.7, 1124.3 638.7, 1136 656 C 1147.7 673.3, 1166.0 704.3, 1172 714';
// The same skyline 20 units lower: a front band of land that buries the halls' feet in the slope.
const FRONT_BAND =
  'M618 734 C 626.3 728.3, 651.0 712.3, 668 700 C 685.0 687.7, 704.7 671.0, 720 660 C 735.3 649.0, 749.2 639.7, 760 634 ' +
  'C 770.8 628.3, 775.8 627.5, 785 626 C 794.2 624.5, 806.2 624.0, 815 625 C 823.8 626.0, 829.5 628.2, 838 632 ' +
  'C 846.5 635.8, 857.0 646.3, 866 648 C 875.0 649.7, 883.3 648.0, 892 642 C 900.7 636.0, 910.0 621.3, 918 612 ' +
  'C 926.0 602.7, 930.5 591.3, 940 586 C 949.5 580.7, 963.3 581.3, 975 580 C 986.7 578.7, 998.3 578.0, 1010 578 ' +
  'C 1021.7 578.0, 1034.7 577.3, 1045 580 C 1055.3 582.7, 1062.5 585.7, 1072 594 C 1081.5 602.3, 1091.3 616.3, 1102 630 ' +
  'C 1112.7 643.7, 1124.3 658.7, 1136 676 C 1147.7 693.3, 1166.0 724.3, 1172 734 L1172 760 L618 760 Z';
// Longhouses with roofs sweeping low and crossed gable boards: [hull, gable boards].
const HALLS: [string, string][] = [
  ['M768.0 634.6 L773.0 624.1 C 775.7 606.6, 787.2 604.6, 800 607.6 C 812.8 604.6, 824.3 606.6, 827.0 624.1 L832.0 634.6 Z', 'M774.4 608.6 l-8 -12 M774.4 608.6 l8 -12 M825.6 608.6 l-8 -12 M825.6 608.6 l8 -12'],
  ['M1013.0 589.0 L1018.0 579.9 C 1019.5 565.0, 1029.2 563.0, 1040 566.0 C 1050.8 563.0, 1060.5 565.0, 1062.0 579.9 L1067.0 589.0 Z', 'M1018.4 567.0 l-8 -12 M1018.4 567.0 l8 -12 M1061.6 567.0 l-8 -12 M1061.6 567.0 l8 -12'],
  ['M917.0 590.8 L922.0 576.8 C 928.8 552.8, 946.4 550.8, 966 553.8 C 985.6 550.8, 1003.2 552.8, 1010.0 576.8 L1015.0 590.8 Z', 'M926.8 554.8 l-8 -12 M926.8 554.8 l8 -12 M1005.2 554.8 l-8 -12 M1005.2 554.8 l8 -12'],
];
let wave = 'M500 728';
for (let i = 0; i < 22; i++) wave += i % 2 ? ' q20 8 40 0' : ' q20 -8 40 0';
wave += ' v4 q-20 8 -40 0 Z';
</script>

<template>
  <!-- the skald's fire flares and the prophecy shows in its smoke: the halls burn, the island sinks -->
  <HallScene beat="prophecy" :paused="paused" :elapsed-ms="fireMs">
    <template #defs="{ id }">
      <radialGradient :id="id('vis-g')" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#fff" />
        <stop offset=".6" stop-color="#fff" stop-opacity=".85" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="id('burn')" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#ff8a3d" stop-opacity=".55" />
        <stop offset="1" stop-color="#ff8a3d" stop-opacity="0" />
      </radialGradient>
      <!-- the region is the vision's ellipse and no more: a mask region is rastered whole -->
      <mask :id="id('vis')" maskUnits="userSpaceOnUse" x="545" y="400" width="700" height="520">
        <ellipse cx="895" cy="660" rx="340" ry="250" :fill="`url(#${id('vis-g')})`" />
      </mask>
      <clipPath :id="id('above-sea')"><rect x="400" y="300" width="1000" height="412" /></clipPath>
    </template>

    <template #vision="{ url }">
      <g class="vision" :mask="url('vis')">
        <g class="vis-in">
          <ellipse class="burn" cx="900" cy="600" rx="300" ry="170" :fill="url('burn')" />
          <g :clip-path="url('above-sea')">
            <g class="island">
              <path :d="`${SKYLINE} L1172 760 L618 760 Z`" fill="#24100a" />
              <path :d="SKYLINE" fill="none" stroke="#b5562a" stroke-width="4" stroke-opacity=".8" />
              <g fill="#0b0403">
                <template v-for="(h, i) in HALLS" :key="i">
                  <path :d="h[0]" />
                  <path :d="h[1]" stroke="#0b0403" stroke-width="5" stroke-linecap="round" fill="none" />
                </template>
              </g>
              <path :d="FRONT_BAND" fill="#24100a" />
              <path d="M640 714 C 700 690, 760 676, 820 672 C 900 668, 980 680, 1060 690 C 1110 696, 1150 704, 1172 714 Z" fill="#170905" />
              <g v-for="f in HALL_FIRES" :key="f[3]" class="hfire" :class="f[3]">
                <g :transform="`translate(${f[0]} ${f[1]})`">
                  <g class="hflick" :style="{ '--p': `${f[2]}ms` }">
                    <path :d="FLAME[0]" fill="#e8662a" />
                    <path :d="FLAME[1]" fill="#ffc35c" />
                  </g>
                </g>
              </g>
            </g>
          </g>
          <rect x="500" y="712" width="800" height="110" fill="#160b07" />
          <g class="waves" fill="#6a3318">
            <path d="M500 712 h880 v5 h-880 Z" />
            <path :d="wave" opacity=".55" />
          </g>
          <ellipse class="ripple" cx="895" cy="714" rx="170" ry="12" fill="none" stroke="#c46a32" stroke-width="5" />
        </g>
      </g>
    </template>
  </HallScene>
</template>

<style scoped>
.vis-in, .hfire, .hflick, .ripple, .island { transform-box: fill-box; }
.vis-in { transform-origin: 50% 80%; }
.hfire, .hflick { transform-origin: 50% 100%; }
.ripple { transform-origin: 50% 50%; }
.island { transform-origin: 50% 100%; }

.vision { animation: prophecy-vision var(--beat-duration) ease-in-out both; }
.vis-in { animation: prophecy-vis-in var(--beat-duration) cubic-bezier(0.3, 0.1, 0.4, 1) both; }
.island { animation: prophecy-sink var(--beat-duration) cubic-bezier(0.45, 0, 0.6, 1) both; }
.burn { animation: prophecy-burn var(--beat-duration) ease-out both; }
.hf1 { animation: prophecy-hf1 var(--beat-duration) ease-out both; }
.hf2 { animation: prophecy-hf2 var(--beat-duration) ease-out both; }
.hf3 { animation: prophecy-hf3 var(--beat-duration) ease-out both; }
.ripple { animation: prophecy-ripple var(--beat-duration) ease-out both; }
.waves { animation: prophecy-waves 2100ms linear infinite; }
.hflick { animation: prophecy-flick var(--p) ease-in-out infinite alternate; }

/* the vision forms in the smoke, holds, and fades as the island goes under */
@keyframes prophecy-vision { 0%, 4% { opacity: 0; } 22%, 84% { opacity: 1; } 100% { opacity: 0; } }
@keyframes prophecy-vis-in { from { transform: scale(0.94) translate(0, 14px); } to { transform: scale(1.03) translate(0, -6px); } }
/* the island tilts and sinks behind the fixed waterline (the clip) */
@keyframes prophecy-sink { 0%, 44% { transform: translate(0, 0) rotate(0deg); } 80%, 100% { transform: translate(0, 178px) rotate(2.5deg); } }
@keyframes prophecy-burn { 0%, 20% { opacity: 0; } 42% { opacity: 1; } 64% { opacity: 0.9; } 80%, 100% { opacity: 0; } }
/* the halls catch fire one after another */
@keyframes prophecy-hf1 { 0%, 20% { opacity: 0; transform: scale(0.1); } 30%, 100% { opacity: 1; transform: scale(1); } }
@keyframes prophecy-hf2 { 0%, 27% { opacity: 0; transform: scale(0.1); } 37%, 100% { opacity: 1; transform: scale(1); } }
@keyframes prophecy-hf3 { 0%, 33% { opacity: 0; transform: scale(0.1); } 43%, 100% { opacity: 1; transform: scale(1); } }
@keyframes prophecy-ripple { 0%, 58% { opacity: 0; transform: scale(0.3, 0.3); } 70% { opacity: 0.9; } 92%, 100% { opacity: 0; transform: scale(1.6, 1); } }
/* one wave length (80) per loop, so the strip never jumps */
@keyframes prophecy-waves { from { transform: translate(0, 0); } to { transform: translate(-80px, 0); } }
@keyframes prophecy-flick { 0% { transform: scale(1, 1); } 40% { transform: scale(0.9, 1.12); } 100% { transform: scale(1.06, 0.92); } }
</style>
