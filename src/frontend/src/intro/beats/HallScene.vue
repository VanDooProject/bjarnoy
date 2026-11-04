<script setup lang="ts">
import { computed, useId } from 'vue';

/**
 * The skald's hall, shared by the fire and prophecy beats: back wall, longfire,
 * the skald and the smoke column. The fire beat lights it from black; the
 * prophecy beat starts from that end state and adds its vision through the
 * `vision` slot, between the back and front smoke layers.
 *
 * Ambient loops (flames, embers, smoke) run on fixed periods, and `elapsedMs`
 * shifts them so the prophecy's copy of the hall continues where the fire
 * beat's copy left off and the crossfade between them shows no jump.
 */
const props = defineProps<{ beat: 'fire' | 'prophecy'; paused?: boolean; elapsedMs?: number }>();

const uid = useId().replace(/[^a-zA-Z0-9]/g, '-');
const id = (name: string) => `${uid}-${name}`;
const url = (name: string) => `url(#${id(name)})`;

const sceneStyle = computed(() => ({ '--hall-elapsed': `${props.elapsedMs ?? 0}ms` }));

// Flame tongues: [path, fill, flicker period ms, phase offset ms].
const TONGUES: [string, string, number, number][] = [
  ['M800 1132 C 790 1060, 830 1010, 842 940 C 860 1000, 880 1010, 878 960 C 900 1000, 930 960, 920 880 C 970 950, 990 1040, 982 1132 Z', '#c2401a', 600, 0],
  ['M826 1132 C 818 1070, 852 1040, 862 990 C 876 1030, 890 1024, 894 984 C 914 1020, 940 1000, 936 950 C 966 1010, 972 1070, 960 1132 Z', '#f07a2c', 450, -180],
  ['M852 1132 C 846 1090, 868 1070, 876 1036 C 886 1062, 898 1060, 902 1030 C 918 1060, 934 1086, 930 1132 Z', '#ffc35c', 360, -120],
  ['M868 1132 C 866 1110, 880 1098, 886 1080 C 894 1100, 912 1108, 912 1132 Z', '#fff0b8', 300, -240],
  ['M778 1132 C 776 1100, 796 1086, 798 1060 C 812 1086, 826 1100, 822 1132 Z', '#c2401a', 510, -300],
  ['M968 1132 C 966 1104, 984 1090, 988 1062 C 1004 1090, 1012 1108, 1008 1132 Z', '#c2401a', 420, -60],
];

// Embers: [cx, cy, r, sideways drift px, start ms, period ms].
const EMBERS: [number, number, number, number, number, number][] = [
  [870, 1080, 4, -60, 600, 2520], [900, 1070, 3, 40, 780, 2160], [925, 1060, 3.5, 90, 1020, 2880],
  [850, 1090, 2.5, -110, 1200, 2400], [890, 1050, 3, 10, 1440, 3120], [940, 1090, 2.5, 130, 1620, 2280],
  [860, 1060, 3.5, -30, 1860, 2700], [910, 1085, 2, 70, 2100, 1980], [880, 1075, 3, -80, 2340, 3000],
  [955, 1070, 2.5, 30, 2640, 2460], [835, 1080, 2, -140, 2820, 2760], [895, 1090, 4, 110, 3120, 2340],
];

// Smoke column: soft puffs bending towards the smoke hole, each swaying more the higher it is.
// [cx, cy, rx, ry, sway px, period ms, phase ms]
const PUFFS: [number, number, number, number, number, number, number][] = [
  [890, 1000, 62, 120, 5, 2520, 0],
  [882, 870, 100, 150, 12, 2760, -720],
  [864, 720, 165, 175, 22, 3000, -1440],
  [838, 560, 220, 185, 34, 3300, -2160],
  [808, 400, 270, 175, 46, 3600, -2880],
  [785, 240, 310, 165, 58, 3960, -3600],
];

