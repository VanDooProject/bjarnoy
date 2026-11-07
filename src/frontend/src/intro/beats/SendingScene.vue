<script lang="ts">
// The ship's run (sd-ship-depart, on --ship-ms) is a straight line from 80 % to its end, and the camera
// (sd-cam-mid) holds still at its end frame from 100 % of the beat. So where the ship is when the beat ends follows
// from the beat's length; the ravens scene starts its ship there, so the cut has one ship (both values are checked
// against the keyframes in SendingScene.test.ts).
export const SHIP_MS = 14000;
export const SHIP_TRACK = { from: 0.8, at80: [90, -6], at100: [249.6, -16.64] } as const;
export const SHIP_PLACE = { x: 772, y: 499, scale: 0.36 } as const;
export const CAM_MID_END = { x: -32, y: -36, scale: 1.04 } as const;

/** The ship's transform in viewBox units (translate x, y and scale of its local drawing) when the sending ends. */
export function sendingShipAtEnd(beatMs: number): { x: number; y: number; scale: number } {
  const t = Math.min(1, Math.max(SHIP_TRACK.from, beatMs / SHIP_MS));
  const f = (t - SHIP_TRACK.from) / (1 - SHIP_TRACK.from);
  const dx = SHIP_TRACK.at80[0] + (SHIP_TRACK.at100[0] - SHIP_TRACK.at80[0]) * f;
  const dy = SHIP_TRACK.at80[1] + (SHIP_TRACK.at100[1] - SHIP_TRACK.at80[1]) * f;
  return {
    x: CAM_MID_END.x + CAM_MID_END.scale * (SHIP_PLACE.x + dx),
    y: CAM_MID_END.y + CAM_MID_END.scale * (SHIP_PLACE.y + dy),
    scale: CAM_MID_END.scale * SHIP_PLACE.scale,
  };
}
</script>

<script setup lang="ts">
import { useId } from 'vue';
import IntroLongship from './IntroLongship.vue';
import SendingFire from './SendingFire.vue';
import { sineLoop } from './sineLoop';

/**
 * Beat 3, the sending: dusk on the burning shore. The jarl, spear planted, goes down on one knee to his
 * son, takes him by the shoulder and pats it, then lets go. The boy turns and walks down to the water and is
 * lost in the shore mist, and a moment later stands at the ship's prow; the jarl raises his arm and waves while
 * the longship drops its sail and pulls out toward the light. At the end the camera turns with the ship, out to
 * sea, and the ravens scene goes on with that pan. The beat starts from the dark of the prophecy's last frame.
 * The story (figures, camera push, sail, oars, ship's departure) is baked from the design's
 * pose function into the keyframes at the bottom: figures and ship on fixed times, camera and fog on
 * `--beat-duration` (see there). Smoke, fire, fog, glints, ash and the ship's swell loop on their own periods.
 */
defineProps<{ paused?: boolean }>();

const uid = useId().replace(/[^a-zA-Z0-9]/g, '-');
const id = (name: string) => `${uid}-${name}`;
const url = (name: string) => `url(#${id(name)})`;

// smoke columns over the burning homeland: [x, y, strength]
const SMOKE_COLS: [number, number, number][] = [[330, 606, 1], [520, 598, 0.85]];
// the box the smoke texture rises through: both columns, 340 to each side, tall enough for one 512 tile of rise
const SMOKE_XS = SMOKE_COLS.map(([x]) => x);
const SMOKE_BOX = {
  x: Math.min(...SMOKE_XS) - 340,
  y: 0,
  width: Math.max(...SMOKE_XS) - Math.min(...SMOKE_XS) + 680,
  height: Math.max(...SMOKE_COLS.map(([, y]) => y)) + 600,
};
// the puffs' mask region: the box's width, down to just below the lowest puff (they sway sideways only).
// A mask region is rastered whole, so it stays this tight.
const PUFF_REGION = { x: SMOKE_BOX.x, y: 0, width: SMOKE_BOX.width, height: Math.max(...SMOKE_COLS.map(([, y]) => y)) + 60 };
const FIRES: [number, number, number][] = [[330, 612, 1.25], [520, 602, 1.1], [472, 692, 0.75]];

const fix = (n: number) => Math.round(n * 100) / 100;
// soft puffs along a column, wider and swaying more the higher they are
const PUFFS = SMOKE_COLS.map(([bx, by], c) =>
  Array.from({ length: 6 }, (_, i) => {
    const t = i / 5;
    return {
      cx: fix(bx - t * t * 70),
      cy: fix(by - 40 - t * (by - 40)),
      rx: fix(58 + t * 200),
      ry: fix(90 + t * 100),
      style: { ...sineLoop(0.9 - i * 0.07, i * 0.55 + c), '--a': `${4 + i * 11}px` },
    };
  }),
);

const GLINTS: [number, number, number, number, number][] = [
  [930, 806, 360, 3, 0.5], [990, 820, 250, 2, 0.42], [1060, 834, 300, 2, 0.36],
  [1300, 812, 200, 2, 0.36], [1380, 828, 260, 2, 0.3], [820, 846, 180, 2, 0.22],
];

// ash on the wind: [x, y] at t = 0 and its fall speed (px/s); one loop is a fall through the whole frame
const ASH = Array.from({ length: 22 }, (_, i) => {
  const x = (i * 733) % 1600;
  const y = (i * 389) % 1600;
  const v = 14 + ((i * 13) % 20);
  return {
    r: fix(1.2 + ((i * 7) % 5) * 0.35),
    style: { '--x0': `${x + 0.3 * y}px`, '--d': `${Math.round((1640 / v) * 1000)}ms`, '--o': `${-Math.round((y / v) * 1000)}ms` },
  };
});

// the figures are drawn twice: a pale rim light offset up and right, then the silhouette over it
const FIGS = [
  { rim: true, fill: '#3e3a3e', shift: 'translate(3,-2)' },
  { rim: false, fill: '#07090c', shift: undefined },
];
const SIDES = [
  { cls: 'sd-boy-l', flip: 'scale(-1,1)' },
  { cls: 'sd-boy-r', flip: undefined },
];

</script>

