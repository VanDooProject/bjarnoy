<script lang="ts">
// Wave lengths of the sea bands and fog tile sizes. The drift keyframes (b5-x*) move whole multiples of
// these per loop, which is what makes every layer loop seamlessly (checked in LongshipScene.test.ts).
export const SEA_WAVE_LEN = { mid: 200, near: 160, fg1: 400, fg2: 320 } as const;
export const FOG_TILE = { hz: 768, other: 1024 } as const;
export const ISLES_STRIP_WIDTH = 1600;
</script>

<script setup lang="ts">
import { useId } from 'vue';
import { FOG_UNEXPLORED_CSS } from '../../lib/map/fogColours';
import IntroLongship from './IntroLongship.vue';

/**
 * Beat 5, the longship in fog: a rowing longship with a boy at the prow, far settlements, ravens and
 * drifting fog. It loops on `--loop-period` (set by the host from the beat meta); with `landfall` the
 * coast slides in, the ship rows onto the beach and the fog closes to the map's unexplored colour.
 * The curtain's animationend is the handover.
 */
defineProps<{ paused?: boolean; landfall?: boolean }>();

const uid = useId().replace(/[^a-zA-Z0-9]/g, '-');
const id = (name: string) => `${uid}-${name}`;
const url = (name: string) => `url(#${id(name)})`;

// A wave band: filled down to `bottom`, one crest per `len`.
function wave(x0: number, x1: number, y: number, amp: number, len: number, bottom: number): string {
  let d = `M${x0} ${bottom} L${x0} ${y}`;
  for (let x = x0; x < x1; x += len) d += ` Q${x + len / 4} ${y - amp} ${x + len / 2} ${y} Q${x + (3 * len) / 4} ${y + amp * 0.6} ${x + len} ${y}`;
  return `${d} L${x1} ${bottom}Z`;
}
// Foam dashes, one per wave length.
function dashes(x0: number, x1: number, y: number, len: number, w: number): string {
  let d = '';
  for (let x = x0; x < x1; x += len) d += `M${x + len * 0.12} ${y} h${w} `;
  return d;
}

const { mid, near, fg1, fg2 } = SEA_WAVE_LEN;
const SEA = {
  mid: wave(-mid, 2200, 872, 5, mid, 1100),
  midDash: dashes(-mid, 2200, 892, mid, 60),
  near1: wave(-near, 2240, 980, 9, near, 1600),
  near1Dash: dashes(-near, 2240, 992, near, 44),
  near2: wave(-near, 2240, 1030, 7, near, 1600),
  fg1: wave(-fg1, 2400, 1214, 20, fg1, 1600),
  fg2: wave(-fg2, 2560, 1320, 16, fg2, 1600),
};

const OAR_X = [584, 680, 776, 872, 968, 1064];
</script>