const STONES: [number, number, number, number][] = [
  [770, 1146, 30, 15], [822, 1152, 32, 15], [880, 1155, 34, 15], [942, 1153, 32, 15], [1000, 1147, 30, 14],
];
const STONE_TOPS = [
  'M748 1141 q22 -10 44 0 q-22 -4 -44 0 Z', 'M800 1146 q22 -10 46 0 q-22 -4 -46 0 Z', 'M856 1149 q24 -10 48 0 q-24 -4 -48 0 Z',
  'M918 1147 q22 -10 46 0 q-22 -4 -46 0 Z', 'M978 1142 q20 -10 42 0 q-20 -4 -42 0 Z',
];
const PLANKS = [210, 330, 520, 640, 760, 880, 1000, 1120, 1290, 1410];

const SKALD =
  'M478 1112 C 470 1040, 486 962, 516 908 C 524 880, 530 846, 544 814 C 548 800, 552 792, 556 780 ' +
  'C 566 770, 590 768, 606 778 C 618 788, 622 804, 624 818 L 636 838 L 628 842 C 630 850, 632 856, 628 862 ' +
  'C 640 884, 636 916, 618 948 L 612 940 C 622 920, 626 902, 622 888 L 640 906 C 650 924, 654 942, 654 960 ' +
  'C 656 976, 660 990, 664 1000 C 690 998, 712 1002, 726 1016 C 734 1040, 734 1090, 732 1132 L 756 1142 ' +
  'L 756 1150 L 700 1150 C 698 1110, 698 1070, 692 1046 C 682 1052, 674 1066, 668 1100 L 660 1112 Z';
const ARM =
  'M 626 896 L 640 906 C 664 918, 684 930, 700 934 C 712 920, 724 904, 734 890 L 742 868 L 750 864 L 754 872 ' +
  'L 764 866 L 766 876 L 760 892 C 750 914, 730 946, 712 966 C 696 978, 672 970, 650 958 C 638 950, 628 930, 626 896 Z';
</script>