<template>
  <svg class="intro-beat b3" :class="{ 'is-paused': paused }" viewBox="0 0 1600 1600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient :id="id('sky')" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1c232d"/><stop offset=".42" stop-color="#3a414c"/><stop offset=".5" stop-color="#6e6668"/>
      </linearGradient>
      <radialGradient :id="id('puff')">
        <stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".55" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
      <radialGradient :id="id('fireglow')">
        <stop offset="0" stop-color="#ff8a3d" stop-opacity=".7"/><stop offset=".4" stop-color="#c8562a" stop-opacity=".3"/><stop offset="1" stop-color="#7a3a2a" stop-opacity="0"/>
      </radialGradient>
      <radialGradient :id="id('ember')">
        <stop offset="0" stop-color="#d08a5c" stop-opacity=".75"/><stop offset=".45" stop-color="#9a5a42" stop-opacity=".35"/><stop offset="1" stop-color="#5e3a33" stop-opacity="0"/>
      </radialGradient>
      <radialGradient :id="id('vig')" cx=".5" cy=".5" r=".7">
        <stop offset=".55" stop-color="#05070a" stop-opacity="0"/><stop offset="1" stop-color="#05070a" stop-opacity=".6"/>
      </radialGradient>
      <linearGradient :id="id('band')" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient :id="id('ramp')" x1="0" y1="0" x2="1" y2="0">
        <stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".62" stop-color="#fff"/><stop offset="1" stop-color="#fff"/>
      </linearGradient>
      <!-- the host's 256-unit fog texture (white with alpha) at 2x, 4x and 3x: tiles of 512, 1024 and 768 units.
           Every smoke and fog layer is a flat colour masked by it. -->
      <pattern :id="id('smk')" href="#intro-fog" patternTransform="scale(2)" />
      <pattern :id="id('wsp')" href="#intro-fog" patternTransform="translate(170 90) scale(2)" />
      <pattern :id="id('fog')" href="#intro-fog" patternTransform="scale(4)" />
      <pattern :id="id('fog2')" href="#intro-fog" patternTransform="rotate(180) scale(3)" />
      <!-- both smoke columns' puffs, each column at its strength -->
      <mask :id="id('cols')" maskUnits="userSpaceOnUse" v-bind="PUFF_REGION">
        <g v-for="([, , o], c) in SMOKE_COLS" :key="c" :opacity="o">
          <g v-for="(p, i) in PUFFS[c]" :key="i" class="sd-sway" :style="p.style">
            <ellipse :cx="p.cx" :cy="p.cy" :rx="p.rx" :ry="p.ry" :fill="url('puff')"/>
          </g>
        </g>
      </mask>
      <mask :id="id('smkA')"><rect v-bind="SMOKE_BOX" :fill="url('smk')"/></mask>
      <mask :id="id('smkB')"><rect v-bind="SMOKE_BOX" :fill="url('wsp')"/></mask>
      <mask :id="id('hz')" maskUnits="userSpaceOnUse" x="-40" y="660" width="1680" height="260">
        <rect x="-40" y="660" width="1680" height="260" :fill="url('band')"/>
      </mask>
      <mask :id="id('shore')" maskUnits="userSpaceOnUse" x="0" y="860" width="1600" height="220">
        <rect x="0" y="860" width="1600" height="220" :fill="url('band')"/>
      </mask>
      <mask :id="id('right')" maskUnits="userSpaceOnUse" x="0" y="860" width="1600" height="220">
        <rect x="0" y="860" width="1600" height="220" :fill="url('ramp')"/>
      </mask>
      <mask :id="id('hzTex')"><rect x="-40" y="640" width="2700" height="300" :fill="url('fog')"/></mask>
      <mask :id="id('shoreTex')"><rect x="-808" y="840" width="2448" height="260" :fill="url('fog2')"/></mask>
    </defs>

    <rect width="1600" height="1600" :fill="url('sky')"/>
    <ellipse cx="1110" cy="790" rx="820" ry="190" fill="#5e5459" opacity=".5"/>
    <ellipse cx="1110" cy="790" rx="600" ry="120" fill="#80635d" opacity=".5"/>
    <ellipse cx="1110" cy="790" rx="380" ry="66" fill="#a8775f" opacity=".55"/>
    <ellipse cx="1110" cy="790" rx="190" ry="30" fill="#d39d78" opacity=".6"/>

    <g class="sd-a sd-cam-far">
      <!-- the homeland: the camera pans away from it with the ship at the end -->
      <g class="sd-a sd-pan-far">
      <ellipse v-for="([bx, by], c) in SMOKE_COLS" :key="c" class="sd-ember" :style="{ '--i': c }" :cx="bx" :cy="by - 70" rx="140" ry="120" :fill="url('ember')"/>
      <!-- one rising texture pair for both columns: the columns overlap, and two pairs cost twice the layers -->
      <g :mask="url('cols')">
        <g class="sd-rise sd-rise-a"><rect v-bind="SMOKE_BOX" fill="#5c6068" opacity=".72" :mask="url('smkA')"/></g>
        <g class="sd-rise sd-rise-b"><rect v-bind="SMOKE_BOX" fill="#74767c" opacity=".3" :mask="url('smkB')"/></g>
      </g>
      <SendingFire v-for="([x, y, sc], c) in FIRES.slice(0, 2)" :key="c" :x="x" :y="y" :scale="sc" :index="c" :glow="url('fireglow')" />
      <path d="M0 790 L0 600 L90 560 L170 610 L250 540 L330 600 L430 520 L520 590 L610 560 L700 640 L800 650 L880 720 L940 790 Z" fill="#2d343e"/>
      <path d="M0 790 L0 680 L120 650 L230 690 L360 640 L470 690 L590 670 L700 720 L820 760 L880 790 Z" fill="#252b34"/>
      <SendingFire :x="FIRES[2][0]" :y="FIRES[2][1]" :scale="FIRES[2][2]" :index="2" :glow="url('fireglow')" />
      </g>
      <rect x="0" y="786" width="1600" height="814" fill="#1d252e"/>
      <g>
        <rect v-for="([x, y, w, h, o], i) in GLINTS" :key="i" class="sd-glint" :style="sineLoop(0.4, i * 1.3)" :x="x" :y="y" :width="w" :height="h" fill="#8c6a5c" :opacity="o"/>
      </g>
      <g class="sd-hz-out" :mask="url('hz')" opacity=".42"><g class="sd-fog sd-fog-hz"><rect x="-40" y="640" width="2700" height="300" fill="#808891" :mask="url('hzTex')"/></g></g>
    </g>

    <g class="sd-a sd-cam-mid">
      <g class="sd-a sd-ship-depart"><g class="sd-heave"><g class="sd-pitch">
        <g class="sd-longship" transform="translate(772,499) scale(0.36)"><IntroLongship bold boy /></g>
      </g></g></g>
      <rect x="0" y="851" width="1600" height="40" fill="#1d252e"/>
      <rect x="860" y="852" width="520" height="2" fill="#8c6a5c" opacity=".4"/>
      <g class="sd-a sd-pan-shore">
      <path d="M0 872 L380 880 C640 892 860 908 1040 952 C1150 980 1260 1050 1600 1110 L1600 1600 L0 1600 Z" fill="#2a2f35"/>
      <path d="M0 884 L380 892 C640 904 860 922 1030 968 C1140 998 1250 1068 1600 1130 L1600 1600 L0 1600 Z" fill="#161b21"/>
      </g>
    </g>

    <g>
      <circle v-for="(a, i) in ASH" :key="i" class="sd-ash" :style="a.style" :r="a.r" fill="#8f969d" opacity=".4"/>
    </g>
    <g class="sd-a sd-cam-fig">
      <g class="sd-a sd-pan-fig">
      <ellipse cx="610" cy="1164" rx="170" ry="12" fill="#05070a" opacity=".5"/>
      <g v-for="fig in FIGS" :key="fig.fill" :transform="fig.shift" :fill="fig.fill">
        <rect x="495" y="540" width="8" height="626"/><path d="M499,494 L511,546 L487,546 Z"/>
        <!-- the jarl (round 1 rig, drawn small and scaled up) -->
        <g transform="translate(600,1160) scale(2.2)">
          <g class="sd-a sd-j-cloak"><path d="M-14,-206 Q-32,-206 -38,-182 Q-54,-110 -76,0 L16,0 Q12,-100 18,-200 Z"/></g>
          <g class="sd-a sd-j-bthigh"><rect x="0" y="-8" width="56" height="16" rx="7"/><circle cx="55" cy="0" r="8"/>
            <g class="sd-a sd-j-bshin"><rect x="0" y="-7" width="56" height="14" rx="6"/><rect x="48" y="-7" width="10" height="14" rx="3"/></g></g>
          <g class="sd-a sd-j-thigh"><rect x="0" y="-8" width="56" height="16" rx="7"/><circle cx="55" cy="0" r="8"/>
            <g class="sd-a sd-j-shin"><rect x="0" y="-7" width="56" height="14" rx="6"/><rect x="48" y="-22" width="11" height="29" rx="3"/></g></g>
          <g class="sd-a sd-j-torso">
            <g class="sd-a sd-j-farm"><rect x="-6" y="-6.5" width="46" height="13" rx="6.5"/><circle cx="40" cy="0" r="6.5"/>
              <g class="sd-a sd-j-ffore"><rect x="-5" y="-5.5" width="42" height="11" rx="5.5"/><circle cx="40" cy="0" r="8.5"/></g></g>
            <path d="M-23,54 L25,54 Q22,20 20,0 L18,-64 Q15,-86 3,-94 Q-17,-93 -24,-76 L-22,0 Q-25,26 -23,54 Z"/>
            <path d="M-28,-80 q4,-12 14,-14 q7,-8 16,-5 q8,-4 12,2 q3,3 2,8 q-4,5 -10,4 q-9,5 -19,2 q-9,4 -15,-1 Z"/>
            <g class="sd-a sd-j-head">
              <path d="M-12,-14 L-14,3 Q-9,7 -3,4 L-1,-8 Z"/>
              <circle cx="3" cy="-16" r="13"/>
              <path d="M-12,-17 C-12,-31 -4,-41 4,-43 C12,-41 20,-31 20,-17 Z"/>
              <rect x="-14" y="-20" width="34" height="5" rx="2"/>
              <path d="M7,-9 Q18,-8 19,3 L16,24 Q13,34 9,25 Q4,12 -1,3 Q1,-6 7,-9 Z"/>
            </g>
          </g>
        </g>
        <!-- the boy: walks down the beach (bob and scale-down inside), turns from facing the jarl to facing the sea -->
        <g class="sd-a sd-boy" :class="{ 'is-rim': fig.rim }">
          <g class="sd-a sd-boy-bob">
            <g v-for="side in SIDES" :key="side.cls" class="sd-a" :class="side.cls" :transform="side.flip">
              <path d="M-24,-224 C-40,-182 -50,-122 -54,-68 L-28,-74 Z"/>
              <g class="sd-a sd-legb"><rect x="-23" y="-86" width="17" height="86" rx="4"/><rect x="-23" y="-8" width="24" height="8" rx="3"/></g>
              <g class="sd-a sd-legf"><rect x="6" y="-86" width="17" height="86" rx="4"/><rect x="6" y="-8" width="24" height="8" rx="3"/></g>
              <path d="M-31,-219 Q0,-240 33,-219 L46,-78 L-44,-78 Z"/>
              <g transform="translate(0,-232)"><g class="sd-a sd-look"><g transform="translate(0,232)">
                <circle cx="0" cy="-260" r="25"/>
                <path d="M22,-264 L32,-254 L22,-250 Z"/>
                <path d="M-23,-270 C-23,-295 17,-299 27,-274 C12,-283 -8,-281 -23,-270 Z"/>
              </g></g></g>
              <g class="sd-a sd-boy-arm"><path d="M-8,-8 L64,-6 L64,6 L-8,8 Z"/><ellipse cx="70" cy="0" rx="9.5" ry="7.5"/></g>
            </g>
          </g>
        </g>
        <!-- the near arm is drawn last, so the hand is over the boy -->
        <g transform="translate(600,1160) scale(2.2)">
          <g class="sd-a sd-j-torso"><g class="sd-a sd-j-arm"><rect x="-5" y="-6" width="51" height="12" rx="6"/><circle cx="46" cy="0" r="6.5"/>
            <g class="sd-a sd-j-fore"><rect x="-5" y="-6" width="46" height="12" rx="6"/><circle cx="43" cy="0" r="7"/></g></g></g>
        </g>
      </g>
      </g>
    </g>

    <g :mask="url('right')"><g :mask="url('shore')" opacity=".26"><g class="sd-fog sd-fog-shore"><rect x="-808" y="840" width="2448" height="260" fill="#808891" :mask="url('shoreTex')"/></g></g></g>

    <g class="sd-a sd-cam-near">
      <g class="sd-a sd-pan-near">
      <path d="M-40 1600 L-40 1330 C40 1290 120 1300 190 1340 C260 1320 330 1350 380 1420 C420 1460 460 1520 470 1600 Z" fill="#090b0e"/>
      <path d="M120 1310 L132 1250 L142 1312 M170 1330 L190 1262 L196 1336 M230 1330 L236 1280 L250 1334" stroke="#090b0e" stroke-width="5" fill="none"/>
      </g>
    </g>
    <rect width="1600" height="1600" :fill="url('vig')"/>
    <!-- the beat starts from the prophecy's dark -->
    <rect class="sd-a sd-dark" width="1600" height="1600" fill="#06080b"/>
  </svg>
</template>

<style scoped>
.b3 * { transform-box: view-box; transform-origin: 0 0; }
/* story animations: one run over the beat */
.b3 .sd-a { animation-duration: var(--beat-duration); animation-timing-function: linear; animation-fill-mode: both; animation-iteration-count: 1; }

/* ---- story: keyframes baked from the design's pose function (see the bottom of this block) ---- */
.b3 .sd-cam-far { animation-name: sd-cam-far; }
.b3 .sd-cam-mid { animation-name: sd-cam-mid; }
.b3 .sd-cam-fig { animation-name: sd-cam-fig; }
.b3 .sd-cam-near { animation-name: sd-cam-near; }
.b3 .sd-j-thigh { animation-name: sd-j-thigh; }
.b3 .sd-j-shin { animation-name: sd-j-shin; }
.b3 .sd-j-bthigh { animation-name: sd-j-bthigh; }
.b3 .sd-j-bshin { animation-name: sd-j-bshin; }
.b3 .sd-j-cloak { animation-name: sd-j-cloak; }
.b3 .sd-j-torso { animation-name: sd-j-torso; }
.b3 .sd-j-head { animation-name: sd-j-head; }
.b3 .sd-j-arm { animation-name: sd-j-arm; }
.b3 .sd-j-fore { animation-name: sd-j-fore; }
.b3 .sd-j-farm { animation-name: sd-j-farm; }
.b3 .sd-j-ffore { animation-name: sd-j-ffore; }
.b3 .sd-boy { animation: sd-boy-move var(--story-ms) linear both, sd-boy-fade var(--story-ms) linear both; }
/* the rim copy is off as soon as the boy starts to fade, so no pale ghost is left behind */
.b3 .sd-boy.is-rim { animation: sd-boy-move var(--story-ms) linear both, sd-boy-rim var(--story-ms) linear both; }
.b3 .sd-boy-bob { animation-name: sd-boy-bob; }
.b3 .sd-boy-l { animation-name: sd-boy-turn-l; }
.b3 .sd-boy-r { animation-name: sd-boy-turn-r; }
.b3 .sd-legf { animation-name: sd-boy-legf; transform-origin: 14px -82px; }
.b3 .sd-legb { animation-name: sd-boy-legb; transform-origin: -14px -82px; }
.b3 .sd-boy-arm { animation-name: sd-boy-arm; }
.b3 .sd-look { animation-name: sd-boy-look; }
.b3 .sd-ship-depart { animation-name: sd-ship-depart; }
.b3 :deep(.ship-sail) { animation: sd-sail var(--ship-ms) linear both; }
.b3 :deep(.ship-oar) { animation: sd-oar var(--ship-ms) linear both; }
.b3 .sd-dark { animation-name: sd-dark; }
/* the end: the camera turns with the ship, out to sea. The shore and the jarl slide away to the bottom left, the
   burning homeland out to the left (nearer layers faster); the ship and the sea keep their place. The pan is still
   moving when the beat ends (the homeland, out of the frame by then, at about 280 units/s in English), and the
   ravens scene goes on with it at that speed. It starts as the ship pulls out (70 %).
   The horizon fog thins away during the turn; the ravens scene's own fog comes up slowly. */