<template>
  <div class="longship" :class="{ 'is-landfall': landfall }">
    <svg
      class="intro-beat b5"
      :class="{ 'is-paused': paused, 'b5-landfall': landfall }"
      viewBox="0 0 1600 1600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient :id="id('sky')" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#c4d0d8"/><stop offset=".52" stop-color="#e2e9ed"/><stop offset=".6" stop-color="#d4dee4"/><stop offset="1" stop-color="#b9c7d0"/>
        </linearGradient>
        <!-- fog tiles: the host's 256-unit texture scaled to 768 / 1024, so every drift distance is whole tiles -->
        <pattern :id="id('fog768')" href="#intro-fog" patternTransform="rotate(90) scale(3)" />
        <pattern :id="id('fog1024')" href="#intro-fog" patternTransform="scale(4)" />
        <pattern :id="id('fog1024f')" href="#intro-fog" patternTransform="scale(-4 4)" />
        <pattern :id="id('fog1024r')" href="#intro-fog" patternTransform="rotate(180) scale(4)" />
        <linearGradient :id="id('g-sky')" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient :id="id('g-band')" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <linearGradient :id="id('g-fg')" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".4" stop-color="#fff"/><stop offset="1" stop-color="#fff"/></linearGradient>
        <!-- each mask region is its band and no more: a mask region is rastered whole -->
        <mask :id="id('m-sky')"  maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="900"><rect x="0" y="0"    width="1600" height="900" :fill="url('g-sky')"/></mask>
        <mask :id="id('m-hz')"   maskUnits="userSpaceOnUse" x="0" y="700" width="1600" height="280"><rect x="0" y="700"  width="1600" height="280" :fill="url('g-band')"/></mask>
        <mask :id="id('m-low')"  maskUnits="userSpaceOnUse" x="0" y="880" width="1600" height="300"><rect x="0" y="880"  width="1600" height="300" :fill="url('g-band')"/></mask>
        <mask :id="id('m-bank')" maskUnits="userSpaceOnUse" x="0" y="520" width="1600" height="560"><rect x="0" y="520"  width="1600" height="560" :fill="url('g-band')"/></mask>
        <mask :id="id('m-fg')"   maskUnits="userSpaceOnUse" x="0" y="1120" width="1600" height="480"><rect x="0" y="1120" width="1600" height="480" :fill="url('g-fg')"/></mask>
                <!-- one settlement strip, 1600 wide -->
        <g :id="id('isles-strip')">
          <!-- island 1 -->
          <path d="M40 842 C90 820 120 790 170 784 C210 778 240 800 270 796 C320 790 350 816 400 842Z" fill="#aebcc5"/>
          <path d="M130 842 C160 822 190 808 220 812 C250 816 270 830 300 842Z" fill="#a3b2bc"/>
          <rect x="196" y="816" width="26" height="14" fill="#9aa9b3"/><path d="M192 818 L209 806 L226 818Z" fill="#9aa9b3"/>
          <circle class="light" cx="204" cy="824" r="3.2" fill="#f0c07a"/><circle class="light l2" cx="246" cy="828" r="2.6" fill="#f0c07a"/>
          <g transform="translate(209 806)"><ellipse class="puff" cx="0" cy="0" rx="16" ry="12" fill="#b0bdc5"/><ellipse class="puff" style="animation-delay:-4s" cx="0" cy="0" rx="16" ry="12" fill="#b9c5cd"/><ellipse class="puff" style="animation-delay:-8s" cx="0" cy="0" rx="16" ry="12" fill="#b0bdc5"/></g>
          <!-- island 2: smoke tall -->
          <path d="M560 842 C600 826 630 800 660 798 C700 796 720 822 770 842Z" fill="#b3c0c8"/>
          <circle class="light l3" cx="664" cy="826" r="3" fill="#f0c07a"/>
          <g transform="translate(668 812)"><ellipse class="puff" style="animation-delay:-2s" cx="0" cy="0" rx="18" ry="13" fill="#bcc8cf"/><ellipse class="puff" style="animation-delay:-6s" cx="0" cy="0" rx="18" ry="13" fill="#c5cfd5"/><ellipse class="puff" style="animation-delay:-10s" cx="0" cy="0" rx="18" ry="13" fill="#bcc8cf"/></g>
          <!-- island 3: larger, with a ship off its shore -->
          <path d="M900 842 C940 812 980 770 1040 762 C1090 756 1110 790 1150 792 C1200 794 1230 818 1270 842Z" fill="#aab8c2"/>
          <path d="M1010 842 C1040 820 1070 806 1100 810 C1130 814 1150 830 1170 842Z" fill="#9fafb9"/>
          <circle class="light" cx="1060" cy="826" r="3.2" fill="#f0c07a"/><circle class="light l2" cx="1092" cy="830" r="2.6" fill="#f0c07a"/><circle class="light l3" cx="1120" cy="828" r="2.8" fill="#f0c07a"/>
          <g transform="translate(1100 806)"><ellipse class="puff" style="animation-delay:-1s" cx="0" cy="0" rx="17" ry="12" fill="#b0bdc5"/><ellipse class="puff" style="animation-delay:-5s" cx="0" cy="0" rx="17" ry="12" fill="#b9c5cd"/><ellipse class="puff" style="animation-delay:-9s" cx="0" cy="0" rx="17" ry="12" fill="#b0bdc5"/></g>
          <g class="farsail"><path d="M1296 846 L1352 846 L1344 856 L1304 856Z" fill="#9aa9b3"/><rect x="1323" y="808" width="2" height="38" fill="#9aa9b3"/><path d="M1308 812 L1340 812 L1338 840 L1310 840Z" fill="#a6b4bd"/></g>
          <!-- island 4: skerry with beacon -->
          <path d="M1420 842 C1450 830 1470 818 1490 820 C1510 822 1530 834 1560 842Z" fill="#b5c2ca"/>
          <circle cx="1490" cy="818" r="11" fill="#f0c07a" opacity=".22"/><circle class="light l3" cx="1490" cy="818" r="3.6" fill="#f0c07a"/>
        </g>
      </defs>

      <!-- 1 sky -->
      <rect width="1600" height="1600" :fill="url('sky')"/>
      <!-- 2 high fog -->
      <g :mask="url('m-sky')" opacity=".6"><g class="drift fog-sky"><rect x="0" y="0" width="2624" height="900" :fill="url('fog1024')"/></g></g>
      <!-- 3 far settlements -->
      <g class="drift isles"><use :href="`#${id('isles-strip')}`"/><use :href="`#${id('isles-strip')}`" x="1600"/></g>
      <!-- 4 horizon fog, breathing: settlements fade in and out -->
      <g class="lf-hz"><g :mask="url('m-hz')"><g class="fog-hz-op"><g class="drift fog-hz"><rect x="0" y="700" width="2368" height="280" :fill="url('fog768')"/></g></g></g></g>
      <!-- 5 mid sea (behind hull) -->
      <g class="drift sea-mid">
        <path :d="SEA.mid" fill="#a7b6c0" />
        <path :d="SEA.midDash" stroke="#bfcbd2" stroke-width="3" stroke-linecap="round" opacity=".8" fill="none" />
      </g>
      <!-- 5b landfall coast, on the ship's plane: its beach meets the near sea at the ship's waterline -->
      <g class="coast-frame"><g class="lf-coast">
        <path d="M960 990 C1010 940 1060 880 1130 832 C1200 784 1260 728 1330 696 C1400 664 1500 652 1600 660 L1800 676 L1800 990Z" fill="#8a9a8e"/>
        <g fill="#66776b"><path d="M1132 840 L1150 788 L1168 840Z"/><path d="M1178 812 L1198 752 L1218 812Z"/><path d="M1226 780 L1244 728 L1262 780Z"/><path d="M1300 742 L1322 676 L1344 742Z"/><path d="M1350 720 L1368 668 L1386 720Z"/><path d="M1452 700 L1474 636 L1496 700Z"/><path d="M1510 696 L1528 646 L1546 696Z"/></g>
        <path d="M1060 990 C1120 930 1210 890 1320 872 C1420 856 1520 856 1800 866 L1800 990Z" fill="#788a7c"/>
        <path d="M880 994 C960 962 1060 950 1180 946 C1320 942 1500 948 1800 954 L1800 1000 L880 1000Z" fill="#cfc8b4"/>
        <path d="M900 994 C980 974 1080 966 1200 964 C1340 962 1520 966 1800 970 L1800 1000 L900 1000Z" fill="#b7b2a1"/>
      </g></g>
      <!-- 6 ship -->
      <g class="ship-frame"><g class="lf-ship"><g class="heave"><g class="pitch">
        <IntroLongship boy strakes underway />
      </g></g></g></g>
      <!-- 7 near sea (covers keel and blades) -->
      <g class="drift sea-near">
        <path :d="SEA.near1" fill="#7f929f" />
        <path :d="SEA.near1Dash" stroke="#dfe7ec" stroke-width="3" stroke-linecap="round" opacity=".55" fill="none" />
        <path :d="SEA.near2" fill="#748896" />
      </g>
      <!-- 7b oar splashes, on the ship's plane but in front of the near sea -->
      <g class="ship-frame"><g class="lf-ship">
        <g v-for="x in OAR_X" :key="x" :transform="`translate(${x + 40} 986)`">
          <ellipse class="splash" cx="0" cy="0" rx="16" ry="5" fill="#eef3f6" />
        </g>
      </g></g>
      <!-- 8 low fog over the water -->
      <g :mask="url('m-low')"><g class="fog-low-op"><g class="drift fog-low"><rect x="0" y="880" width="2624" height="300" :fill="url('fog1024f')"/></g></g></g>
      <!-- 9 foreground swells -->
      <g class="drift sea-fg1"><path :d="SEA.fg1" fill="#5a6d7a" /></g>
      <g class="drift sea-fg2"><path :d="SEA.fg2" fill="#445663" /></g>
      <!-- 10 foreground fog -->
      <g :mask="url('m-fg')" opacity=".75"><g class="drift fog-fg"><rect x="0" y="1120" width="2624" height="480" :fill="url('fog1024r')"/></g></g>
      <!-- 11 ravens -->
      <g class="ravens"><g class="ravens-y">
        <g transform="translate(0 470)"><g class="bob-a"><g class="r-pitch"><g class="r-wander"><g transform="scale(.6)"><g transform="translate(-6 -6) scale(.86)"><path class="wing far" fill="#2a3640" d="M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z"/></g><path fill="#1a242b" d="M-66,-8 L-32,-5 C-12,-12 18,-12 33,-7 C40,-13 51,-13 57,-7 L74,-3 L57,1 C49,6 39,6 31,5 C10,11 -20,9 -34,4 L-66,10 L-56,1 Z"/><g transform="translate(2 -6)"><path class="wing" fill="#1a242b" d="M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z"/></g></g></g></g></g></g>
        <g transform="translate(-130 525)"><g class="sway-b"><g class="bob-b"><g class="r-pitch"><g class="r-wander"><g class="rb" transform="scale(.52)"><g transform="translate(-6 -6) scale(.86)"><path class="wing far" fill="#2a3640" d="M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z"/></g><path fill="#1a242b" d="M-66,-8 L-32,-5 C-12,-12 18,-12 33,-7 C40,-13 51,-13 57,-7 L74,-3 L57,1 C49,6 39,6 31,5 C10,11 -20,9 -34,4 L-66,10 L-56,1 Z"/><g transform="translate(2 -6)"><path class="wing" fill="#1a242b" d="M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z"/></g></g></g></g></g></g></g>
      </g></g>
      <!-- 12 passing fog bank, every 6 loops -->
      <g class="lf-hz"><g :mask="url('m-bank')"><g class="fog-bank-op"><g class="drift fog-bank"><rect x="0" y="520" width="3648" height="560" :fill="url('fog1024')"/></g></g></g></g>
      <!-- 13 landfall: fog closes to the map's unexplored colour -->
      <g class="lf-mist"><g class="drift fog-fg"><rect x="0" y="0" width="2624" height="1600" :fill="url('fog1024')"/></g><rect width="1600" height="1600" :fill="FOG_UNEXPLORED_CSS" opacity=".55"/></g>
      <rect class="lf-curtain" :id="id('curtain')" width="1600" height="1600" :fill="FOG_UNEXPLORED_CSS"/>
    </svg>
  </div>