<template>
  <svg
    class="intro-beat hall"
    :class="[`is-${beat}`, { 'is-paused': paused }]"
    :style="sceneStyle"
    viewBox="0 0 1600 1600"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <defs>
      <path :id="id('skald')" :d="SKALD" />
      <path :id="id('arm')" :d="ARM" />
      <clipPath :id="id('skald-clip')"><use :href="`#${id('skald')}`" /></clipPath>
      <clipPath :id="id('arm-clip')"><use :href="`#${id('arm')}`" /></clipPath>
      <linearGradient :id="id('lit')" gradientUnits="userSpaceOnUse" x1="560" y1="0" x2="770" y2="0">
        <stop offset="0" stop-color="#7a3214" stop-opacity="0" />
        <stop offset="1" stop-color="#7a3214" stop-opacity=".6" />
      </linearGradient>
      <radialGradient :id="id('glow')" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#ffb764" stop-opacity=".62" />
        <stop offset=".22" stop-color="#f07a2c" stop-opacity=".34" />
        <stop offset=".55" stop-color="#9a3d17" stop-opacity=".14" />
        <stop offset="1" stop-color="#5a1f0b" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="id('floorlight')" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#ff9a48" stop-opacity=".42" />
        <stop offset="1" stop-color="#ff9a48" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="id('vignette')" cx="50%" cy="56%" r="62%">
        <stop offset=".55" stop-color="#000" stop-opacity="0" />
        <stop offset="1" stop-color="#000" stop-opacity=".78" />
      </radialGradient>
      <radialGradient :id="id('puff')" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#fff" stop-opacity=".9" />
        <stop offset=".55" stop-color="#fff" stop-opacity=".5" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </radialGradient>
      <!-- the shared intro fog texture (#intro-fog, 256 units) drawn at twice the size: one tile is 512 units -->
      <pattern :id="id('fog-a')" href="#intro-fog" patternTransform="scale(2)" />
      <pattern :id="id('fog-b')" href="#intro-fog" patternTransform="translate(60 210) scale(2)" />
      <mask :id="id('column')" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1600">
        <g v-for="(p, i) in PUFFS" :key="i" class="sway" :style="{ '--a': `${p[4]}px`, '--p': `${p[5]}ms`, '--o': `${p[6]}ms` }">
          <ellipse :cx="p[0]" :cy="p[1]" :rx="p[2]" :ry="p[3]" :fill="url('puff')" />
        </g>
      </mask>
      <!-- the fog texture is white with alpha; used as a mask it lets the warm smoke colour through -->
      <mask :id="id('smoke-a')" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1600">
        <g class="rise-a"><g class="lean lean-a"><rect x="300" y="0" width="1300" height="1800" :fill="url('fog-a')" /></g></g>
      </mask>
      <mask :id="id('smoke-b')" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1600">
        <g class="rise-b"><g class="lean lean-b"><rect x="300" y="0" width="1300" height="1800" :fill="url('fog-b')" /></g></g>
      </mask>
      <slot name="defs" :id="id" />
    </defs>

    <g class="cam">
      <!-- far: hall interior -->
      <g class="far">
        <rect x="-200" y="-200" width="2000" height="2000" fill="#0d0705" />
        <rect x="-200" y="330" width="2000" height="830" fill="#170e09" />
        <g fill="#1c110b"><rect v-for="x in PLANKS" :key="x" :x="x" y="330" width="7" height="830" /></g>
        <path d="M-200 520 L700 70 L900 70 L1800 520 L1800 380 L900 -60 L700 -60 L-200 380 Z" fill="#100906" />
        <path d="M-200 560 L700 110 L700 70 L-200 520 Z M1800 560 L900 110 L900 70 L1800 520 Z" fill="#22150d" />
        <rect x="-200" y="448" width="2000" height="38" fill="#24160e" />
        <rect x="-200" y="486" width="2000" height="8" fill="#1a100a" />
        <g fill="#26170e">
          <path d="M392 494 h50 v666 h-50 Z M386 494 h62 l-8 26 h-46 Z" />
          <path d="M1158 494 h50 v666 h-50 Z M1152 494 h62 l-8 26 h-46 Z" />
          <path d="M70 494 h56 v666 h-56 Z" />
          <path d="M1474 494 h56 v666 h-56 Z" />
        </g>
        <circle cx="250" cy="760" r="72" fill="#2b1a10" stroke="#3a2416" stroke-width="10" />
        <path d="M250 688 v144 M178 760 h144" stroke="#22150d" stroke-width="12" />
        <circle cx="250" cy="760" r="17" fill="#3d2717" />
        <circle cx="1352" cy="742" r="72" fill="#2b1a10" stroke="#3a2416" stroke-width="10" />
        <path d="M1301 691 l102 102 M1403 691 l-102 102" stroke="#22150d" stroke-width="12" />
        <circle cx="1352" cy="742" r="17" fill="#3d2717" />
        <g fill="#1f130c">
          <rect x="560" y="494" width="4" height="120" /><path d="M548 614 h28 l-6 70 h-16 Z" />
          <rect x="1060" y="494" width="4" height="96" /><path d="M1050 590 h24 l-5 54 h-14 Z" />
        </g>
      </g>

      <!-- fire light on the hall; dims as the fire sinks at the end of the prophecy -->
      <g class="dim"><circle class="glow" cx="890" cy="1010" r="760" :fill="url('glow')" /></g>

      <rect x="-200" y="1150" width="2000" height="650" fill="#120a06" />
      <rect x="-200" y="1150" width="2000" height="6" fill="#2a180e" />
      <g class="dim"><ellipse class="glow" cx="890" cy="1168" rx="620" ry="96" :fill="url('floorlight')" /></g>

      <!-- hearth: stone-lined longfire -->
      <path d="M752 1150 q138 -30 276 0 q-138 22 -276 0 Z" fill="#1a0f09" />
      <g fill="#2b1a11"><ellipse v-for="(s, i) in STONES" :key="i" :cx="s[0]" :cy="s[1]" :rx="s[2]" :ry="s[3]" /></g>
      <g class="rim" fill="#6b3518"><path v-for="(d, i) in STONE_TOPS" :key="i" :d="d" /></g>
      <rect x="800" y="1118" width="190" height="20" rx="9" fill="#1d1109" transform="rotate(-7 895 1128)" />
      <rect x="790" y="1120" width="200" height="20" rx="9" fill="#24150b" transform="rotate(8 890 1130)" />

      <!-- the skald: staff behind him, the telling hand turns at the shoulder -->
      <path d="M432 1150 q4 -48 30 -56 h170 q26 8 30 56 Z" fill="#140b07" />
      <path class="rim" d="M604 1128 L656 690" stroke="#8a3f19" stroke-width="13" stroke-linecap="round" transform="translate(4 -2)" />
      <path d="M604 1128 L656 690" stroke="#0a0504" stroke-width="13" stroke-linecap="round" />
      <path d="M656 690 q-14 -10 -6 -30 q14 -4 18 12 q4 12 -12 18 Z" fill="#0a0504" />
      <use class="rim" :href="`#${id('skald')}`" fill="#8a3f19" transform="translate(5 -3)" />
      <use :href="`#${id('skald')}`" fill="#1a0e09" />
      <g :clip-path="url('skald-clip')"><rect x="430" y="740" width="360" height="420" :fill="url('lit')" /></g>
      <g class="arm">
        <use class="rim" :href="`#${id('arm')}`" fill="#8a3f19" transform="translate(5 -3)" />
        <use :href="`#${id('arm')}`" fill="#1a0e09" />
        <g :clip-path="url('arm-clip')"><rect x="620" y="850" width="160" height="140" :fill="url('lit')" /></g>
      </g>

      <!-- near: listeners' backs and a post edge (mostly outside the safe frame) -->
      <g class="near" fill="#050302">
        <path d="M-100 1600 L-100 1330 C -20 1290, 60 1280, 120 1296 C 150 1250, 210 1236, 250 1262 C 282 1282, 292 1318, 282 1350 C 330 1380, 360 1440, 372 1600 Z" />
        <path d="M1700 1600 L1700 1360 C 1640 1330, 1560 1326, 1500 1350 C 1474 1310, 1420 1300, 1388 1328 C 1360 1352, 1360 1390, 1376 1414 C 1328 1442, 1300 1520, 1296 1600 Z" />
        <rect x="1520" y="-100" width="140" height="1800" />
      </g>

      <!-- the darkness the fire pushes back (fire beat only) -->
      <rect v-if="beat === 'fire'" class="veil" x="-200" y="-200" width="2000" height="2000" fill="#030201" />

      <g class="smoke" :mask="url('column')">
        <rect x="0" y="0" width="1600" height="1600" fill="#806c5e" :mask="url('smoke-a')" opacity=".75" />
      </g>
      <slot name="vision" :id="id" :url="url" />
      <g class="smoke" :mask="url('column')">
        <rect x="0" y="0" width="1600" height="1600" fill="#806c5e" :mask="url('smoke-b')" opacity=".55" />
      </g>

      <circle v-if="beat === 'fire'" class="spark" cx="890" cy="1120" r="10" fill="#ffd27a" />
      <g class="gutter">
        <g class="ignite">
          <g v-for="(t, i) in TONGUES" :key="i" class="tongue" :style="{ '--p': `${t[2]}ms`, '--o': `${t[3]}ms` }">
            <path :d="t[0]" :fill="t[1]" />
          </g>
        </g>
      </g>
      <g fill="#ffbe63">
        <circle
          v-for="(e, i) in EMBERS"
          :key="i"
          class="ember"
          :cx="e[0]"
          :cy="e[1]"
          :r="e[2]"
          :style="{ '--x': `${e[3]}px`, '--d': `${e[4]}ms`, '--s': `${e[5]}ms` }"
        />
      </g>
    </g>

    <rect x="0" y="0" width="1600" height="1600" :fill="url('vignette')" />
  </svg>
</template>

<style scoped>
.hall :is(.ignite, .spark, .tongue, .glow, .ember, .gutter) { transform-box: fill-box; }
.cam, .far, .near, .arm { transform-box: view-box; }
.cam { transform-origin: 800px 1020px; }
.far { transform-origin: 800px 900px; }
.near { transform-origin: 800px 1100px; }
.arm { transform-origin: 636px 912px; }
.ignite, .gutter, .tongue { transform-origin: 50% 100%; }
.spark { transform-origin: 50% 50%; }
.glow { transform-origin: 50% 70%; }

/* ---- fire beat: one-shots over --beat-duration; frame 0 is black ---- */
.is-fire .cam { animation: hall-push var(--beat-duration) cubic-bezier(0.3, 0.1, 0.4, 1) both; }
.is-fire .far { animation: hall-far var(--beat-duration) linear both; }
.is-fire .near { animation: hall-near var(--beat-duration) cubic-bezier(0.3, 0.1, 0.4, 1) both; }
.is-fire .veil { animation: hall-veil var(--beat-duration) ease-in-out both; }
.is-fire .ignite { animation: hall-ignite var(--beat-duration) ease-out both; }
.is-fire .smoke { animation: hall-smoke var(--beat-duration) ease-in-out both; }
.is-fire .spark { animation: hall-spark var(--beat-duration) ease-out both; }
.is-fire .arm { animation: hall-arm-tell var(--beat-duration) ease-in-out both; }
@keyframes hall-push { from { transform: scale(1); } to { transform: scale(1.07); } }
@keyframes hall-far { from { transform: translate(0, 0); } to { transform: translate(10px, 8px); } }
@keyframes hall-near { from { transform: scale(1) translate(0, 0); } to { transform: scale(1.12) translate(-14px, 10px); } }
@keyframes hall-veil { 0%, 12% { opacity: 1; } 48% { opacity: 0.08; } 100% { opacity: 0; } }
@keyframes hall-spark { 0%, 3% { opacity: 0; transform: scale(0.2); } 7% { opacity: 1; transform: scale(1.4); } 16%, 100% { opacity: 0; transform: scale(0.6); } }
@keyframes hall-ignite { 0%, 5% { opacity: 0; transform: scale(0.15, 0.05); } 12% { opacity: 1; transform: scale(0.55, 0.45); } 28% { transform: scale(1.06, 1.08); } 36%, 100% { opacity: 1; transform: scale(1, 1); } }
@keyframes hall-smoke { 0%, 18% { opacity: 0; } 60% { opacity: 0.55; } 100% { opacity: 0.9; } }
/* hand on the knee, raised as the saga starts, then a small telling gesture */
@keyframes hall-arm-tell { 0%, 30% { transform: rotate(34deg); } 52% { transform: rotate(-5deg); } 60% { transform: rotate(0deg); } 74% { transform: rotate(-6deg); } 88% { transform: rotate(2deg); } 100% { transform: rotate(0deg); } }

/* ---- prophecy beat: starts from the fire beat's end state ---- */
.is-prophecy .cam { transform: scale(1.07); }
.is-prophecy .far { transform: translate(10px, 8px); }
.is-prophecy .near { transform: scale(1.12) translate(-14px, 10px); }
.is-prophecy .smoke { opacity: 0.9; }
.is-prophecy .gutter { animation: hall-gutter var(--beat-duration) ease-in-out both; }
.is-prophecy .dim { animation: hall-dim var(--beat-duration) ease-in-out both; }
.is-prophecy .arm { animation: hall-arm-reach var(--beat-duration) ease-in-out both; }
/* the fire flares as the prophecy begins, and sinks low at its end */
@keyframes hall-gutter { 0% { transform: scale(1, 1); } 8% { transform: scale(1.12, 1.22); } 22%, 78% { transform: scale(1, 1); } 100% { transform: scale(0.82, 0.72); } }
@keyframes hall-dim { 0%, 70% { opacity: 1; } 100% { opacity: 0.62; } }
/* he reaches towards the vision, then lowers his hand as the fire sinks */
@keyframes hall-arm-reach { 0% { transform: rotate(0deg); } 9% { transform: rotate(-16deg); } 40% { transform: rotate(-11deg); } 62% { transform: rotate(-14deg); } 82% { transform: rotate(-6deg); } 100% { transform: rotate(20deg); } }

/* ---- ambient loops: fixed periods, shifted by --hall-elapsed so the prophecy continues the fire beat's phase ---- */
.tongue { animation: hall-flick var(--p) ease-in-out calc(var(--o) - var(--hall-elapsed)) infinite alternate; }
@keyframes hall-flick {
  0% { transform: scale(1, 1) rotate(0deg); }
  30% { transform: scale(0.93, 1.09) rotate(-1.6deg); }
  65% { transform: scale(1.05, 0.9) rotate(1.2deg); }
  100% { transform: scale(0.97, 1.04) rotate(-0.5deg); }
}
.glow { animation: hall-glow 780ms ease-in-out calc(0ms - var(--hall-elapsed)) infinite alternate; }
@keyframes hall-glow { 0% { opacity: 0.82; transform: scale(1); } 40% { opacity: 1; transform: scale(1.025); } 70% { opacity: 0.9; } 100% { opacity: 0.97; transform: scale(0.99); } }
.rim { animation: hall-rim 660ms ease-in-out calc(0ms - var(--hall-elapsed)) infinite alternate; }
@keyframes hall-rim { 0% { opacity: 0.55; } 50% { opacity: 1; } 100% { opacity: 0.75; } }
.ember { opacity: 0; animation: hall-ember var(--s) cubic-bezier(0.2, 0.6, 0.4, 1) calc(var(--d) - var(--hall-elapsed)) infinite backwards; }
@keyframes hall-ember {
  0% { opacity: 0; transform: translate(0, 0) scale(1); }
  8% { opacity: 1; }
  55% { opacity: 0.85; transform: translate(calc(var(--x) * 0.5), -260px) scale(0.8); }
  100% { opacity: 0; transform: translate(var(--x), -560px) scale(0.35); }
}
/* smoke: each loop scrolls exactly one texture tile (512) upwards so its last frame equals its first;
   the sideways drift is a separate back-and-forth so nothing ever has to wrap sideways */
.rise-a { animation: hall-rise 4800ms linear calc(0ms - var(--hall-elapsed)) infinite; }
.rise-b { animation: hall-rise 3300ms linear calc(0ms - var(--hall-elapsed)) infinite; }
@keyframes hall-rise { from { transform: translate(0, 0); } to { transform: translate(0, -512px); } }
.lean-a { --lx: -50px; animation: hall-lean 7200ms ease-in-out calc(0ms - var(--hall-elapsed)) infinite alternate; }
.lean-b { --lx: -110px; animation: hall-lean 5400ms ease-in-out calc(0ms - var(--hall-elapsed)) infinite alternate; }
@keyframes hall-lean { from { transform: translateX(0); } to { transform: translateX(var(--lx)); } }
.sway { animation: hall-sway var(--p) ease-in-out calc(var(--o) - var(--hall-elapsed)) infinite alternate; }
@keyframes hall-sway { from { transform: translateX(calc(var(--a) * -1)); } to { transform: translateX(var(--a)); } }
</style>