.b3 .sd-hz-out { animation: sd-hz-out var(--beat-duration) linear both; }
@keyframes sd-hz-out { 0%, 70% { opacity: .42; } 100% { opacity: 0; } }
.b3 .sd-pan-far, .b3 .sd-pan-shore, .b3 .sd-pan-fig, .b3 .sd-pan-near { animation-duration: var(--beat-duration); }
.b3 .sd-pan-far { animation-name: sd-pan-far; }
.b3 .sd-pan-shore { animation-name: sd-pan-shore; }
.b3 .sd-pan-fig { animation-name: sd-pan-fig; }
.b3 .sd-pan-near { animation-name: sd-pan-near; }
@keyframes sd-pan-far { 0%, 70% { transform: translate(0, 0); animation-timing-function: cubic-bezier(.45, 0, .7, .7); } 100% { transform: translate(-1000px, 0); } }
@keyframes sd-pan-shore { 0%, 70% { transform: translate(0, 0); animation-timing-function: cubic-bezier(.45, 0, .7, .7); } 100% { transform: translate(-1300px, 400px); } }
@keyframes sd-pan-fig { 0%, 70% { transform: translate(0, 0); animation-timing-function: cubic-bezier(.45, 0, .7, .7); } 100% { transform: translate(-1500px, 520px); } }
@keyframes sd-pan-near { 0%, 70% { transform: translate(0, 0); animation-timing-function: cubic-bezier(.45, 0, .7, .7); } 100% { transform: translate(-1800px, 620px); } }
/* the figures and the ship run on fixed times (see the keyframes below); the ship's run outlasts any beat */
.b3 { --story-ms: 11200ms; --ship-ms: 14000ms; }
.b3 .sd-j-thigh, .b3 .sd-j-shin, .b3 .sd-j-bthigh, .b3 .sd-j-bshin, .b3 .sd-j-cloak, .b3 .sd-j-torso, .b3 .sd-j-head, .b3 .sd-j-arm, .b3 .sd-j-fore, .b3 .sd-j-farm, .b3 .sd-j-ffore, .b3 .sd-boy-bob, .b3 .sd-boy-l, .b3 .sd-boy-r, .b3 .sd-legf, .b3 .sd-legb, .b3 .sd-boy-arm, .b3 .sd-look { animation-duration: var(--story-ms); }
.b3 .sd-ship-depart { animation-duration: var(--ship-ms); }

/* ---- ambient loops ---- */
/* sines as alternating ease-in-outs (see sineLoop.ts) */
.b3 .sd-sway { animation: sd-sway var(--p) cubic-bezier(0.37, 0, 0.63, 1) var(--o) infinite alternate; }
@keyframes sd-sway { from { transform: translateX(calc(var(--a) * -1)); } to { transform: translateX(var(--a)); } }
.b3 .sd-glint { animation: sd-glint var(--p) cubic-bezier(0.37, 0, 0.63, 1) var(--o) infinite alternate; }
@keyframes sd-glint { from { transform: translateX(-26px); } to { transform: translateX(26px); } }
/* the longship in the sending's dusk: a dark silhouette with a fire-lit sail */
.b3 .sd-longship {
  --ship-steer: #0e1318; --ship-rig: #0e1318; --ship-mast: #0e1318; --ship-hull: #0e1318; --ship-boss: #0e1318; --ship-oar: #0e1318;
  --ship-sail: #6b4a41; --ship-stripe: #4a3530; --ship-crew: #0b1015; --ship-rower: #0b1015; --ship-shield-a: #27313b; --ship-shield-b: #1e262e;
  --ship-cloak: #0b1015;
}
/* the boy boards: as he fades into the shore mist (sd-boy-fade, 74-79 % of the story) he fades in at the prow, a
   moment later */
.b3 :deep(.ship-boy) { animation: sd-boy-board var(--story-ms) linear both; }
@keyframes sd-boy-board { 0%, 76% { opacity: 0; } 82%, 100% { opacity: 1; } }
/* the ship's swell: heave and a slow pitch around the stern */
.b3 .sd-heave { animation: sd-heave 1963ms cubic-bezier(0.37, 0, 0.63, 1) -982ms infinite alternate; }
@keyframes sd-heave { from { transform: translateY(-2.2px); } to { transform: translateY(2.2px); } }
.b3 .sd-pitch { transform-origin: 1100px 850px; animation: sd-pitch 6042ms cubic-bezier(0.37, 0, 0.63, 1) -3021ms infinite alternate; }
@keyframes sd-pitch { from { transform: rotate(-0.9deg); } to { transform: rotate(0.9deg); } }
.b3 .sd-ember { animation: sd-ember 700ms ease-in-out calc(var(--i) * -230ms) infinite alternate; }
@keyframes sd-ember { from { opacity: 0.5; } to { opacity: 0.9; } }
/* smoke: the texture scrolls exactly one 512 tile up per loop, the second layer faster */
.b3 .sd-rise-a { animation: sd-rise 9000ms linear infinite; }
.b3 .sd-rise-b { animation: sd-rise 6500ms linear infinite; }
@keyframes sd-rise { from { transform: translateY(0); } to { transform: translateY(-512px); } }
/* fog bands drift one whole texture tile per loop: 14 units/s (horizon), 22 (shore, 768 tile).
   Each band is the view plus one tile wide, no more: every unit of it is rastered, on screen or not. */
.b3 .sd-fog-hz { animation: sd-fog-left 73143ms linear infinite; }
.b3 .sd-fog-shore { animation: sd-fog-right 34909ms linear infinite; }
@keyframes sd-fog-left { from { transform: translateX(0); } to { transform: translateX(-1024px); } }
@keyframes sd-fog-right { from { transform: translateX(0); } to { transform: translateX(768px); } }
/* ash falls through the frame (1640 units) and drifts left a third as fast */
.b3 .sd-ash { animation: sd-ash var(--d) linear var(--o) infinite; }
@keyframes sd-ash {
  from { transform: translate(var(--x0), -20px); }
  to { transform: translate(calc(var(--x0) - 492px), 1620px); }
}

/* ---- story keyframes, baked from the design's pose function: round 8 of the Jarl's Farewell artifact
   (https://claude.ai/artifact/8udeKmxfcsUUrXvdKKKwfb), sampled every 5 ms and reduced to the fewest keys
   that stay within 0.25 units / 0.25 deg / 0.005 opacity of it. Designed at 10 s; the beat now lasts as long as
   its voice clip (11.8 s English, 13.3 s German), so the story runs on fixed times instead: the jarl stands
   1.2 s longer before he kneels, the figures' tracks are percentages of --story-ms (10 s + 1.2 s), the ship's
   of --ship-ms (14 s: it keeps sailing, oars stroking, at its last speed however long the beat is). The camera and
   the fade from dark stay on --beat-duration. ---- */