</template>

<style scoped>
.longship { position: absolute; inset: 0; container-type: size; }
.b5 { --b5-loop: var(--loop-period, 12s); --ship-loop: var(--b5-loop); }
.b5 * { transform-box: view-box; }
.b5 .drift { will-change: transform; }

/* rowing: 5 strokes per loop (the oars and rowers row in IntroLongship on --ship-loop); the splashes keep time with them */
.b5 .splash { opacity: 0; transform-origin: 0 0; animation: b5-splash calc(var(--b5-loop) / 5) ease-out infinite; }
@keyframes b5-splash { 0% { opacity: .9; transform: scale(.4); } 22% { opacity: .55; transform: scale(1.25); } 40%,100% { opacity: 0; transform: scale(1.5); } }

/* ship motion */
.b5 .heave { animation: b5-heave calc(var(--b5-loop) / 3) ease-in-out infinite; }
.b5 .pitch { transform-origin: 800px 900px; animation: b5-pitch var(--b5-loop) ease-in-out infinite; }
@keyframes b5-heave { 0%,100% { transform: translateY(-4px); } 50% { transform: translateY(5px); } }
@keyframes b5-pitch { 0%,100% { transform: rotate(-.9deg); } 50% { transform: rotate(1.1deg); } }

/* sea bands: each moves a whole number of wavelengths per loop */
.b5 .sea-mid  { animation: b5-x400 var(--b5-loop) linear infinite; }
.b5 .sea-near { animation: b5-x480 var(--b5-loop) linear infinite; }
.b5 .sea-fg1  { animation: b5-x800 var(--b5-loop) linear infinite; }
.b5 .sea-fg2  { animation: b5-x960 var(--b5-loop) linear infinite; }
@keyframes b5-x400 { to { transform: translateX(-400px); } }
@keyframes b5-x480 { to { transform: translateX(-480px); } }
@keyframes b5-x800 { to { transform: translateX(-800px); } }
@keyframes b5-x960 { to { transform: translateX(-960px); } }

/* far settlements: one 1600-wide strip, drawn twice, passes once per 20 loops */
.b5 .isles { animation: b5-x1600 calc(var(--b5-loop) * 20) linear infinite; }
@keyframes b5-x1600 { to { transform: translateX(-1600px); } }
.b5 .puff { opacity: 0; transform-box: fill-box; transform-origin: 50% 100%; animation: b5-puff var(--b5-loop) ease-out infinite; }
@keyframes b5-puff { 0% { opacity: 0; transform: translate(0, 0) scale(.6); } 15% { opacity: .75; } 100% { opacity: 0; transform: translate(34px, -190px) scale(2.6); } }
.b5 .light { animation: b5-flicker calc(var(--b5-loop) / 3) steps(1, end) infinite; }
.b5 .light.l2 { animation-duration: calc(var(--b5-loop) / 4); }
.b5 .light.l3 { animation-duration: calc(var(--b5-loop) * 2 / 5); }
@keyframes b5-flicker { 0% { opacity: .9; } 18% { opacity: .55; } 26% { opacity: .85; } 61% { opacity: .65; } 70% { opacity: 1; } 88% { opacity: .7; } }
.b5 .farsail { animation: b5-heave calc(var(--b5-loop) / 2) ease-in-out infinite; }

/* fog: tile size per layer, drift = whole tiles per period */
.b5 .fog-sky     { animation: b5-x1024 calc(var(--b5-loop) * 8) linear infinite; }
.b5 .fog-hz      { animation: b5-x768  calc(var(--b5-loop) * 4) linear infinite; }
.b5 .fog-hz-op   { animation: b5-breath-hz  calc(var(--b5-loop) * 5) ease-in-out infinite; }
.b5 .fog-low     { animation: b5-x1024 calc(var(--b5-loop) * 3) linear infinite; }
.b5 .fog-low-op  { animation: b5-breath-low calc(var(--b5-loop) * 7) ease-in-out infinite; }
.b5 .fog-fg      { animation: b5-x1024 calc(var(--b5-loop) * 2) linear infinite; }
.b5 .fog-bank    { animation: b5-x2048 calc(var(--b5-loop) * 6) linear infinite; }
.b5 .fog-bank-op { opacity: 0; animation: b5-bank calc(var(--b5-loop) * 6) ease-in-out infinite; }
@keyframes b5-x768  { to { transform: translateX(-768px); } }
@keyframes b5-x1024 { to { transform: translateX(-1024px); } }
@keyframes b5-x2048 { to { transform: translateX(-2048px); } }
@keyframes b5-breath-hz  { 0%,100% { opacity: .6; } 50% { opacity: 1; } }
@keyframes b5-breath-low { 0%,100% { opacity: .45; } 50% { opacity: .85; } }
/* hidden while it is out of sight (two thirds of its period): an invisible layer is still rastered */
@keyframes b5-bank { 0%,32% { opacity: 0; visibility: hidden; } 50% { opacity: .7; visibility: visible; } 68%,100% { opacity: 0; visibility: hidden; } }