@keyframes sd-cam-far {
  0% { transform: translate(0, 0) scale(1); } 10.1% { transform: translate(-0.46px, -0.47px) scale(1.0006); }
  21.15% { transform: translate(-1.84px, -1.89px) scale(1.0023); }
  34.3% { transform: translate(-4.36px, -4.46px) scale(1.0054); }
  62.7% { transform: translate(-10.98px, -11.26px) scale(1.0137); }
  75.1% { transform: translate(-13.52px, -13.86px) scale(1.0169); }
  88.25% { transform: translate(-15.39px, -15.77px) scale(1.0192); }
  100% { transform: translate(-16px, -16.4px) scale(1.02); }
}
@keyframes sd-cam-mid {
  0% { transform: translate(0, 0) scale(1); } 5.75% { transform: translate(-0.31px, -0.34px) scale(1.0004); }
  11.75% { transform: translate(-1.22px, -1.37px) scale(1.0015); }
  18.1% { transform: translate(-2.77px, -3.11px) scale(1.0035); }
  24.9% { transform: translate(-4.96px, -5.58px) scale(1.0062); }
  37.3% { transform: translate(-10.04px, -11.29px) scale(1.0125); }
  65.7% { transform: translate(-23.29px, -26.2px) scale(1.0291); }
  78.85% { transform: translate(-28.31px, -31.85px) scale(1.0354); }
  89.9% { transform: translate(-31.09px, -34.97px) scale(1.0389); }
  100% { transform: translate(-32px, -36px) scale(1.04); }
}
@keyframes sd-cam-fig {
  0% { transform: translate(0, 0) scale(1); } 5.75% { transform: translate(-0.53px, -0.67px) scale(1.0007); }
  11.75% { transform: translate(-2.14px, -2.67px) scale(1.0027); }
  18.1% { transform: translate(-4.84px, -6.05px) scale(1.006); }
  24.9% { transform: translate(-8.69px, -10.86px) scale(1.0109); }
  30.75% { transform: translate(-12.63px, -15.79px) scale(1.0158); }
  37.3% { transform: translate(-17.56px, -21.95px) scale(1.022); }
  65.7% { transform: translate(-40.75px, -50.94px) scale(1.0509); }
  72.6% { transform: translate(-45.69px, -57.11px) scale(1.0571); }
  78.85% { transform: translate(-49.54px, -61.93px) scale(1.0619); }
  84.5% { transform: translate(-52.38px, -65.48px) scale(1.0655); }
  89.9% { transform: translate(-54.4px, -68px) scale(1.068); }
  95.05% { transform: translate(-55.6px, -69.5px) scale(1.0695); }
  100% { transform: translate(-56px, -70px) scale(1.07); }
}
@keyframes sd-cam-near {
  0% { transform: translate(0, 0) scale(1); } 4.95% { transform: translate(-0.57px, -0.71px) scale(1.0007); }
  10.1% { transform: translate(-2.28px, -2.85px) scale(1.0029); }
  15.5% { transform: translate(-5.17px, -6.46px) scale(1.0065); }
  21.15% { transform: translate(-9.22px, -11.53px) scale(1.0115); }
  27.4% { transform: translate(-14.73px, -18.41px) scale(1.0184); }
  34.3% { transform: translate(-21.78px, -27.22px) scale(1.0272); }
  41.65% { transform: translate(-30.07px, -37.59px) scale(1.0376); }
  62.7% { transform: translate(-54.91px, -68.64px) scale(1.0686); }
  69.25% { transform: translate(-61.96px, -77.45px) scale(1.0774); }
  75.1% { transform: translate(-67.59px, -84.49px) scale(1.0845); }
  81.9% { transform: translate(-73.09px, -91.36px) scale(1.0914); }
  88.25% { transform: translate(-76.95px, -96.18px) scale(1.0962); }
  94.25% { transform: translate(-79.24px, -99.05px) scale(1.099); }
  100% { transform: translate(-80px, -100px) scale(1.1); }
}
@keyframes sd-j-thigh {
  0%, 10.71% { transform: translate(6px, -110px) rotate(90deg); }
  16.34% { transform: translate(6px, -109.95px) rotate(89.91deg); }
  17.23% { transform: translate(6px, -109.03px) rotate(88.39deg); }
  18.13% { transform: translate(6px, -107.09px) rotate(85.18deg); }
  18.71% { transform: translate(6px, -105.35px) rotate(82.31deg); }
  19.29% { transform: translate(6px, -103.29px) rotate(78.9deg); }
  19.91% { transform: translate(6px, -100.75px) rotate(74.7deg); }
  20.62% { transform: translate(6px, -97.52px) rotate(69.36deg); }
  21.88% { transform: translate(6px, -91.23px) rotate(58.95deg); }
  25.04% { transform: translate(6px, -74.22px) rotate(30.83deg); }
  25.94% { transform: translate(6px, -69.85px) rotate(23.6deg); }
  26.74% { transform: translate(6px, -66.31px) rotate(17.74deg); }
  27.63% { transform: translate(6px, -62.95px) rotate(12.18deg); }
  28.44% { transform: translate(6px, -60.56px) rotate(8.24deg); }
  29.2% { transform: translate(6px, -58.97px) rotate(5.61deg); }
  29.96% { transform: translate(6px, -58.12px) rotate(4.2deg); }
  100% { transform: translate(6px, -58px) rotate(4deg); }
}
@keyframes sd-j-shin {
  0%, 10.71% { transform: translate(55px, 0) rotate(0); }
  16.34% { transform: translate(55px, 0) rotate(0.09deg); }
  17.23% { transform: translate(55px, 0) rotate(1.57deg); }
  18.13% { transform: translate(55px, 0) rotate(4.71deg); }
  18.71% { transform: translate(55px, 0) rotate(7.51deg); }
  19.29% { transform: translate(55px, 0) rotate(10.84deg); }
  19.91% { transform: translate(55px, 0) rotate(14.94deg); }
  20.62% { transform: translate(55px, 0) rotate(20.16deg); }
  21.88% { transform: translate(55px, 0) rotate(30.33deg); }
  25.04% { transform: translate(55px, 0) rotate(57.79deg); }
  25.94% { transform: translate(55px, 0) rotate(64.86deg); }
  26.74% { transform: translate(55px, 0) rotate(70.58deg); }
  27.63% { transform: translate(55px, 0) rotate(76.01deg); }
  28.44% { transform: translate(55px, 0) rotate(79.86deg); }
  29.2% { transform: translate(55px, 0) rotate(82.43deg); }
  29.96% { transform: translate(55px, 0) rotate(83.8deg); }
  100% { transform: translate(55px, 0) rotate(84deg); }
}
@keyframes sd-j-bthigh {
  0%, 10.71% { transform: translate(-4px, -110px) rotate(90deg); }
  16.34% { transform: translate(-4px, -109.95px) rotate(90.01deg); }
  17.23% { transform: translate(-4px, -109.03px) rotate(90.26deg); }
  18.13% { transform: translate(-4px, -107.09px) rotate(90.78deg); }
  19.29% { transform: translate(-4px, -103.29px) rotate(91.81deg); }
  20.62% { transform: translate(-4px, -97.52px) rotate(93.36deg); }
  21.88% { transform: translate(-4px, -91.23px) rotate(95.05deg); }
  25.04% { transform: translate(-4px, -74.22px) rotate(99.63deg); }
  26.74% { transform: translate(-4px, -66.31px) rotate(101.76deg); }
  27.63% { transform: translate(-4px, -62.95px) rotate(102.67deg); }
  28.44% { transform: translate(-4px, -60.56px) rotate(103.31deg); }
  29.2% { transform: translate(-4px, -58.97px) rotate(103.74deg); }
  29.96% { transform: translate(-4px, -58.12px) rotate(103.97deg); }
  100% { transform: translate(-4px, -58px) rotate(104deg); }
}
@keyframes sd-j-bshin {
  0%, 10.71% { transform: translate(55px, 0) rotate(0); }
  16.34% { transform: translate(55px, 0) rotate(0.08deg); }
  17.23% { transform: translate(55px, 0) rotate(1.39deg); }
  18.13% { transform: translate(55px, 0) rotate(4.15deg); }
  19.29% { transform: translate(55px, 0) rotate(9.55deg); }
  20.62% { transform: translate(55px, 0) rotate(17.76deg); }
  21.88% { transform: translate(55px, 0) rotate(26.72deg); }
  25.04% { transform: translate(55px, 0) rotate(50.91deg); }
  25.94% { transform: translate(55px, 0) rotate(57.13deg); }
  26.74% { transform: translate(55px, 0) rotate(62.18deg); }
  27.63% { transform: translate(55px, 0) rotate(66.96deg); }
  28.44% { transform: translate(55px, 0) rotate(70.35deg); }
  29.2% { transform: translate(55px, 0) rotate(72.61deg); }
  29.96% { transform: translate(55px, 0) rotate(73.83deg); }
  100% { transform: translate(55px, 0) rotate(74deg); }
}
@keyframes sd-j-cloak {
  0%, 10.71% { transform: skewX(0) scale(1, 1); }
  16.34% { transform: skewX(-0.01deg) scale(1.0003, 0.9997); }
  17.23% { transform: skewX(-0.13deg) scale(1.0047, 0.9951); }
  18.13% { transform: skewX(-0.4deg) scale(1.014, 0.9854); }
  19.29% { transform: skewX(-0.93deg) scale(1.0323, 0.9664); }
  20.62% { transform: skewX(-1.73deg) scale(1.06, 0.9376); }
  21.88% { transform: skewX(-2.6deg) scale(1.0903, 0.9061); }
  25.04% { transform: skewX(-4.95deg) scale(1.172, 0.8211); }
  25.94% { transform: skewX(-5.56deg) scale(1.193, 0.7993); }
  26.74% { transform: skewX(-6.05deg) scale(1.2101, 0.7815); }
  27.63% { transform: skewX(-6.51deg) scale(1.2262, 0.7647); }
  28.44% { transform: skewX(-6.84deg) scale(1.2377, 0.7528); }
  29.2% { transform: skewX(-7.12deg) scale(1.2453, 0.7449); }
  29.96% { transform: skewX(-7.42deg) scale(1.2494, 0.7406); }
  35.22% { transform: skewX(-9.57deg) scale(1.25, 0.74); }
  46.43% { transform: skewX(-9.6deg) scale(1.25, 0.74); }
  50.85%, 100% { transform: skewX(-7.2deg) scale(1.25, 0.74); }
}
@keyframes sd-j-torso {
  0%, 10.71% { transform: translate(0, -110px) rotate(0); }
  16.34% { transform: translate(0, -109.95px) rotate(0.01deg); }
  17.23% { transform: translate(0, -109.03px) rotate(0.22deg); }
  18.13% { transform: translate(0, -107.09px) rotate(0.67deg); }
  19.29% { transform: translate(0, -103.29px) rotate(1.55deg); }
  20.62% { transform: translate(0, -97.52px) rotate(2.88deg); }
  21.88% { transform: translate(0, -91.23px) rotate(4.33deg); }
  25.04% { transform: translate(0, -74.22px) rotate(8.26deg); }
  26.74% { transform: translate(0, -66.31px) rotate(10.08deg); }
  27.63% { transform: translate(0, -62.95px) rotate(10.86deg); }
  28.44% { transform: translate(0, -60.56px) rotate(11.41deg); }
  29.2% { transform: translate(0, -58.97px) rotate(11.86deg); }
  29.96% { transform: translate(0, -58.12px) rotate(12.36deg); }
  33.71% { transform: translate(0, -58px) rotate(15.23deg); }
  35.22% { transform: translate(0, -58px) rotate(15.95deg); }
  46.43% { transform: translate(0, -58px) rotate(16deg); }
  47.37% { transform: translate(0, -58px) rotate(15.54deg); }
  49.78% { transform: translate(0, -58px) rotate(12.63deg); }
  50.85%, 100% { transform: translate(0, -58px) rotate(12deg); }
}
@keyframes sd-j-head {
  0%, 10.71% { transform: translate(4px, -96px) rotate(8deg); }
  18.21% { transform: translate(4px, -96px) rotate(8.12deg); }
  28.93% { transform: translate(4px, -96px) rotate(9.94deg); }
  37.59% { transform: translate(4px, -96px) rotate(10.02deg); }
  37.99% { transform: translate(4px, -96px) rotate(10.62deg); }
  38.39% { transform: translate(4px, -96px) rotate(11.88deg); }
  39.91% { transform: translate(4px, -96px) rotate(19.02deg); }
  40.49% { transform: translate(4px, -96px) rotate(21.15deg); }
  40.98% { transform: translate(4px, -96px) rotate(21.98deg); }
  42.01% { transform: translate(4px, -96px) rotate(21.99deg); }
  42.37% { transform: translate(4px, -96px) rotate(21.58deg); }
  42.77% { transform: translate(4px, -96px) rotate(20.45deg); }
  44.55% { transform: translate(4px, -96px) rotate(12.22deg); }
  44.96% { transform: translate(4px, -96px) rotate(10.85deg); }
  45.36% { transform: translate(4px, -96px) rotate(10.09deg); }
  57.28% { transform: translate(4px, -96px) rotate(10deg); }
  59.06% { transform: translate(4px, -96px) rotate(9.41deg); }
  62.01% { transform: translate(4px, -96px) rotate(6.77deg); }
  68.39% { transform: translate(4px, -96px) rotate(-0.72deg); }
  71.07% { transform: translate(4px, -96px) rotate(-4.57deg); }
  72.54% { transform: translate(4px, -96px) rotate(-5.83deg); }
  100% { transform: translate(4px, -96px) rotate(-6deg); }
}
@keyframes sd-j-arm {
  0%, 10.71% { transform: translate(8px, -80px) rotate(96deg); }
  28.88% { transform: translate(8px, -80px) rotate(95.82deg); }
  29.6% { transform: translate(8px, -80px) rotate(94.15deg); }
  30.36% { transform: translate(8px, -80px) rotate(90.89deg); }
  31.12% { transform: translate(8px, -80px) rotate(86.6deg); }
  33.17% { transform: translate(8px, -80px) rotate(73.65deg); }
  33.79% { transform: translate(8px, -80px) rotate(70.29deg); }
  34.33% { transform: translate(8px, -80px) rotate(67.94deg); }
  34.82% { transform: translate(8px, -80px) rotate(66.32deg); }
  35.27% { transform: translate(8px, -80px) rotate(65.4deg); }
  37.19% { transform: translate(8px, -80px) rotate(63.86deg); }
  38.71% { transform: translate(8px, -80px) rotate(65.06deg); }
  40% { transform: translate(8px, -80px) rotate(63.89deg); }
  40.67% { transform: translate(8px, -80px) rotate(64.05deg); }
  41.65% { transform: translate(8px, -80px) rotate(65.06deg); }
  42.63% { transform: translate(8px, -80px) rotate(64.07deg); }
  43.26% { transform: translate(8px, -80px) rotate(63.87deg); }
  44.64%, 46.43% { transform: translate(8px, -80px) rotate(65.07deg); }
  46.7% { transform: translate(8px, -80px) rotate(65.37deg); }
  47.19% { transform: translate(8px, -80px) rotate(67.31deg); }
  47.72% { transform: translate(8px, -80px) rotate(71.05deg); }
  48.26% { transform: translate(8px, -80px) rotate(75.95deg); }
  49.38% { transform: translate(8px, -80px) rotate(87.3deg); }
  49.91% { transform: translate(8px, -80px) rotate(91.94deg); }
  50.36% { transform: translate(8px, -80px) rotate(94.69deg); }
  50.8% { transform: translate(8px, -80px) rotate(95.96deg); }
  67.9% { transform: translate(8px, -80px) rotate(95.97deg); }
  68.04% { transform: translate(8px, -80px) rotate(95.49deg); }
  68.17% { transform: translate(8px, -80px) rotate(94.45deg); }
  68.44% { transform: translate(8px, -80px) rotate(90.84deg); }
  68.57% { transform: translate(8px, -80px) rotate(88.32deg); }
  68.75% { transform: translate(8px, -80px) rotate(84.3deg); }
  69.06% { transform: translate(8px, -80px) rotate(75.6deg); }
  69.38% { transform: translate(8px, -80px) rotate(65.14deg); }
  69.73% { transform: translate(8px, -80px) rotate(51.48deg); }
  70.13% { transform: translate(8px, -80px) rotate(34.64deg); }
  71.16% { transform: translate(8px, -80px) rotate(-10.15deg); }
  71.47% { transform: translate(8px, -80px) rotate(-22.78deg); }
  71.79% { transform: translate(8px, -80px) rotate(-34.29deg); }
  72.1% { transform: translate(8px, -80px) rotate(-44.28deg); }
  72.28% { transform: translate(8px, -80px) rotate(-49.18deg); }
  72.41% { transform: translate(8px, -80px) rotate(-52.39deg); }
  72.59% { transform: translate(8px, -80px) rotate(-55.95deg); }
  72.72% { transform: translate(8px, -80px) rotate(-58.04deg); }
  72.86% { transform: translate(8px, -80px) rotate(-59.61deg); }
  72.99% { transform: translate(8px, -80px) rotate(-60.62deg); }
  73.17% { transform: translate(8px, -80px) rotate(-61.08deg); }
  74.2% { transform: translate(8px, -80px) rotate(-59.23deg); }
  74.82% { transform: translate(8px, -80px) rotate(-59.18deg); }
  75.18% { transform: translate(8px, -80px) rotate(-59.99deg); }
  76.61% { transform: translate(8px, -80px) rotate(-64.81deg); }
  77.05% { transform: translate(8px, -80px) rotate(-65.71deg); }
  77.46% { transform: translate(8px, -80px) rotate(-66deg); }
  77.86% { transform: translate(8px, -80px) rotate(-65.75deg); }
  78.26% { transform: translate(8px, -80px) rotate(-65.01deg); }
  80% { transform: translate(8px, -80px) rotate(-59.3deg); }
  80.45% { transform: translate(8px, -80px) rotate(-58.35deg); }
  80.85% { transform: translate(8px, -80px) rotate(-58.01deg); }
  81.25% { transform: translate(8px, -80px) rotate(-58.2deg); }
  81.65% { transform: translate(8px, -80px) rotate(-58.89deg); }
  83.39% { transform: translate(8px, -80px) rotate(-64.59deg); }
  83.84% { transform: translate(8px, -80px) rotate(-65.59deg); }
  84.2% { transform: translate(8px, -80px) rotate(-65.91deg); }
  84.96% { transform: translate(8px, -80px) rotate(-65.19deg); }
  86.74% { transform: translate(8px, -80px) rotate(-60.03deg); }
  87.59% { transform: translate(8px, -80px) rotate(-58.87deg); }
  88.39% { transform: translate(8px, -80px) rotate(-59.47deg); }
  90.13% { transform: translate(8px, -80px) rotate(-63.45deg); }
  90.98% { transform: translate(8px, -80px) rotate(-64.37deg); }
  91.79% { transform: translate(8px, -80px) rotate(-63.94deg); }
  93.44% { transform: translate(8px, -80px) rotate(-61.16deg); }
  94.29% { transform: translate(8px, -80px) rotate(-60.41deg); }
  95.13% { transform: translate(8px, -80px) rotate(-60.66deg); }
  96.96% { transform: translate(8px, -80px) rotate(-62.63deg); }
  97.86% { transform: translate(8px, -80px) rotate(-63.18deg); }
  98.79% { transform: translate(8px, -80px) rotate(-62.95deg); }
  100% { transform: translate(8px, -80px) rotate(-61.78deg); }
}
@keyframes sd-j-fore {
  0%, 10.71%, 28.57% { transform: translate(46px, 0) rotate(-6deg); }
  28.97% { transform: translate(46px, 0) rotate(-6.67deg); }
  29.38% { transform: translate(46px, 0) rotate(-8.64deg); }
  29.78% { transform: translate(46px, 0) rotate(-11.79deg); }
  30.22% { transform: translate(46px, 0) rotate(-16.5deg); }
  30.71% { transform: translate(46px, 0) rotate(-22.9deg); }
  31.12% { transform: translate(46px, 0) rotate(-28.93deg); }
  31.56% { transform: translate(46px, 0) rotate(-36.3deg); }
  32.99% { transform: translate(46px, 0) rotate(-61.92deg); }
  33.53% { transform: translate(46px, 0) rotate(-71.1deg); }
  34.06% { transform: translate(46px, 0) rotate(-79.24deg); }
  34.51% { transform: translate(46px, 0) rotate(-84.86deg); }
  34.91% { transform: translate(46px, 0) rotate(-88.72deg); }
  35.31% { transform: translate(46px, 0) rotate(-91.19deg); }
  35.71% { transform: translate(46px, 0) rotate(-92.07deg); }
  36.52% { transform: translate(46px, 0) rotate(-95.25deg); }
  37.1% { transform: translate(46px, 0) rotate(-96.23deg); }
  37.46% { transform: translate(46px, 0) rotate(-96.11deg); }
  37.81% { transform: translate(46px, 0) rotate(-95.45deg); }
  38.71% { transform: translate(46px, 0) rotate(-92.14deg); }
  39.38% { transform: translate(46px, 0) rotate(-94.88deg); }
  39.96% { transform: translate(46px, 0) rotate(-96.14deg); }
  40.31% { transform: translate(46px, 0) rotate(-96.21deg); }
  40.71% { transform: translate(46px, 0) rotate(-95.63deg); }
  41.12% { transform: translate(46px, 0) rotate(-94.42deg); }
  41.65% { transform: translate(46px, 0) rotate(-92.14deg); }
  42.5% { transform: translate(46px, 0) rotate(-95.33deg); }
  43.17% { transform: translate(46px, 0) rotate(-96.25deg); }
  43.84% { transform: translate(46px, 0) rotate(-95.25deg); }
  44.64%, 46.43% { transform: translate(46px, 0) rotate(-92.07deg); }
  46.65% { transform: translate(46px, 0) rotate(-91.37deg); }
  46.83% { transform: translate(46px, 0) rotate(-89.88deg); }
  47.05% { transform: translate(46px, 0) rotate(-86.99deg); }
  47.28% { transform: translate(46px, 0) rotate(-83.09deg); }
  47.54% { transform: translate(46px, 0) rotate(-77.33deg); }
  47.99% { transform: translate(46px, 0) rotate(-65.83deg); }
  48.84% { transform: translate(46px, 0) rotate(-41.44deg); }
  49.15% { transform: translate(46px, 0) rotate(-32.84deg); }
  49.46% { transform: translate(46px, 0) rotate(-24.97deg); }
  49.73% { transform: translate(46px, 0) rotate(-19.03deg); }
  50.04% { transform: translate(46px, 0) rotate(-13.28deg); }
  50.31% { transform: translate(46px, 0) rotate(-9.54deg); }
  50.58% { transform: translate(46px, 0) rotate(-7.07deg); }
  50.85% { transform: translate(46px, 0) rotate(-6.02deg); }
  67.86% { transform: translate(46px, 0) rotate(-6deg); }
  68.17% { transform: translate(46px, 0) rotate(-6.33deg); }
  68.71% { transform: translate(46px, 0) rotate(-8.29deg); }
  69.29% { transform: translate(46px, 0) rotate(-11.96deg); }
  69.87% { transform: translate(46px, 0) rotate(-16.76deg); }
  71.52% { transform: translate(46px, 0) rotate(-31.93deg); }
  72.05% { transform: translate(46px, 0) rotate(-35.9deg); }
  72.46%, 72.72% { transform: translate(46px, 0) rotate(-38.01deg); }
  72.99% { transform: translate(46px, 0) rotate(-36.67deg); }
  73.21% { transform: translate(46px, 0) rotate(-34.65deg); }
  73.88% { transform: translate(46px, 0) rotate(-27.29deg); }
  74.24% { transform: translate(46px, 0) rotate(-24.5deg); }
  74.55% { transform: translate(46px, 0) rotate(-23.66deg); }
  74.82% { transform: translate(46px, 0) rotate(-24.51deg); }
  75% { transform: translate(46px, 0) rotate(-25.98deg); }
  75.18% { transform: translate(46px, 0) rotate(-28.92deg); }
  76.21% { transform: translate(46px, 0) rotate(-48.8deg); }
  76.61% { transform: translate(46px, 0) rotate(-55.46deg); }
  76.83% { transform: translate(46px, 0) rotate(-58.31deg); }
  77.05% { transform: translate(46px, 0) rotate(-60.4deg); }
  77.28% { transform: translate(46px, 0) rotate(-61.65deg); }
  77.46% { transform: translate(46px, 0) rotate(-62deg); }
  77.63% { transform: translate(46px, 0) rotate(-61.76deg); }
  77.86% { transform: translate(46px, 0) rotate(-60.65deg); }
  78.04% { transform: translate(46px, 0) rotate(-59.14deg); }
  78.26% { transform: translate(46px, 0) rotate(-56.55deg); }
  78.48% { transform: translate(46px, 0) rotate(-53.26deg); }
  78.71% { transform: translate(46px, 0) rotate(-49.43deg); }
  79.6% { transform: translate(46px, 0) rotate(-31.97deg); }
  80% { transform: translate(46px, 0) rotate(-25.14deg); }
  80.22% { transform: translate(46px, 0) rotate(-22.16deg); }
  80.45% { transform: translate(46px, 0) rotate(-19.92deg); }
  80.67% { transform: translate(46px, 0) rotate(-18.51deg); }
  80.85% { transform: translate(46px, 0) rotate(-18.03deg); }
  81.03% { transform: translate(46px, 0) rotate(-18.13deg); }
  81.25% { transform: translate(46px, 0) rotate(-19.08deg); }
  81.43% { transform: translate(46px, 0) rotate(-20.46deg); }
  81.65% { transform: translate(46px, 0) rotate(-22.92deg); }
  81.88% { transform: translate(46px, 0) rotate(-26.08deg); }
  82.1% { transform: translate(46px, 0) rotate(-29.83deg); }
  83.04% { transform: translate(46px, 0) rotate(-48.1deg); }
  83.39% { transform: translate(46px, 0) rotate(-54.24deg); }
  83.62% { transform: translate(46px, 0) rotate(-57.34deg); }
  83.84% { transform: translate(46px, 0) rotate(-59.73deg); }
  84.02% { transform: translate(46px, 0) rotate(-60.94deg); }
  84.2% { transform: translate(46px, 0) rotate(-61.48deg); }
  84.38% { transform: translate(46px, 0) rotate(-61.44deg); }
  84.55% { transform: translate(46px, 0) rotate(-60.83deg); }
  84.73% { transform: translate(46px, 0) rotate(-59.68deg); }
  84.96% { transform: translate(46px, 0) rotate(-57.54deg); }
  85.18% { transform: translate(46px, 0) rotate(-54.74deg); }
  85.4% { transform: translate(46px, 0) rotate(-51.4deg); }
  86.34% { transform: translate(46px, 0) rotate(-35.15deg); }
  86.74% { transform: translate(46px, 0) rotate(-29.15deg); }
  86.96% { transform: translate(46px, 0) rotate(-26.53deg); }
  87.19% { transform: translate(46px, 0) rotate(-24.55deg); }
  87.41% { transform: translate(46px, 0) rotate(-23.26deg); }
  87.59% { transform: translate(46px, 0) rotate(-22.76deg); }
  87.77% { transform: translate(46px, 0) rotate(-22.73deg); }
  87.99% { transform: translate(46px, 0) rotate(-23.34deg); }
  88.39% { transform: translate(46px, 0) rotate(-26.07deg); }
  88.79% { transform: translate(46px, 0) rotate(-30.47deg); }
  89.73% { transform: translate(46px, 0) rotate(-43.24deg); }
  90.13% { transform: translate(46px, 0) rotate(-47.96deg); }
  90.58% { transform: translate(46px, 0) rotate(-51.59deg); }
  90.98% { transform: translate(46px, 0) rotate(-53.02deg); }
  91.38% { transform: translate(46px, 0) rotate(-52.65deg); }
  91.79% { transform: translate(46px, 0) rotate(-50.64deg); }
  92.19% { transform: translate(46px, 0) rotate(-47.39deg); }
  93.04% { transform: translate(46px, 0) rotate(-38.92deg); }
  93.44% { transform: translate(46px, 0) rotate(-35.36deg); }
  93.88% { transform: translate(46px, 0) rotate(-32.52deg); }
  94.29% { transform: translate(46px, 0) rotate(-31.25deg); }
  94.69% { transform: translate(46px, 0) rotate(-31.26deg); }
  95.13% { transform: translate(46px, 0) rotate(-32.62deg); }
  95.54% { transform: translate(46px, 0) rotate(-34.73deg); }
  96.96% { transform: translate(46px, 0) rotate(-43.47deg); }
  97.41% { transform: translate(46px, 0) rotate(-45.41deg); }
  97.86% { transform: translate(46px, 0) rotate(-46.47deg); }
  98.3% { transform: translate(46px, 0) rotate(-46.46deg); }
  98.79% { transform: translate(46px, 0) rotate(-45.23deg); }
  99.29% { transform: translate(46px, 0) rotate(-42.96deg); }
  100% { transform: translate(46px, 0) rotate(-38.76deg); }
}
@keyframes sd-j-farm {
  0%, 10.71% { transform: translate(-4px, -86px) rotate(101.52deg); }
  16.38% { transform: translate(-4px, -86px) rotate(101.53deg); }
  18.35% { transform: translate(-4px, -86px) rotate(102.28deg); }
  20.76% { transform: translate(-4px, -86px) rotate(104.31deg); }
  27.05% { transform: translate(-4px, -86px) rotate(111.05deg); }
  30.85% { transform: translate(-4px, -86px) rotate(113.67deg); }
  34.06% { transform: translate(-4px, -86px) rotate(116.49deg); }
  35.49% { transform: translate(-4px, -86px) rotate(117.15deg); }
  46.65% { transform: translate(-4px, -86px) rotate(117.12deg); }
  47.54% { transform: translate(-4px, -86px) rotate(116.39deg); }
  49.78% { transform: translate(-4px, -86px) rotate(113.32deg); }
  50.85%, 100% { transform: translate(-4px, -86px) rotate(112.67deg); }
}
@keyframes sd-j-ffore {
  0%, 10.71% { transform: translate(40px, 0) rotate(110.48deg); }
  16.47% { transform: translate(40px, 0) rotate(110.41deg); }
  17.59% { transform: translate(40px, 0) rotate(109.57deg); }
  18.79% { transform: translate(40px, 0) rotate(107.7deg); }
  20% { transform: translate(40px, 0) rotate(105.01deg); }
  21.34% { transform: translate(40px, 0) rotate(101.25deg); }
  25.71% { transform: translate(40px, 0) rotate(86.45deg); }
  27.23% { transform: translate(40px, 0) rotate(81.88deg); }
  30.85% { transform: translate(40px, 0) rotate(74.01deg); }
  34.02% { transform: translate(40px, 0) rotate(65.23deg); }
  34.78% { transform: translate(40px, 0) rotate(63.79deg); }
  35.49% { transform: translate(40px, 0) rotate(63.11deg); }
  46.65% { transform: translate(40px, 0) rotate(63.18deg); }
  47.1% { transform: translate(40px, 0) rotate(64deg); }
  47.59% { transform: translate(40px, 0) rotate(65.61deg); }
  49.2% { transform: translate(40px, 0) rotate(72.88deg); }
  49.78% { transform: translate(40px, 0) rotate(75.13deg); }
  50.36% { transform: translate(40px, 0) rotate(76.67deg); }
  50.85%, 100% { transform: translate(40px, 0) rotate(77.19deg); }
}
@keyframes sd-boy-move {
  0%, 10.71%, 54.46% { transform: translate(800px, 1166px) scale(1); }
  78.57%, 100% { transform: translate(1062px, 976px) scale(0.5); }
}
@keyframes sd-boy-bob {
  0%, 10.71%, 54.46% { transform: translate(0, 0); }
  54.87% { transform: translate(0, -1.1px); }
  55.8% { transform: translate(0, -5px); }
  56.34% { transform: translate(0, -3.91px); }
  57.1% { transform: translate(0, -0.05px); }
  57.81% { transform: translate(0, -3.8px); }
  58.13% { transform: translate(0, -4.73px); }
  58.39% { transform: translate(0, -5px); }
  58.66% { transform: translate(0, -4.76px); }
  58.97% { transform: translate(0, -3.88px); }
  59.73% { transform: translate(0, -0.09px); }
  60.45% { transform: translate(0, -3.83px); }
  60.76% { transform: translate(0, -4.74px); }
  61.03% { transform: translate(0, -5px); }
  61.29% { transform: translate(0, -4.75px); }
  61.61% { transform: translate(0, -3.85px); }
  62.32% { transform: translate(0, -0.13px); }
  63.21% { transform: translate(0, -4.32px); }
  63.53% { transform: translate(0, -4.94px); }
  63.84% { transform: translate(0, -4.88px); }
  64.33% { transform: translate(0, -3.46px); }
  64.96% { transform: translate(0, -0.08px); }
  65.76% { transform: translate(0, -4.05px); }
  66.07% { transform: translate(0, -4.84px); }
  66.38% { transform: translate(0, -4.96px); }
  66.92% { transform: translate(0, -3.61px); }
  67.59% { transform: translate(0, -0.03px); }
  68.39% { transform: translate(0, -4.08px); }
  68.71% { transform: translate(0, -4.85px); }
  68.97% { transform: translate(0, -4.98px); }
  69.51% { transform: translate(0, -3.76px); }
  70.22% { transform: translate(0, -0.02px); }
  70.85% { transform: translate(0, -3.41px); }
  71.34% { transform: translate(0, -4.87px); }
  71.65% { transform: translate(0, -4.95px); }
  72.01% { transform: translate(0, -4.21px); }
  72.32% { transform: translate(0, -2.94px); }
  72.86% { transform: translate(0, -0.06px); }
  73.62% { transform: translate(0, -3.98px); }
  73.93% { transform: translate(0, -4.81px); }
  74.2% { transform: translate(0, -5px); }
  74.73% { transform: translate(0, -3.87px); }
  75.49% { transform: translate(0, -0.11px); }
  76.21% { transform: translate(0, -3.84px); }
  76.52% { transform: translate(0, -4.75px); }
  76.79% { transform: translate(0, -5px); }
  77.72% { transform: translate(0, -1.03px); }
  78.08% { transform: translate(0, -0.03px); }
  100% { transform: translate(0, 0); }
}
@keyframes sd-boy-fade {
  0%, 10.71%, 74.2% { opacity: 1; }
  74.24% { opacity: 0.9979; }
  78.57%, 100% { opacity: 0; }
}
@keyframes sd-boy-turn-l {
  0%, 10.71%, 51.79% { opacity: 1; }
  54.02%, 100% { opacity: 0; }
}
@keyframes sd-boy-turn-r {
  0%, 10.71%, 51.79% { opacity: 0; }
  54.02%, 100% { opacity: 1; }
}
@keyframes sd-boy-legf {
  0%, 10.71%, 54.02% { transform: rotate(0); }
  54.24% { transform: rotate(-0.66deg); }
  54.51% { transform: rotate(0.29deg); }
  54.78% { transform: rotate(3.1deg); }
  55% { transform: rotate(6.58deg); }
  55.54% { transform: rotate(16.29deg); }
  55.8% { transform: rotate(19.99deg); }
  55.94% { transform: rotate(19.63deg); }
  56.12% { transform: rotate(18.38deg); }
  56.29% { transform: rotate(16.29deg); }
  56.47% { transform: rotate(13.46deg); }
  56.79% { transform: rotate(7.13deg); }
  57.46% { transform: rotate(-8.46deg); }
  57.63% { transform: rotate(-12.11deg); }
  57.81% { transform: rotate(-15.21deg); }
  57.99% { transform: rotate(-17.62deg); }
  58.13% { transform: rotate(-18.9deg); }
  58.3% { transform: rotate(-19.86deg); }
  58.44% { transform: rotate(-19.98deg); }
  58.57% { transform: rotate(-19.6deg); }
  58.75% { transform: rotate(-18.3deg); }
  58.93% { transform: rotate(-16.18deg); }
  59.11% { transform: rotate(-13.32deg); }
  59.42% { transform: rotate(-6.95deg); }
  60.09% { transform: rotate(8.63deg); }
  60.27% { transform: rotate(12.26deg); }
  60.45% { transform: rotate(15.33deg); }
  60.63% { transform: rotate(17.7deg); }
  60.76% { transform: rotate(18.96deg); }
  60.89% { transform: rotate(19.73deg); }
  61.03% { transform: rotate(20deg); }
  61.16% { transform: rotate(19.75deg); }
  61.34% { transform: rotate(18.64deg); }
  61.52% { transform: rotate(16.68deg); }
  61.7% { transform: rotate(13.96deg); }
  62.01% { transform: rotate(7.77deg); }
  62.72% { transform: rotate(-8.8deg); }
  62.9% { transform: rotate(-12.41deg); }
  63.08% { transform: rotate(-15.45deg); }
  63.26% { transform: rotate(-17.79deg); }
  63.39% { transform: rotate(-19.02deg); }
  63.53% { transform: rotate(-19.76deg); }
  63.66% { transform: rotate(-20deg); }
  63.79% { transform: rotate(-19.72deg); }
  63.97% { transform: rotate(-18.57deg); }
  64.15% { transform: rotate(-16.58deg); }
  64.33% { transform: rotate(-13.83deg); }
  64.64% { transform: rotate(-7.6deg); }
  65.36% { transform: rotate(8.97deg); }
  65.54% { transform: rotate(12.55deg); }
  65.71% { transform: rotate(15.57deg); }
  65.89% { transform: rotate(17.88deg); }
  66.03% { transform: rotate(19.08deg); }
  66.16% { transform: rotate(19.79deg); }
  66.29% { transform: rotate(20deg); }
  66.43% { transform: rotate(19.69deg); }
  66.61% { transform: rotate(18.5deg); }
  66.79% { transform: rotate(16.47deg); }
  66.96% { transform: rotate(13.69deg); }
  67.28% { transform: rotate(7.42deg); }
  67.99% { transform: rotate(-9.14deg); }
  68.17% { transform: rotate(-12.7deg); }
  68.35% { transform: rotate(-15.69deg); }
  68.53% { transform: rotate(-17.96deg); }
  68.66% { transform: rotate(-19.13deg); }
  68.79% { transform: rotate(-19.82deg); }
  68.93% { transform: rotate(-19.99deg); }
  69.06% { transform: rotate(-19.66deg); }
  69.24% { transform: rotate(-18.43deg); }
  69.42% { transform: rotate(-16.36deg); }
  69.6% { transform: rotate(-13.55deg); }
  69.91% { transform: rotate(-7.25deg); }
  70.62% { transform: rotate(9.3deg); }
  70.94% { transform: rotate(15.13deg); }
  71.12% { transform: rotate(17.56deg); }
  71.25% { transform: rotate(18.86deg); }
  71.43% { transform: rotate(19.84deg); }
  71.56% { transform: rotate(19.99deg); }
  71.7% { transform: rotate(19.62deg); }
  71.88% { transform: rotate(18.36deg); }
  72.05% { transform: rotate(16.25deg); }
  72.23% { transform: rotate(13.41deg); }
  72.54% { transform: rotate(7.07deg); }
  73.21% { transform: rotate(-8.52deg); }
  73.39% { transform: rotate(-12.16deg); }
  73.57% { transform: rotate(-15.25deg); }
  73.75% { transform: rotate(-17.65deg); }
  73.88% { transform: rotate(-18.92deg); }
  74.02% { transform: rotate(-19.71deg); }
  74.15% { transform: rotate(-20deg); }
  74.29% { transform: rotate(-19.77deg); }
  74.42% { transform: rotate(-19.04deg); }
  74.55% { transform: rotate(-17.82deg); }
  74.73% { transform: rotate(-15.49deg); }
  74.91% { transform: rotate(-12.46deg); }
  75.09% { transform: rotate(-8.86deg); }
  75.8% { transform: rotate(7.71deg); }
  76.12% { transform: rotate(13.92deg); }
  76.29% { transform: rotate(16.65deg); }
  76.47% { transform: rotate(18.62deg); }
  76.65% { transform: rotate(19.74deg); }
  76.79% { transform: rotate(20deg); }
  77.05% { transform: rotate(16.13deg); }
  77.54% { transform: rotate(7.08deg); }
  77.81% { transform: rotate(2.85deg); }
  78.08% { transform: rotate(0.12deg); }
  78.3% { transform: rotate(-0.73deg); }
  78.57%, 100% { transform: rotate(0); }
}
@keyframes sd-boy-legb {
  0%, 10.71%, 54.02% { transform: rotate(0); }
  54.24% { transform: rotate(0.66deg); }
  54.51% { transform: rotate(-0.29deg); }
  54.78% { transform: rotate(-3.1deg); }
  55% { transform: rotate(-6.58deg); }
  55.54% { transform: rotate(-16.29deg); }
  55.8% { transform: rotate(-19.99deg); }
  55.94% { transform: rotate(-19.63deg); }
  56.12% { transform: rotate(-18.38deg); }
  56.29% { transform: rotate(-16.29deg); }
  56.47% { transform: rotate(-13.46deg); }
  56.79% { transform: rotate(-7.13deg); }
  57.46% { transform: rotate(8.46deg); }
  57.63% { transform: rotate(12.11deg); }
  57.81% { transform: rotate(15.21deg); }
  57.99% { transform: rotate(17.62deg); }
  58.13% { transform: rotate(18.9deg); }
  58.3% { transform: rotate(19.86deg); }
  58.44% { transform: rotate(19.98deg); }
  58.57% { transform: rotate(19.6deg); }
  58.75% { transform: rotate(18.3deg); }
  58.93% { transform: rotate(16.18deg); }
  59.11% { transform: rotate(13.32deg); }
  59.42% { transform: rotate(6.95deg); }
  60.09% { transform: rotate(-8.63deg); }
  60.27% { transform: rotate(-12.26deg); }
  60.45% { transform: rotate(-15.33deg); }
  60.63% { transform: rotate(-17.7deg); }
  60.76% { transform: rotate(-18.96deg); }
  60.89% { transform: rotate(-19.73deg); }
  61.03% { transform: rotate(-20deg); }
  61.16% { transform: rotate(-19.75deg); }
  61.34% { transform: rotate(-18.64deg); }
  61.52% { transform: rotate(-16.68deg); }
  61.7% { transform: rotate(-13.96deg); }
  62.01% { transform: rotate(-7.77deg); }
  62.72% { transform: rotate(8.8deg); }
  62.9% { transform: rotate(12.41deg); }
  63.08% { transform: rotate(15.45deg); }
  63.26% { transform: rotate(17.79deg); }
  63.39% { transform: rotate(19.02deg); }
  63.53% { transform: rotate(19.76deg); }
  63.66% { transform: rotate(20deg); }
  63.79% { transform: rotate(19.72deg); }
  63.97% { transform: rotate(18.57deg); }
  64.15% { transform: rotate(16.58deg); }
  64.33% { transform: rotate(13.83deg); }
  64.64% { transform: rotate(7.6deg); }
  65.36% { transform: rotate(-8.97deg); }
  65.54% { transform: rotate(-12.55deg); }
  65.71% { transform: rotate(-15.57deg); }
  65.89% { transform: rotate(-17.88deg); }
  66.03% { transform: rotate(-19.08deg); }
  66.16% { transform: rotate(-19.79deg); }
  66.29% { transform: rotate(-20deg); }
  66.43% { transform: rotate(-19.69deg); }
  66.61% { transform: rotate(-18.5deg); }
  66.79% { transform: rotate(-16.47deg); }
  66.96% { transform: rotate(-13.69deg); }
  67.28% { transform: rotate(-7.42deg); }
  67.99% { transform: rotate(9.14deg); }
  68.17% { transform: rotate(12.7deg); }
  68.35% { transform: rotate(15.69deg); }
  68.53% { transform: rotate(17.96deg); }
  68.66% { transform: rotate(19.13deg); }
  68.79% { transform: rotate(19.82deg); }
  68.93% { transform: rotate(19.99deg); }
  69.06% { transform: rotate(19.66deg); }
  69.24% { transform: rotate(18.43deg); }
  69.42% { transform: rotate(16.36deg); }
  69.6% { transform: rotate(13.55deg); }
  69.91% { transform: rotate(7.25deg); }
  70.62% { transform: rotate(-9.3deg); }
  70.94% { transform: rotate(-15.13deg); }
  71.12% { transform: rotate(-17.56deg); }
  71.25% { transform: rotate(-18.86deg); }
  71.43% { transform: rotate(-19.84deg); }
  71.56% { transform: rotate(-19.99deg); }
  71.7% { transform: rotate(-19.62deg); }
  71.88% { transform: rotate(-18.36deg); }
  72.05% { transform: rotate(-16.25deg); }
  72.23% { transform: rotate(-13.41deg); }
  72.54% { transform: rotate(-7.07deg); }
  73.21% { transform: rotate(8.52deg); }
  73.39% { transform: rotate(12.16deg); }
  73.57% { transform: rotate(15.25deg); }
  73.75% { transform: rotate(17.65deg); }
  73.88% { transform: rotate(18.92deg); }
  74.02% { transform: rotate(19.71deg); }
  74.15% { transform: rotate(20deg); }
  74.29% { transform: rotate(19.77deg); }
  74.42% { transform: rotate(19.04deg); }
  74.55% { transform: rotate(17.82deg); }
  74.73% { transform: rotate(15.49deg); }
  74.91% { transform: rotate(12.46deg); }
  75.09% { transform: rotate(8.86deg); }
  75.8% { transform: rotate(-7.71deg); }
  76.12% { transform: rotate(-13.92deg); }
  76.29% { transform: rotate(-16.65deg); }
  76.47% { transform: rotate(-18.62deg); }
  76.65% { transform: rotate(-19.74deg); }
  76.79% { transform: rotate(-20deg); }
  77.05% { transform: rotate(-16.13deg); }
  77.54% { transform: rotate(-7.08deg); }
  77.81% { transform: rotate(-2.85deg); }
  78.08% { transform: rotate(-0.12deg); }
  78.3% { transform: rotate(0.73deg); }
  78.57%, 100% { transform: rotate(0); }
}
@keyframes sd-boy-arm {
  0%, 10.71%, 54.02% { transform: translate(2px, -214px) rotate(84deg); }
  54.24% { transform: translate(2px, -214px) rotate(84.59deg); }
  54.51% { transform: translate(2px, -214px) rotate(83.74deg); }
  54.78% { transform: translate(2px, -214px) rotate(81.21deg); }
  55% { transform: translate(2px, -214px) rotate(78.08deg); }
  55.54% { transform: translate(2px, -214px) rotate(69.33deg); }
  55.8% { transform: translate(2px, -214px) rotate(66.01deg); }
  55.94% { transform: translate(2px, -214px) rotate(66.33deg); }
  56.12% { transform: translate(2px, -214px) rotate(67.46deg); }
  56.29% { transform: translate(2px, -214px) rotate(69.34deg); }
  56.47% { transform: translate(2px, -214px) rotate(71.89deg); }
  56.79% { transform: translate(2px, -214px) rotate(77.58deg); }
  57.46% { transform: translate(2px, -214px) rotate(91.61deg); }
  57.81% { transform: translate(2px, -214px) rotate(97.69deg); }
  57.99% { transform: translate(2px, -214px) rotate(99.85deg); }
  58.13% { transform: translate(2px, -214px) rotate(101.01deg); }
  58.3% { transform: translate(2px, -214px) rotate(101.87deg); }
  58.44% { transform: translate(2px, -214px) rotate(101.98deg); }
  58.57% { transform: translate(2px, -214px) rotate(101.64deg); }
  58.75% { transform: translate(2px, -214px) rotate(100.47deg); }
  58.93% { transform: translate(2px, -214px) rotate(98.56deg); }
  59.11% { transform: translate(2px, -214px) rotate(95.99deg); }
  59.42% { transform: translate(2px, -214px) rotate(90.26deg); }
  60.09% { transform: translate(2px, -214px) rotate(76.23deg); }
  60.27% { transform: translate(2px, -214px) rotate(72.97deg); }
  60.45% { transform: translate(2px, -214px) rotate(70.2deg); }
  60.63% { transform: translate(2px, -214px) rotate(68.07deg); }
  60.76% { transform: translate(2px, -214px) rotate(66.93deg); }
  61.03% { transform: translate(2px, -214px) rotate(66deg); }
  61.16% { transform: translate(2px, -214px) rotate(66.22deg); }
  61.34% { transform: translate(2px, -214px) rotate(67.22deg); }
  61.52% { transform: translate(2px, -214px) rotate(68.99deg); }
  61.7% { transform: translate(2px, -214px) rotate(71.43deg); }
  62.01% { transform: translate(2px, -214px) rotate(77.01deg); }
  62.72% { transform: translate(2px, -214px) rotate(91.92deg); }
  62.9% { transform: translate(2px, -214px) rotate(95.17deg); }
  63.08% { transform: translate(2px, -214px) rotate(97.91deg); }
  63.26% { transform: translate(2px, -214px) rotate(100.01deg); }
  63.39% { transform: translate(2px, -214px) rotate(101.12deg); }
  63.66% { transform: translate(2px, -214px) rotate(102deg); }
  63.79% { transform: translate(2px, -214px) rotate(101.75deg); }
  63.97% { transform: translate(2px, -214px) rotate(100.72deg); }
  64.15% { transform: translate(2px, -214px) rotate(98.92deg); }
  64.33% { transform: translate(2px, -214px) rotate(96.44deg); }
  64.64% { transform: translate(2px, -214px) rotate(90.84deg); }
  65.36% { transform: translate(2px, -214px) rotate(75.93deg); }
  65.54% { transform: translate(2px, -214px) rotate(72.7deg); }
  65.71% { transform: translate(2px, -214px) rotate(69.99deg); }
  65.89% { transform: translate(2px, -214px) rotate(67.91deg); }
  66.03% { transform: translate(2px, -214px) rotate(66.83deg); }
  66.29% { transform: translate(2px, -214px) rotate(66deg); }
  66.43% { transform: translate(2px, -214px) rotate(66.28deg); }
  66.61% { transform: translate(2px, -214px) rotate(67.35deg); }
  66.79% { transform: translate(2px, -214px) rotate(69.18deg); }
  66.96% { transform: translate(2px, -214px) rotate(71.68deg); }
  67.28% { transform: translate(2px, -214px) rotate(77.32deg); }
  67.99% { transform: translate(2px, -214px) rotate(92.22deg); }
  68.17% { transform: translate(2px, -214px) rotate(95.43deg); }
  68.35% { transform: translate(2px, -214px) rotate(98.12deg); }
  68.53% { transform: translate(2px, -214px) rotate(100.16deg); }
  68.66% { transform: translate(2px, -214px) rotate(101.22deg); }
  68.93% { transform: translate(2px, -214px) rotate(101.99deg); }
  69.06% { transform: translate(2px, -214px) rotate(101.69deg); }
  69.24% { transform: translate(2px, -214px) rotate(100.59deg); }
  69.42% { transform: translate(2px, -214px) rotate(98.73deg); }
  69.6% { transform: translate(2px, -214px) rotate(96.2deg); }
  69.91% { transform: translate(2px, -214px) rotate(90.52deg); }
  70.62% { transform: translate(2px, -214px) rotate(75.63deg); }
  70.94% { transform: translate(2px, -214px) rotate(70.39deg); }
  71.12% { transform: translate(2px, -214px) rotate(68.2deg); }
  71.25% { transform: translate(2px, -214px) rotate(67.03deg); }
  71.43% { transform: translate(2px, -214px) rotate(66.14deg); }
  71.56% { transform: translate(2px, -214px) rotate(66.01deg); }
  71.7% { transform: translate(2px, -214px) rotate(66.34deg); }
  71.88% { transform: translate(2px, -214px) rotate(67.48deg); }
  72.05% { transform: translate(2px, -214px) rotate(69.37deg); }
  72.23% { transform: translate(2px, -214px) rotate(71.93deg); }
  72.54% { transform: translate(2px, -214px) rotate(77.64deg); }
  73.21% { transform: translate(2px, -214px) rotate(91.66deg); }
  73.57% { transform: translate(2px, -214px) rotate(97.72deg); }
  73.75% { transform: translate(2px, -214px) rotate(99.88deg); }
  73.88% { transform: translate(2px, -214px) rotate(101.03deg); }
  74.15% { transform: translate(2px, -214px) rotate(102deg); }
  74.42% { transform: translate(2px, -214px) rotate(101.14deg); }
  74.55% { transform: translate(2px, -214px) rotate(100.04deg); }
  74.73% { transform: translate(2px, -214px) rotate(97.94deg); }
  74.91% { transform: translate(2px, -214px) rotate(95.21deg); }
  75.09% { transform: translate(2px, -214px) rotate(91.97deg); }
  75.8% { transform: translate(2px, -214px) rotate(77.06deg); }
  76.12% { transform: translate(2px, -214px) rotate(71.47deg); }
  76.29% { transform: translate(2px, -214px) rotate(69.02deg); }
  76.47% { transform: translate(2px, -214px) rotate(67.24deg); }
  76.65% { transform: translate(2px, -214px) rotate(66.23deg); }
  76.79% { transform: translate(2px, -214px) rotate(66deg); }
  77.05% { transform: translate(2px, -214px) rotate(69.48deg); }
  77.54% { transform: translate(2px, -214px) rotate(77.63deg); }
  77.81% { transform: translate(2px, -214px) rotate(81.43deg); }
  78.08% { transform: translate(2px, -214px) rotate(83.89deg); }
  78.3% { transform: translate(2px, -214px) rotate(84.66deg); }
  78.57%, 100% { transform: translate(2px, -214px) rotate(84deg); }
}
@keyframes sd-boy-look {
  0%, 10.71% { transform: rotate(-26deg); }
  16.34% { transform: rotate(-25.99deg); }
  18.17% { transform: rotate(-25.42deg); }
  20.67% { transform: rotate(-23.56deg); }
  26.52% { transform: rotate(-17.78deg); }
  29.46% { transform: rotate(-16.11deg); }
  50.94% { transform: rotate(-15.99deg); }
  51.25% { transform: rotate(-15.22deg); }
  51.56% { transform: rotate(-13.5deg); }
  52.63% { transform: rotate(-4.51deg); }
  52.99% { transform: rotate(-1.93deg); }
  53.3% { transform: rotate(-0.45deg); }
  53.57%, 100% { transform: rotate(0); }
}
@keyframes sd-ship-depart {
  0%, 8.57%, 62.86% { transform: translate(0, 0); }
  63.57% { transform: translate(0.56px, -0.04px); }
  64.39% { transform: translate(1.9px, -0.13px); }
  65.25% { transform: translate(3.85px, -0.26px); }
  66.18% { transform: translate(6.51px, -0.43px); }
  67.14% { transform: translate(9.79px, -0.65px); }
  69.11% { transform: translate(17.91px, -1.19px); }
  71.18% { transform: translate(28.32px, -1.89px); }
  73.32% { transform: translate(40.85px, -2.72px); }
  75.5% { transform: translate(55.29px, -3.69px); }
  77.71% { transform: translate(71.58px, -4.77px); }
  80% { transform: translate(90px, -6px); }
  100% { transform: translate(249.60px, -16.64px); }
}
@keyframes sd-sail {
  0%, 8.57% { transform: scaleY(0.05); }
  57.21% { transform: scaleY(0.0504); }
  57.36% { transform: scaleY(0.0539); }
  57.5% { transform: scaleY(0.0607); }
  57.64% { transform: scaleY(0.0705); }
  57.79% { transform: scaleY(0.0834); }
  57.93% { transform: scaleY(0.0989); }
  58.11% { transform: scaleY(0.122); }
  58.25% { transform: scaleY(0.1432); }
  58.43% { transform: scaleY(0.1726); }
  58.61% { transform: scaleY(0.2052); }
  58.79% { transform: scaleY(0.2404); }
  58.96% { transform: scaleY(0.278); }
  59.14% { transform: scaleY(0.3177); }
  59.54% { transform: scaleY(0.4102); }
  60.36% { transform: scaleY(0.6136); }
  60.68% { transform: scaleY(0.691); }
  61% { transform: scaleY(0.7642); }
  61.32% { transform: scaleY(0.831); }
  61.5% { transform: scaleY(0.8647); }
  61.68% { transform: scaleY(0.8954); }
  61.86% { transform: scaleY(0.9229); }
  62% { transform: scaleY(0.9423); }
  62.18% { transform: scaleY(0.963); }
  62.32% { transform: scaleY(0.9765); }
  62.46% { transform: scaleY(0.9871); }
  62.61% { transform: scaleY(0.9947); }
  62.75% { transform: scaleY(0.999); }
  62.86%, 80%, 100% { transform: scaleY(1); }
}
@keyframes sd-oar {
  0% { transform: rotate(8deg); }
  8.57% { transform: rotate(8deg); }
  61.43% { transform: rotate(8deg); }
  61.96% { transform: rotate(1.9deg); }
  62.39% { transform: rotate(-1.97deg); }
  62.79% { transform: rotate(-4.19deg); }
  63.18% { transform: rotate(-4.89deg); }
  63.57% { transform: rotate(-3.92deg); }
  64% { transform: rotate(-1.01deg); }
  64.29% { transform: rotate(1.9deg); }
  64.71% { transform: rotate(7.49deg); }
  65.11% { transform: rotate(12.06deg); }
  65.43% { transform: rotate(15.22deg); }
  65.71% { transform: rotate(17.45deg); }
  66.11% { transform: rotate(19.45deg); }
  67.14% { transform: rotate(22deg); }
  67.29% { transform: rotate(21.59deg); }
  67.43% { transform: rotate(20.41deg); }
  67.57% { transform: rotate(18.57deg); }
  67.71% { transform: rotate(16.14deg); }
  67.89% { transform: rotate(12.44deg); }
  68.07% { transform: rotate(8.14deg); }
  68.82% { transform: rotate(-12.3deg); }
  69.14% { transform: rotate(-20deg); }
  69.32% { transform: rotate(-23.42deg); }
  69.5% { transform: rotate(-26.01deg); }
  69.68% { transform: rotate(-27.59deg); }
  69.82% { transform: rotate(-28deg); }
  70.36% { transform: rotate(-26deg); }
  70.57% { transform: rotate(-25.75deg); }
  70.82% { transform: rotate(-24.88deg); }
  71.14% { transform: rotate(-22.95deg); }
  71.46% { transform: rotate(-20.23deg); }
  71.79% { transform: rotate(-16.88deg); }
  72.14% { transform: rotate(-12.59deg); }
  73.71% { transform: rotate(8.37deg); }
  74.11% { transform: rotate(12.81deg); }
  74.46% { transform: rotate(16.12deg); }
  74.75% { transform: rotate(18.13deg); }
  75% { transform: rotate(19.33deg); }
  76.07% { transform: rotate(22deg); }
  76.21% { transform: rotate(21.59deg); }
  76.36% { transform: rotate(20.41deg); }
  76.5% { transform: rotate(18.57deg); }
  76.64% { transform: rotate(16.14deg); }
  76.82% { transform: rotate(12.44deg); }
  77% { transform: rotate(8.14deg); }
  77.75% { transform: rotate(-12.3deg); }
  78.07% { transform: rotate(-20deg); }
  78.25% { transform: rotate(-23.42deg); }
  78.43% { transform: rotate(-26.01deg); }
  78.61% { transform: rotate(-27.59deg); }
  78.75% { transform: rotate(-28deg); }
  79.29% { transform: rotate(-26deg); }
  79.5% { transform: rotate(-25.75deg); }
  79.75% { transform: rotate(-24.88deg); }
  80.07% { transform: rotate(-22.95deg); }
  80.39% { transform: rotate(-20.23deg); }
  80.71% { transform: rotate(-16.88deg); }
  81.07% { transform: rotate(-12.59deg); }
  82.64% { transform: rotate(8.37deg); }
  83.04% { transform: rotate(12.81deg); }
  83.39% { transform: rotate(16.12deg); }
  83.68% { transform: rotate(18.13deg); }
  83.93% { transform: rotate(19.33deg); }
  85% { transform: rotate(22deg); }
  85.14% { transform: rotate(21.59deg); }
  85.29% { transform: rotate(20.41deg); }
  85.43% { transform: rotate(18.57deg); }
  85.57% { transform: rotate(16.14deg); }
  85.75% { transform: rotate(12.44deg); }
  85.93% { transform: rotate(8.14deg); }
  86.68% { transform: rotate(-12.3deg); }
  87% { transform: rotate(-20deg); }
  87.18% { transform: rotate(-23.42deg); }
  87.36% { transform: rotate(-26.01deg); }
  87.54% { transform: rotate(-27.59deg); }
  87.68% { transform: rotate(-28deg); }
  88.21% { transform: rotate(-26deg); }
  88.43% { transform: rotate(-25.75deg); }
  88.68% { transform: rotate(-24.88deg); }
  89% { transform: rotate(-22.95deg); }
  89.32% { transform: rotate(-20.23deg); }
  89.64% { transform: rotate(-16.88deg); }
  90% { transform: rotate(-12.59deg); }
  91.57% { transform: rotate(8.37deg); }
  91.96% { transform: rotate(12.81deg); }
  92.32% { transform: rotate(16.12deg); }
  92.61% { transform: rotate(18.13deg); }
  92.86% { transform: rotate(19.33deg); }
  93.93% { transform: rotate(22deg); }
  94.07% { transform: rotate(21.59deg); }
  94.21% { transform: rotate(20.41deg); }
  94.36% { transform: rotate(18.57deg); }
  94.5% { transform: rotate(16.14deg); }
  94.68% { transform: rotate(12.44deg); }
  94.86% { transform: rotate(8.14deg); }
  95.61% { transform: rotate(-12.3deg); }
  95.93% { transform: rotate(-20deg); }
  96.11% { transform: rotate(-23.42deg); }
  96.29% { transform: rotate(-26.01deg); }
  96.46% { transform: rotate(-27.59deg); }
  96.61% { transform: rotate(-28deg); }
  97.14% { transform: rotate(-26deg); }
  97.36% { transform: rotate(-25.75deg); }
  97.61% { transform: rotate(-24.88deg); }
  97.93% { transform: rotate(-22.95deg); }
  98.25% { transform: rotate(-20.23deg); }
  98.57% { transform: rotate(-16.88deg); }
  98.93% { transform: rotate(-12.59deg); }
  100% { transform: rotate(1.70deg); }
}
@keyframes sd-dark {
  0% { opacity: 1; } 9%, 100% { opacity: 0; visibility: hidden; }
}
@keyframes sd-boy-rim {
  0%, 10.71%, 74.23% { opacity: 1; }
  74.24%, 100% { opacity: 0; }
}
</style>