/* ravens: always a pair; they cross every 2 loops, height and spacing drift on their own periods */
.b5 .ravens  { animation: b5-cross calc(var(--b5-loop) * 2) linear -1.2s infinite backwards; }
.b5 .sway-b  { animation: b5-sway calc(var(--b5-loop) * 1.7) ease-in-out infinite alternate; }
.b5 .bob-a   { animation: b5-bob calc(var(--b5-loop) * 1.5) ease-in-out infinite alternate; }
.b5 .bob-b   { animation: b5-bob calc(var(--b5-loop) * 2.25) ease-in-out infinite alternate-reverse; }
.b5 .ravens-y { animation: b5-cross-y calc(var(--b5-loop) * 2) -1.2s infinite backwards; }
.b5 .r-pitch  { animation: b5-pitch-r calc(var(--b5-loop) * 2) -1.2s infinite backwards; }
.b5 .r-wander { animation: b5-wander 1.9s ease-in-out infinite alternate; }
.b5 .rb .r-wander { animation-duration: 2.3s; animation-delay: -.8s; }
/* three beats, then a glide with wings spread; the two ravens are out of step */
.b5 .wing    { transform-origin: 0 0; animation: b5-flap 1.7s ease-in-out infinite; }
.b5 .rb .wing { animation-duration: 1.95s; animation-delay: -.6s; }
.b5 .rb .wing.far { animation-delay: -.65s; }
.b5 .wing.far { animation-delay: -.05s; }
@keyframes b5-cross { 0% { transform: translateX(-160px); } 30%,100% { transform: translateX(1920px); } }
/* the pair rises and dips along the way (eased per segment, so the path is a smooth wave), nose up when climbing */
@keyframes b5-cross-y { 0% { transform: translateY(30px); animation-timing-function: ease-in-out; } 6% { transform: translateY(-40px); animation-timing-function: ease-in-out; }
  12% { transform: translateY(10px); animation-timing-function: ease-in-out; } 18% { transform: translateY(-60px); animation-timing-function: ease-in-out; }
  24% { transform: translateY(-20px); animation-timing-function: ease-in-out; } 30%,100% { transform: translateY(-70px); } }
@keyframes b5-pitch-r { 0%,6%,12%,18%,24%,30%,100% { transform: rotate(0deg); animation-timing-function: ease-in-out; }
  3% { transform: rotate(-7deg); animation-timing-function: ease-in-out; } 9% { transform: rotate(5deg); animation-timing-function: ease-in-out; }
  15% { transform: rotate(-8deg); animation-timing-function: ease-in-out; } 21% { transform: rotate(4deg); animation-timing-function: ease-in-out; }
  27% { transform: rotate(-5deg); animation-timing-function: ease-in-out; } }
@keyframes b5-wander { from { transform: translateY(-12px) rotate(2deg); } to { transform: translateY(12px) rotate(-3deg); } }
@keyframes b5-sway  { from { transform: translateX(-30px); } to { transform: translateX(50px); } }
@keyframes b5-bob { from { transform: translateY(-60px); } to { transform: translateY(70px); } }
@keyframes b5-flap { 0%,25%,50% { transform: scaleY(1); } 12.5%,37.5% { transform: scaleY(-.55); } 62%,90% { transform: scaleY(.12); } 100% { transform: scaleY(1); } }

/* ship drawn at 68 %, scaled about its waterline and set left, so the landfall coast has room on the same plane */
.b5 .ship-frame { transform-origin: 800px 975px; transform: translate(-110px, 0) scale(.68); }
/* 9:16 and other tall frames: the landfall coast sits further left so more of it is inside the frame (.longship is the container) */
@container (aspect-ratio < 1) { .b5 .coast-frame { transform: translateX(-200px); } }


/* landfall: ends the hold. Host adds .b5-landfall; the curtain's animationend (= fog solid) is the handover.
   Timings come from custom properties the host may set (defaults after the comma):
   --lf-coast  coast slide-in time      --lf-ship      ship rows onto the beach
   --lf-fog-at fog starts closing       --lf-fog-time  fog start -> solid (how fast it thickens) */
.b5 .lf-coast   { opacity: 0; transform: translateX(420px); }
/* hidden, not only transparent, until the landfall fades them in: an invisible layer is still rastered */
.b5 .lf-mist, .b5 .lf-curtain { opacity: 0; visibility: hidden; }
.b5.b5-landfall .lf-coast   { animation: b5-lf-coast   var(--lf-coast, 3.6s) linear forwards; }
.b5.b5-landfall .lf-hz      { animation: b5-lf-out     var(--lf-coast, 3.6s) ease-out forwards; }
.b5.b5-landfall .lf-ship    { animation: b5-lf-ship    var(--lf-ship, 5s) cubic-bezier(.45,0,.4,1) forwards; }
.b5.b5-landfall .lf-mist    { animation: b5-lf-fade calc(var(--lf-fog-time, 2.6s) * .65) ease-in-out var(--lf-fog-at, 2.4s) both; }
.b5.b5-landfall .lf-curtain { animation: b5-lf-fade calc(var(--lf-fog-time, 2.6s) * .6) ease-in calc(var(--lf-fog-at, 2.4s) + var(--lf-fog-time, 2.6s) * .4) both; }
@keyframes b5-lf-coast    { 0% { opacity: 0; transform: translateX(420px); animation-timing-function: cubic-bezier(.2,.7,.3,1); } 14% { opacity: 1; } 100% { opacity: 1; transform: translateX(0); } }
@keyframes b5-lf-out      { 0% { opacity: 1; } 100% { opacity: 0; } }
@keyframes b5-lf-ship     { 0% { transform: translateX(0); } 100% { transform: translateX(170px); } }
@keyframes b5-lf-fade     { from { opacity: 0; visibility: visible; } to { opacity: 1; visibility: visible; } }
</style>
