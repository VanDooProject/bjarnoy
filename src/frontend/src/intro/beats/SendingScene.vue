<script setup lang="ts">
import { useId } from 'vue';
import SendingFire from './SendingFire.vue';
import { sineLoop } from './sineLoop';

/**
 * Beat 3, the sending: dusk on the burning shore. The jarl, spear planted, goes down on one knee to his
 * son, takes him by the shoulder and pats it, then lets go. The boy turns and walks down to the water
 * and is lost in the shore mist; the jarl raises his arm and waves while the longship drops its sail and
 * pulls out toward the light. Fog closes over the shore at the end. The beat starts from the dark of
 * the prophecy's last frame.
 * The story (figures, camera push, sail, oars, ship's departure, fog closing) is baked from the design's
 * pose function into the keyframes at the bottom, timed on `--beat-duration`. Smoke, fire, fog, glints,
 * ash and the ship's swell loop on their own periods.
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

// longship (local coordinates, placed at 772,499 scale .36)
const OAR_X = [584, 680, 776, 872, 968, 1064];
const SHIELDS = Array.from({ length: 11 }, (_, i) => ({ x: 560 + i * 48, a: i % 2 === 1 }));
const SAIL = 'M604 503 L956 503 C968 590 968 700 948 792 L612 792 C594 700 594 590 604 503Z';
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
      <mask :id="id('cols')" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1600">
        <g v-for="([, , o], c) in SMOKE_COLS" :key="c" :opacity="o">
          <g v-for="(p, i) in PUFFS[c]" :key="i" class="sd-sway" :style="p.style">
            <ellipse :cx="p.cx" :cy="p.cy" :rx="p.rx" :ry="p.ry" :fill="url('puff')"/>
          </g>
        </g>
      </mask>
      <mask :id="id('smkA')"><rect v-bind="SMOKE_BOX" :fill="url('smk')"/></mask>
      <mask :id="id('smkB')"><rect v-bind="SMOKE_BOX" :fill="url('wsp')"/></mask>
      <mask :id="id('hz')" maskUnits="userSpaceOnUse" x="-40" y="0" width="1680" height="1600">
        <rect x="-40" y="660" width="1680" height="260" :fill="url('band')"/>
      </mask>
      <mask :id="id('shore')" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1600">
        <rect x="0" y="860" width="1600" height="220" :fill="url('band')"/>
      </mask>
      <mask :id="id('right')" maskUnits="userSpaceOnUse" x="0" y="0" width="1600" height="1600">
        <rect x="0" y="0" width="1600" height="1600" :fill="url('ramp')"/>
      </mask>
      <mask :id="id('hzTex')"><rect x="-40" y="640" width="2700" height="300" :fill="url('fog')"/></mask>
      <mask :id="id('shoreTex')"><rect x="-808" y="840" width="2448" height="260" :fill="url('fog2')"/></mask>
      <mask :id="id('veilTex')"><rect x="0" y="0" width="2624" height="1600" :fill="url('fog')"/></mask>
      <clipPath :id="id('sailclip')"><path :d="SAIL"/></clipPath>
    </defs>

    <rect width="1600" height="1600" :fill="url('sky')"/>
    <ellipse cx="1110" cy="790" rx="820" ry="190" fill="#5e5459" opacity=".5"/>
    <ellipse cx="1110" cy="790" rx="600" ry="120" fill="#80635d" opacity=".5"/>
    <ellipse cx="1110" cy="790" rx="380" ry="66" fill="#a8775f" opacity=".55"/>
    <ellipse cx="1110" cy="790" rx="190" ry="30" fill="#d39d78" opacity=".6"/>

    <g class="sd-a sd-cam-far">
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
      <rect x="0" y="786" width="1600" height="814" fill="#1d252e"/>
      <g>
        <rect v-for="([x, y, w, h, o], i) in GLINTS" :key="i" class="sd-glint" :style="sineLoop(0.4, i * 1.3)" :x="x" :y="y" :width="w" :height="h" fill="#8c6a5c" :opacity="o"/>
      </g>
      <g :mask="url('hz')" opacity=".42"><g class="sd-fog sd-fog-hz"><rect x="-40" y="640" width="2700" height="300" fill="#808891" :mask="url('hzTex')"/></g></g>
    </g>

    <g class="sd-a sd-cam-mid">
      <g class="sd-a sd-ship-depart"><g class="sd-heave"><g class="sd-pitch">
        <g transform="translate(772,499) scale(0.36)">
          <path d="M486 838 L452 1004" stroke="#0e1318" stroke-width="8" stroke-linecap="round"/>
          <ellipse cx="455" cy="990" rx="10" ry="24" fill="#0e1318" transform="rotate(12 455 990)"/>
          <path d="M780 474 L1176 790 M780 474 L436 800" stroke="#0e1318" stroke-width="4" fill="none"/>
          <rect x="775" y="470" width="10" height="420" fill="#0e1318"/>
          <g transform="translate(780,503)"><g class="sd-a sd-sail"><g transform="translate(-780,-503)">
            <path :d="SAIL" fill="#6b4a41"/>
            <g :clip-path="url('sailclip')" fill="#4a3530"><rect x="652" y="500" width="54" height="300"/><rect x="753" y="500" width="54" height="300"/><rect x="854" y="500" width="54" height="300"/></g>
          </g></g></g>
          <rect x="588" y="494" width="384" height="10" rx="3" fill="#0e1318"/>
          <g fill="#0b1015">
            <path d="M452 882 L456 814 C460 805 482 805 488 814 L492 882Z"/><circle cx="471" cy="794" r="13"/>
            <template v-for="x in OAR_X" :key="x">
              <path :d="`M${x - 17} 892 L${x - 14} 856 C${x - 10} 847 ${x + 10} 847 ${x + 14} 856 L${x + 17} 892Z`"/><circle :cx="x" cy="836" r="12"/>
            </template>
          </g>
          <path d="M426 800 C440 852 470 880 520 888 L1080 888 C1130 880 1160 852 1170 800 L1198 800 C1198 882 1162 966 1060 992 L540 992 C438 966 396 882 396 800Z" fill="#0e1318"/>
          <path d="M396 806 C390 752 394 706 420 686 C442 670 470 678 470 700 C470 718 452 726 442 716 C452 712 456 702 448 694 C436 686 422 696 420 716 C418 744 422 776 426 806Z" fill="#0e1318"/>
          <path d="M1170 806 C1176 760 1182 720 1196 696 C1208 680 1232 676 1246 686 L1236 692 L1250 700 L1232 704 C1218 706 1208 716 1204 734 C1200 756 1198 780 1198 806Z" fill="#0e1318"/>
          <g v-for="(s, i) in SHIELDS" :key="i"><circle :cx="s.x" cy="890" r="21" :fill="s.a ? '#27313b' : '#1e262e'"/><circle :cx="s.x" cy="890" r="5" fill="#0e1318"/></g>
          <g v-for="x in OAR_X" :key="`o${x}`" :transform="`translate(${x} 910)`">
            <g class="sd-a sd-oar"><rect x="-3" y="0" width="6" height="170" rx="2" fill="#0e1318"/><ellipse cx="0" cy="156" rx="8" ry="20" fill="#0e1318"/></g>
          </g>
        </g>
      </g></g></g>
      <rect x="0" y="851" width="1600" height="40" fill="#1d252e"/>
      <rect x="860" y="852" width="520" height="2" fill="#8c6a5c" opacity=".4"/>
      <path d="M0 872 L380 880 C640 892 860 908 1040 952 C1150 980 1260 1050 1600 1110 L1600 1600 L0 1600 Z" fill="#2a2f35"/>
      <path d="M0 884 L380 892 C640 904 860 922 1030 968 C1140 998 1250 1068 1600 1130 L1600 1600 L0 1600 Z" fill="#161b21"/>
    </g>

    <g>
      <circle v-for="(a, i) in ASH" :key="i" class="sd-ash" :style="a.style" :r="a.r" fill="#8f969d" opacity=".4"/>
    </g>
    <g class="sd-a sd-cam-fig">
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

    <g :mask="url('right')"><g :mask="url('shore')" opacity=".26"><g class="sd-fog sd-fog-shore"><rect x="-808" y="840" width="2448" height="260" fill="#808891" :mask="url('shoreTex')"/></g></g></g>

    <g class="sd-a sd-cam-near">
      <path d="M-40 1600 L-40 1330 C40 1290 120 1300 190 1340 C260 1320 330 1350 380 1420 C420 1460 460 1520 470 1600 Z" fill="#090b0e"/>
      <path d="M120 1310 L132 1250 L142 1312 M170 1330 L190 1262 L196 1336 M230 1330 L236 1280 L250 1334" stroke="#090b0e" stroke-width="5" fill="none"/>
    </g>
    <rect width="1600" height="1600" :fill="url('vig')"/>
    <!-- the closing fog -->
    <g class="sd-a sd-veil">
      <rect width="1600" height="1600" fill="#4d545c"/>
      <g class="sd-fog sd-fog-veil"><rect x="0" y="0" width="2624" height="1600" fill="#808891" :mask="url('veilTex')"/></g>
    </g>
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
.b3 .sd-boy { animation: sd-boy-move var(--beat-duration) linear both, sd-boy-fade var(--beat-duration) linear both; }
/* the rim copy is off as soon as the boy starts to fade, so no pale ghost is left behind */
.b3 .sd-boy.is-rim { animation: sd-boy-move var(--beat-duration) linear both, sd-boy-rim var(--beat-duration) linear both; }
.b3 .sd-boy-bob { animation-name: sd-boy-bob; }
.b3 .sd-boy-l { animation-name: sd-boy-turn-l; }
.b3 .sd-boy-r { animation-name: sd-boy-turn-r; }
.b3 .sd-legf { animation-name: sd-boy-legf; transform-origin: 14px -82px; }
.b3 .sd-legb { animation-name: sd-boy-legb; transform-origin: -14px -82px; }
.b3 .sd-boy-arm { animation-name: sd-boy-arm; }
.b3 .sd-look { animation-name: sd-boy-look; }
.b3 .sd-ship-depart { animation-name: sd-ship-depart; }
.b3 .sd-sail { animation-name: sd-sail; }
.b3 .sd-oar { animation-name: sd-oar; }
.b3 .sd-veil { animation-name: sd-veil; }
.b3 .sd-dark { animation-name: sd-dark; }

/* ---- ambient loops ---- */
/* sines as alternating ease-in-outs (see sineLoop.ts) */
.b3 .sd-sway { animation: sd-sway var(--p) cubic-bezier(0.37, 0, 0.63, 1) var(--o) infinite alternate; }
@keyframes sd-sway { from { transform: translateX(calc(var(--a) * -1)); } to { transform: translateX(var(--a)); } }
.b3 .sd-glint { animation: sd-glint var(--p) cubic-bezier(0.37, 0, 0.63, 1) var(--o) infinite alternate; }
@keyframes sd-glint { from { transform: translateX(-26px); } to { transform: translateX(26px); } }
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
/* fog bands drift one whole texture tile per loop: 14 units/s (horizon), 22 (shore, 768 tile), 40 (closing fog).
   Each band is the view plus one tile wide, no more: every unit of it is rastered, on screen or not. */
.b3 .sd-fog-hz { animation: sd-fog-left 73143ms linear infinite; }
.b3 .sd-fog-shore { animation: sd-fog-right 34909ms linear infinite; }
.b3 .sd-fog-veil { animation: sd-fog-left 25600ms linear infinite; }
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
   that stay within 0.25 units / 0.25 deg / 0.005 opacity of it. Percentages are of --beat-duration (10 s). ---- */
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
  0% { transform: translate(6px, -110px) rotate(90deg); }
  6.3% { transform: translate(6px, -109.95px) rotate(89.91deg); }
  7.3% { transform: translate(6px, -109.03px) rotate(88.39deg); }
  8.3% { transform: translate(6px, -107.09px) rotate(85.18deg); }
  8.95% { transform: translate(6px, -105.35px) rotate(82.31deg); }
  9.6% { transform: translate(6px, -103.29px) rotate(78.9deg); }
  10.3% { transform: translate(6px, -100.75px) rotate(74.7deg); }
  11.1% { transform: translate(6px, -97.52px) rotate(69.36deg); }
  12.5% { transform: translate(6px, -91.23px) rotate(58.95deg); }
  16.05% { transform: translate(6px, -74.22px) rotate(30.83deg); }
  17.05% { transform: translate(6px, -69.85px) rotate(23.6deg); }
  17.95% { transform: translate(6px, -66.31px) rotate(17.74deg); }
  18.95% { transform: translate(6px, -62.95px) rotate(12.18deg); }
  19.85% { transform: translate(6px, -60.56px) rotate(8.24deg); }
  20.7% { transform: translate(6px, -58.97px) rotate(5.61deg); }
  21.55% { transform: translate(6px, -58.12px) rotate(4.2deg); }
  100% { transform: translate(6px, -58px) rotate(4deg); }
}
@keyframes sd-j-shin {
  0% { transform: translate(55px, 0) rotate(0); } 6.3% { transform: translate(55px, 0) rotate(0.09deg); }
  7.3% { transform: translate(55px, 0) rotate(1.57deg); } 8.3% { transform: translate(55px, 0) rotate(4.71deg); }
  8.95% { transform: translate(55px, 0) rotate(7.51deg); } 9.6% { transform: translate(55px, 0) rotate(10.84deg); }
  10.3% { transform: translate(55px, 0) rotate(14.94deg); } 11.1% { transform: translate(55px, 0) rotate(20.16deg); }
  12.5% { transform: translate(55px, 0) rotate(30.33deg); } 16.05% { transform: translate(55px, 0) rotate(57.79deg); }
  17.05% { transform: translate(55px, 0) rotate(64.86deg); }
  17.95% { transform: translate(55px, 0) rotate(70.58deg); }
  18.95% { transform: translate(55px, 0) rotate(76.01deg); }
  19.85% { transform: translate(55px, 0) rotate(79.86deg); } 20.7% { transform: translate(55px, 0) rotate(82.43deg); }
  21.55% { transform: translate(55px, 0) rotate(83.8deg); } 100% { transform: translate(55px, 0) rotate(84deg); }
}
@keyframes sd-j-bthigh {
  0% { transform: translate(-4px, -110px) rotate(90deg); }
  6.3% { transform: translate(-4px, -109.95px) rotate(90.01deg); }
  7.3% { transform: translate(-4px, -109.03px) rotate(90.26deg); }
  8.3% { transform: translate(-4px, -107.09px) rotate(90.78deg); }
  9.6% { transform: translate(-4px, -103.29px) rotate(91.81deg); }
  11.1% { transform: translate(-4px, -97.52px) rotate(93.36deg); }
  12.5% { transform: translate(-4px, -91.23px) rotate(95.05deg); }
  16.05% { transform: translate(-4px, -74.22px) rotate(99.63deg); }
  17.95% { transform: translate(-4px, -66.31px) rotate(101.76deg); }
  18.95% { transform: translate(-4px, -62.95px) rotate(102.67deg); }
  19.85% { transform: translate(-4px, -60.56px) rotate(103.31deg); }
  20.7% { transform: translate(-4px, -58.97px) rotate(103.74deg); }
  21.55% { transform: translate(-4px, -58.12px) rotate(103.97deg); }
  100% { transform: translate(-4px, -58px) rotate(104deg); }
}
@keyframes sd-j-bshin {
  0% { transform: translate(55px, 0) rotate(0); } 6.3% { transform: translate(55px, 0) rotate(0.08deg); }
  7.3% { transform: translate(55px, 0) rotate(1.39deg); } 8.3% { transform: translate(55px, 0) rotate(4.15deg); }
  9.6% { transform: translate(55px, 0) rotate(9.55deg); } 11.1% { transform: translate(55px, 0) rotate(17.76deg); }
  12.5% { transform: translate(55px, 0) rotate(26.72deg); } 16.05% { transform: translate(55px, 0) rotate(50.91deg); }
  17.05% { transform: translate(55px, 0) rotate(57.13deg); }
  17.95% { transform: translate(55px, 0) rotate(62.18deg); }
  18.95% { transform: translate(55px, 0) rotate(66.96deg); }
  19.85% { transform: translate(55px, 0) rotate(70.35deg); } 20.7% { transform: translate(55px, 0) rotate(72.61deg); }
  21.55% { transform: translate(55px, 0) rotate(73.83deg); } 100% { transform: translate(55px, 0) rotate(74deg); }
}
@keyframes sd-j-cloak {
  0% { transform: skewX(0) scale(1, 1); } 6.3% { transform: skewX(-0.01deg) scale(1.0003, 0.9997); }
  7.3% { transform: skewX(-0.13deg) scale(1.0047, 0.9951); } 8.3% { transform: skewX(-0.4deg) scale(1.014, 0.9854); }
  9.6% { transform: skewX(-0.93deg) scale(1.0323, 0.9664); } 11.1% { transform: skewX(-1.73deg) scale(1.06, 0.9376); }
  12.5% { transform: skewX(-2.6deg) scale(1.0903, 0.9061); }
  16.05% { transform: skewX(-4.95deg) scale(1.172, 0.8211); }
  17.05% { transform: skewX(-5.56deg) scale(1.193, 0.7993); }
  17.95% { transform: skewX(-6.05deg) scale(1.2101, 0.7815); }
  18.95% { transform: skewX(-6.51deg) scale(1.2262, 0.7647); }
  19.85% { transform: skewX(-6.84deg) scale(1.2377, 0.7528); }
  20.7% { transform: skewX(-7.12deg) scale(1.2453, 0.7449); }
  21.55% { transform: skewX(-7.42deg) scale(1.2494, 0.7406); }
  27.45% { transform: skewX(-9.57deg) scale(1.25, 0.74); } 40% { transform: skewX(-9.6deg) scale(1.25, 0.74); }
  44.95%, 100% { transform: skewX(-7.2deg) scale(1.25, 0.74); }
}
@keyframes sd-j-torso {
  0% { transform: translate(0, -110px) rotate(0); } 6.3% { transform: translate(0, -109.95px) rotate(0.01deg); }
  7.3% { transform: translate(0, -109.03px) rotate(0.22deg); }
  8.3% { transform: translate(0, -107.09px) rotate(0.67deg); }
  9.6% { transform: translate(0, -103.29px) rotate(1.55deg); }
  11.1% { transform: translate(0, -97.52px) rotate(2.88deg); }
  12.5% { transform: translate(0, -91.23px) rotate(4.33deg); }
  16.05% { transform: translate(0, -74.22px) rotate(8.26deg); }
  17.95% { transform: translate(0, -66.31px) rotate(10.08deg); }
  18.95% { transform: translate(0, -62.95px) rotate(10.86deg); }
  19.85% { transform: translate(0, -60.56px) rotate(11.41deg); }
  20.7% { transform: translate(0, -58.97px) rotate(11.86deg); }
  21.55% { transform: translate(0, -58.12px) rotate(12.36deg); }
  25.75% { transform: translate(0, -58px) rotate(15.23deg); }
  27.45% { transform: translate(0, -58px) rotate(15.95deg); } 40% { transform: translate(0, -58px) rotate(16deg); }
  41.05% { transform: translate(0, -58px) rotate(15.54deg); }
  43.75% { transform: translate(0, -58px) rotate(12.63deg); }
  44.95%, 100% { transform: translate(0, -58px) rotate(12deg); }
}
@keyframes sd-j-head {
  0% { transform: translate(4px, -96px) rotate(8deg); } 8.4% { transform: translate(4px, -96px) rotate(8.12deg); }
  20.4% { transform: translate(4px, -96px) rotate(9.94deg); }
  30.1% { transform: translate(4px, -96px) rotate(10.02deg); }
  30.55% { transform: translate(4px, -96px) rotate(10.62deg); }
  31% { transform: translate(4px, -96px) rotate(11.88deg); }
  32.7% { transform: translate(4px, -96px) rotate(19.02deg); }
  33.35% { transform: translate(4px, -96px) rotate(21.15deg); }
  33.9% { transform: translate(4px, -96px) rotate(21.98deg); }
  35.05% { transform: translate(4px, -96px) rotate(21.99deg); }
  35.45% { transform: translate(4px, -96px) rotate(21.58deg); }
  35.9% { transform: translate(4px, -96px) rotate(20.45deg); }
  37.9% { transform: translate(4px, -96px) rotate(12.22deg); }
  38.35% { transform: translate(4px, -96px) rotate(10.85deg); }
  38.8% { transform: translate(4px, -96px) rotate(10.09deg); }
  52.15% { transform: translate(4px, -96px) rotate(10deg); }
  54.15% { transform: translate(4px, -96px) rotate(9.41deg); }
  57.45% { transform: translate(4px, -96px) rotate(6.77deg); }
  64.6% { transform: translate(4px, -96px) rotate(-0.72deg); }
  67.6% { transform: translate(4px, -96px) rotate(-4.57deg); }
  69.25% { transform: translate(4px, -96px) rotate(-5.83deg); }
  100% { transform: translate(4px, -96px) rotate(-6deg); }
}
@keyframes sd-j-arm {
  0% { transform: translate(8px, -80px) rotate(96deg); } 20.35% { transform: translate(8px, -80px) rotate(95.82deg); }
  21.15% { transform: translate(8px, -80px) rotate(94.15deg); }
  22% { transform: translate(8px, -80px) rotate(90.89deg); }
  22.85% { transform: translate(8px, -80px) rotate(86.6deg); }
  25.15% { transform: translate(8px, -80px) rotate(73.65deg); }
  25.85% { transform: translate(8px, -80px) rotate(70.29deg); }
  26.45% { transform: translate(8px, -80px) rotate(67.94deg); }
  27% { transform: translate(8px, -80px) rotate(66.32deg); }
  27.5% { transform: translate(8px, -80px) rotate(65.4deg); }
  29.65% { transform: translate(8px, -80px) rotate(63.86deg); }
  31.35% { transform: translate(8px, -80px) rotate(65.06deg); }
  32.8% { transform: translate(8px, -80px) rotate(63.89deg); }
  33.55% { transform: translate(8px, -80px) rotate(64.05deg); }
  34.65% { transform: translate(8px, -80px) rotate(65.06deg); }
  35.75% { transform: translate(8px, -80px) rotate(64.07deg); }
  36.45% { transform: translate(8px, -80px) rotate(63.87deg); }
  38%, 40% { transform: translate(8px, -80px) rotate(65.07deg); }
  40.3% { transform: translate(8px, -80px) rotate(65.37deg); }
  40.85% { transform: translate(8px, -80px) rotate(67.31deg); }
  41.45% { transform: translate(8px, -80px) rotate(71.05deg); }
  42.05% { transform: translate(8px, -80px) rotate(75.95deg); }
  43.3% { transform: translate(8px, -80px) rotate(87.3deg); }
  43.9% { transform: translate(8px, -80px) rotate(91.94deg); }
  44.4% { transform: translate(8px, -80px) rotate(94.69deg); }
  44.9% { transform: translate(8px, -80px) rotate(95.96deg); }
  64.05% { transform: translate(8px, -80px) rotate(95.97deg); }
  64.2% { transform: translate(8px, -80px) rotate(95.49deg); }
  64.35% { transform: translate(8px, -80px) rotate(94.45deg); }
  64.65% { transform: translate(8px, -80px) rotate(90.84deg); }
  64.8% { transform: translate(8px, -80px) rotate(88.32deg); }
  65% { transform: translate(8px, -80px) rotate(84.3deg); }
  65.35% { transform: translate(8px, -80px) rotate(75.6deg); }
  65.7% { transform: translate(8px, -80px) rotate(65.14deg); }
  66.1% { transform: translate(8px, -80px) rotate(51.48deg); }
  66.55% { transform: translate(8px, -80px) rotate(34.64deg); }
  67.7% { transform: translate(8px, -80px) rotate(-10.15deg); }
  68.05% { transform: translate(8px, -80px) rotate(-22.78deg); }
  68.4% { transform: translate(8px, -80px) rotate(-34.29deg); }
  68.75% { transform: translate(8px, -80px) rotate(-44.28deg); }
  68.95% { transform: translate(8px, -80px) rotate(-49.18deg); }
  69.1% { transform: translate(8px, -80px) rotate(-52.39deg); }
  69.3% { transform: translate(8px, -80px) rotate(-55.95deg); }
  69.45% { transform: translate(8px, -80px) rotate(-58.04deg); }
  69.6% { transform: translate(8px, -80px) rotate(-59.61deg); }
  69.75% { transform: translate(8px, -80px) rotate(-60.62deg); }
  69.95% { transform: translate(8px, -80px) rotate(-61.08deg); }
  71.1% { transform: translate(8px, -80px) rotate(-59.23deg); }
  71.8% { transform: translate(8px, -80px) rotate(-59.18deg); }
  72.2% { transform: translate(8px, -80px) rotate(-59.99deg); }
  73.8% { transform: translate(8px, -80px) rotate(-64.81deg); }
  74.3% { transform: translate(8px, -80px) rotate(-65.71deg); }
  74.75% { transform: translate(8px, -80px) rotate(-66deg); }
  75.2% { transform: translate(8px, -80px) rotate(-65.75deg); }
  75.65% { transform: translate(8px, -80px) rotate(-65.01deg); }
  77.6% { transform: translate(8px, -80px) rotate(-59.3deg); }
  78.1% { transform: translate(8px, -80px) rotate(-58.35deg); }
  78.55% { transform: translate(8px, -80px) rotate(-58.01deg); }
  79% { transform: translate(8px, -80px) rotate(-58.2deg); }
  79.45% { transform: translate(8px, -80px) rotate(-58.89deg); }
  81.4% { transform: translate(8px, -80px) rotate(-64.59deg); }
  81.9% { transform: translate(8px, -80px) rotate(-65.59deg); }
  82.3% { transform: translate(8px, -80px) rotate(-65.91deg); }
  83.15% { transform: translate(8px, -80px) rotate(-65.19deg); }
  85.15% { transform: translate(8px, -80px) rotate(-60.03deg); }
  86.1% { transform: translate(8px, -80px) rotate(-58.87deg); }
  87% { transform: translate(8px, -80px) rotate(-59.47deg); }
  88.95% { transform: translate(8px, -80px) rotate(-63.45deg); }
  89.9% { transform: translate(8px, -80px) rotate(-64.37deg); }
  90.8% { transform: translate(8px, -80px) rotate(-63.94deg); }
  92.65% { transform: translate(8px, -80px) rotate(-61.16deg); }
  93.6% { transform: translate(8px, -80px) rotate(-60.41deg); }
  94.55% { transform: translate(8px, -80px) rotate(-60.66deg); }
  96.6% { transform: translate(8px, -80px) rotate(-62.63deg); }
  97.6% { transform: translate(8px, -80px) rotate(-63.18deg); }
  98.65% { transform: translate(8px, -80px) rotate(-62.95deg); }
  100% { transform: translate(8px, -80px) rotate(-61.78deg); }
}
@keyframes sd-j-fore {
  0%, 20% { transform: translate(46px, 0) rotate(-6deg); } 20.45% { transform: translate(46px, 0) rotate(-6.67deg); }
  20.9% { transform: translate(46px, 0) rotate(-8.64deg); }
  21.35% { transform: translate(46px, 0) rotate(-11.79deg); }
  21.85% { transform: translate(46px, 0) rotate(-16.5deg); } 22.4% { transform: translate(46px, 0) rotate(-22.9deg); }
  22.85% { transform: translate(46px, 0) rotate(-28.93deg); }
  23.35% { transform: translate(46px, 0) rotate(-36.3deg); }
  24.95% { transform: translate(46px, 0) rotate(-61.92deg); }
  25.55% { transform: translate(46px, 0) rotate(-71.1deg); }
  26.15% { transform: translate(46px, 0) rotate(-79.24deg); }
  26.65% { transform: translate(46px, 0) rotate(-84.86deg); }
  27.1% { transform: translate(46px, 0) rotate(-88.72deg); }
  27.55% { transform: translate(46px, 0) rotate(-91.19deg); } 28% { transform: translate(46px, 0) rotate(-92.07deg); }
  28.9% { transform: translate(46px, 0) rotate(-95.25deg); }
  29.55% { transform: translate(46px, 0) rotate(-96.23deg); }
  29.95% { transform: translate(46px, 0) rotate(-96.11deg); }
  30.35% { transform: translate(46px, 0) rotate(-95.45deg); }
  31.35% { transform: translate(46px, 0) rotate(-92.14deg); }
  32.1% { transform: translate(46px, 0) rotate(-94.88deg); }
  32.75% { transform: translate(46px, 0) rotate(-96.14deg); }
  33.15% { transform: translate(46px, 0) rotate(-96.21deg); }
  33.6% { transform: translate(46px, 0) rotate(-95.63deg); }
  34.05% { transform: translate(46px, 0) rotate(-94.42deg); }
  34.65% { transform: translate(46px, 0) rotate(-92.14deg); }
  35.6% { transform: translate(46px, 0) rotate(-95.33deg); }
  36.35% { transform: translate(46px, 0) rotate(-96.25deg); }
  37.1% { transform: translate(46px, 0) rotate(-95.25deg); }
  38%, 40% { transform: translate(46px, 0) rotate(-92.07deg); }
  40.25% { transform: translate(46px, 0) rotate(-91.37deg); }
  40.45% { transform: translate(46px, 0) rotate(-89.88deg); }
  40.7% { transform: translate(46px, 0) rotate(-86.99deg); }
  40.95% { transform: translate(46px, 0) rotate(-83.09deg); }
  41.25% { transform: translate(46px, 0) rotate(-77.33deg); }
  41.75% { transform: translate(46px, 0) rotate(-65.83deg); }
  42.7% { transform: translate(46px, 0) rotate(-41.44deg); }
  43.05% { transform: translate(46px, 0) rotate(-32.84deg); }
  43.4% { transform: translate(46px, 0) rotate(-24.97deg); }
  43.7% { transform: translate(46px, 0) rotate(-19.03deg); }
  44.05% { transform: translate(46px, 0) rotate(-13.28deg); }
  44.35% { transform: translate(46px, 0) rotate(-9.54deg); }
  44.65% { transform: translate(46px, 0) rotate(-7.07deg); }
  44.95% { transform: translate(46px, 0) rotate(-6.02deg); } 64% { transform: translate(46px, 0) rotate(-6deg); }
  64.35% { transform: translate(46px, 0) rotate(-6.33deg); }
  64.95% { transform: translate(46px, 0) rotate(-8.29deg); }
  65.6% { transform: translate(46px, 0) rotate(-11.96deg); }
  66.25% { transform: translate(46px, 0) rotate(-16.76deg); }
  68.1% { transform: translate(46px, 0) rotate(-31.93deg); } 68.7% { transform: translate(46px, 0) rotate(-35.9deg); }
  69.15%, 69.45% { transform: translate(46px, 0) rotate(-38.01deg); }
  69.75% { transform: translate(46px, 0) rotate(-36.67deg); } 70% { transform: translate(46px, 0) rotate(-34.65deg); }
  70.75% { transform: translate(46px, 0) rotate(-27.29deg); }
  71.15% { transform: translate(46px, 0) rotate(-24.5deg); }
  71.5% { transform: translate(46px, 0) rotate(-23.66deg); }
  71.8% { transform: translate(46px, 0) rotate(-24.51deg); } 72% { transform: translate(46px, 0) rotate(-25.98deg); }
  72.2% { transform: translate(46px, 0) rotate(-28.92deg); }
  73.35% { transform: translate(46px, 0) rotate(-48.8deg); }
  73.8% { transform: translate(46px, 0) rotate(-55.46deg); }
  74.05% { transform: translate(46px, 0) rotate(-58.31deg); }
  74.3% { transform: translate(46px, 0) rotate(-60.4deg); }
  74.55% { transform: translate(46px, 0) rotate(-61.65deg); } 74.75% { transform: translate(46px, 0) rotate(-62deg); }
  74.95% { transform: translate(46px, 0) rotate(-61.76deg); }
  75.2% { transform: translate(46px, 0) rotate(-60.65deg); }
  75.4% { transform: translate(46px, 0) rotate(-59.14deg); }
  75.65% { transform: translate(46px, 0) rotate(-56.55deg); }
  75.9% { transform: translate(46px, 0) rotate(-53.26deg); }
  76.15% { transform: translate(46px, 0) rotate(-49.43deg); }
  77.15% { transform: translate(46px, 0) rotate(-31.97deg); }
  77.6% { transform: translate(46px, 0) rotate(-25.14deg); }
  77.85% { transform: translate(46px, 0) rotate(-22.16deg); }
  78.1% { transform: translate(46px, 0) rotate(-19.92deg); }
  78.35% { transform: translate(46px, 0) rotate(-18.51deg); }
  78.55% { transform: translate(46px, 0) rotate(-18.03deg); }
  78.75% { transform: translate(46px, 0) rotate(-18.13deg); } 79% { transform: translate(46px, 0) rotate(-19.08deg); }
  79.2% { transform: translate(46px, 0) rotate(-20.46deg); }
  79.45% { transform: translate(46px, 0) rotate(-22.92deg); }
  79.7% { transform: translate(46px, 0) rotate(-26.08deg); }
  79.95% { transform: translate(46px, 0) rotate(-29.83deg); } 81% { transform: translate(46px, 0) rotate(-48.1deg); }
  81.4% { transform: translate(46px, 0) rotate(-54.24deg); }
  81.65% { transform: translate(46px, 0) rotate(-57.34deg); }
  81.9% { transform: translate(46px, 0) rotate(-59.73deg); }
  82.1% { transform: translate(46px, 0) rotate(-60.94deg); }
  82.3% { transform: translate(46px, 0) rotate(-61.48deg); }
  82.5% { transform: translate(46px, 0) rotate(-61.44deg); }
  82.7% { transform: translate(46px, 0) rotate(-60.83deg); }
  82.9% { transform: translate(46px, 0) rotate(-59.68deg); }
  83.15% { transform: translate(46px, 0) rotate(-57.54deg); }
  83.4% { transform: translate(46px, 0) rotate(-54.74deg); }
  83.65% { transform: translate(46px, 0) rotate(-51.4deg); }
  84.7% { transform: translate(46px, 0) rotate(-35.15deg); }
  85.15% { transform: translate(46px, 0) rotate(-29.15deg); }
  85.4% { transform: translate(46px, 0) rotate(-26.53deg); }
  85.65% { transform: translate(46px, 0) rotate(-24.55deg); }
  85.9% { transform: translate(46px, 0) rotate(-23.26deg); }
  86.1% { transform: translate(46px, 0) rotate(-22.76deg); }
  86.3% { transform: translate(46px, 0) rotate(-22.73deg); }
  86.55% { transform: translate(46px, 0) rotate(-23.34deg); } 87% { transform: translate(46px, 0) rotate(-26.07deg); }
  87.45% { transform: translate(46px, 0) rotate(-30.47deg); }
  88.5% { transform: translate(46px, 0) rotate(-43.24deg); }
  88.95% { transform: translate(46px, 0) rotate(-47.96deg); }
  89.45% { transform: translate(46px, 0) rotate(-51.59deg); }
  89.9% { transform: translate(46px, 0) rotate(-53.02deg); }
  90.35% { transform: translate(46px, 0) rotate(-52.65deg); }
  90.8% { transform: translate(46px, 0) rotate(-50.64deg); }
  91.25% { transform: translate(46px, 0) rotate(-47.39deg); }
  92.2% { transform: translate(46px, 0) rotate(-38.92deg); }
  92.65% { transform: translate(46px, 0) rotate(-35.36deg); }
  93.15% { transform: translate(46px, 0) rotate(-32.52deg); }
  93.6% { transform: translate(46px, 0) rotate(-31.25deg); }
  94.05% { transform: translate(46px, 0) rotate(-31.26deg); }
  94.55% { transform: translate(46px, 0) rotate(-32.62deg); } 95% { transform: translate(46px, 0) rotate(-34.73deg); }
  96.6% { transform: translate(46px, 0) rotate(-43.47deg); }
  97.1% { transform: translate(46px, 0) rotate(-45.41deg); }
  97.6% { transform: translate(46px, 0) rotate(-46.47deg); }
  98.1% { transform: translate(46px, 0) rotate(-46.46deg); }
  98.65% { transform: translate(46px, 0) rotate(-45.23deg); }
  99.2% { transform: translate(46px, 0) rotate(-42.96deg); } 100% { transform: translate(46px, 0) rotate(-38.76deg); }
}
@keyframes sd-j-farm {
  0% { transform: translate(-4px, -86px) rotate(101.52deg); }
  6.35% { transform: translate(-4px, -86px) rotate(101.53deg); }
  8.55% { transform: translate(-4px, -86px) rotate(102.28deg); }
  11.25% { transform: translate(-4px, -86px) rotate(104.31deg); }
  18.3% { transform: translate(-4px, -86px) rotate(111.05deg); }
  22.55% { transform: translate(-4px, -86px) rotate(113.67deg); }
  26.15% { transform: translate(-4px, -86px) rotate(116.49deg); }
  27.75% { transform: translate(-4px, -86px) rotate(117.15deg); }
  40.25% { transform: translate(-4px, -86px) rotate(117.12deg); }
  41.25% { transform: translate(-4px, -86px) rotate(116.39deg); }
  43.75% { transform: translate(-4px, -86px) rotate(113.32deg); }
  44.95%, 100% { transform: translate(-4px, -86px) rotate(112.67deg); }
}
@keyframes sd-j-ffore {
  0% { transform: translate(40px, 0) rotate(110.48deg); } 6.45% { transform: translate(40px, 0) rotate(110.41deg); }
  7.7% { transform: translate(40px, 0) rotate(109.57deg); } 9.05% { transform: translate(40px, 0) rotate(107.7deg); }
  10.4% { transform: translate(40px, 0) rotate(105.01deg); }
  11.9% { transform: translate(40px, 0) rotate(101.25deg); } 16.8% { transform: translate(40px, 0) rotate(86.45deg); }
  18.5% { transform: translate(40px, 0) rotate(81.88deg); } 22.55% { transform: translate(40px, 0) rotate(74.01deg); }
  26.1% { transform: translate(40px, 0) rotate(65.23deg); } 26.95% { transform: translate(40px, 0) rotate(63.79deg); }
  27.75% { transform: translate(40px, 0) rotate(63.11deg); }
  40.25% { transform: translate(40px, 0) rotate(63.18deg); } 40.75% { transform: translate(40px, 0) rotate(64deg); }
  41.3% { transform: translate(40px, 0) rotate(65.61deg); } 43.1% { transform: translate(40px, 0) rotate(72.88deg); }
  43.75% { transform: translate(40px, 0) rotate(75.13deg); } 44.4% { transform: translate(40px, 0) rotate(76.67deg); }
  44.95%, 100% { transform: translate(40px, 0) rotate(77.19deg); }
}
@keyframes sd-boy-move {
  0%, 49% { transform: translate(800px, 1166px) scale(1); }
  76%, 100% { transform: translate(1062px, 976px) scale(0.5); }
}
@keyframes sd-boy-bob {
  0%, 49% { transform: translate(0, 0); } 49.45% { transform: translate(0, -1.1px); }
  50.5% { transform: translate(0, -5px); } 51.1% { transform: translate(0, -3.91px); }
  51.95% { transform: translate(0, -0.05px); } 52.75% { transform: translate(0, -3.8px); }
  53.1% { transform: translate(0, -4.73px); } 53.4% { transform: translate(0, -5px); }
  53.7% { transform: translate(0, -4.76px); } 54.05% { transform: translate(0, -3.88px); }
  54.9% { transform: translate(0, -0.09px); } 55.7% { transform: translate(0, -3.83px); }
  56.05% { transform: translate(0, -4.74px); } 56.35% { transform: translate(0, -5px); }
  56.65% { transform: translate(0, -4.75px); } 57% { transform: translate(0, -3.85px); }
  57.8% { transform: translate(0, -0.13px); } 58.8% { transform: translate(0, -4.32px); }
  59.15% { transform: translate(0, -4.94px); } 59.5% { transform: translate(0, -4.88px); }
  60.05% { transform: translate(0, -3.46px); } 60.75% { transform: translate(0, -0.08px); }
  61.65% { transform: translate(0, -4.05px); } 62% { transform: translate(0, -4.84px); }
  62.35% { transform: translate(0, -4.96px); } 62.95% { transform: translate(0, -3.61px); }
  63.7% { transform: translate(0, -0.03px); } 64.6% { transform: translate(0, -4.08px); }
  64.95% { transform: translate(0, -4.85px); } 65.25% { transform: translate(0, -4.98px); }
  65.85% { transform: translate(0, -3.76px); } 66.65% { transform: translate(0, -0.02px); }
  67.35% { transform: translate(0, -3.41px); } 67.9% { transform: translate(0, -4.87px); }
  68.25% { transform: translate(0, -4.95px); } 68.65% { transform: translate(0, -4.21px); }
  69% { transform: translate(0, -2.94px); } 69.6% { transform: translate(0, -0.06px); }
  70.45% { transform: translate(0, -3.98px); } 70.8% { transform: translate(0, -4.81px); }
  71.1% { transform: translate(0, -5px); } 71.7% { transform: translate(0, -3.87px); }
  72.55% { transform: translate(0, -0.11px); } 73.35% { transform: translate(0, -3.84px); }
  73.7% { transform: translate(0, -4.75px); } 74% { transform: translate(0, -5px); }
  75.05% { transform: translate(0, -1.03px); } 75.45% { transform: translate(0, -0.03px); }
  100% { transform: translate(0, 0); }
}
@keyframes sd-boy-fade {
  0%, 71.1% { opacity: 1; } 71.15% { opacity: 0.9979; } 76%, 100% { opacity: 0; }
}
@keyframes sd-boy-turn-l {
  0%, 46% { opacity: 1; } 48.5%, 100% { opacity: 0; }
}
@keyframes sd-boy-turn-r {
  0%, 46% { opacity: 0; } 48.5%, 100% { opacity: 1; }
}
@keyframes sd-boy-legf {
  0%, 48.5% { transform: rotate(0); } 48.75% { transform: rotate(-0.66deg); } 49.05% { transform: rotate(0.29deg); }
  49.35% { transform: rotate(3.1deg); } 49.6% { transform: rotate(6.58deg); } 50.2% { transform: rotate(16.29deg); }
  50.5% { transform: rotate(19.99deg); } 50.65% { transform: rotate(19.63deg); }
  50.85% { transform: rotate(18.38deg); } 51.05% { transform: rotate(16.29deg); }
  51.25% { transform: rotate(13.46deg); } 51.6% { transform: rotate(7.13deg); }
  52.35% { transform: rotate(-8.46deg); } 52.55% { transform: rotate(-12.11deg); }
  52.75% { transform: rotate(-15.21deg); } 52.95% { transform: rotate(-17.62deg); }
  53.1% { transform: rotate(-18.9deg); } 53.3% { transform: rotate(-19.86deg); }
  53.45% { transform: rotate(-19.98deg); } 53.6% { transform: rotate(-19.6deg); }
  53.8% { transform: rotate(-18.3deg); } 54% { transform: rotate(-16.18deg); } 54.2% { transform: rotate(-13.32deg); }
  54.55% { transform: rotate(-6.95deg); } 55.3% { transform: rotate(8.63deg); } 55.5% { transform: rotate(12.26deg); }
  55.7% { transform: rotate(15.33deg); } 55.9% { transform: rotate(17.7deg); } 56.05% { transform: rotate(18.96deg); }
  56.2% { transform: rotate(19.73deg); } 56.35% { transform: rotate(20deg); } 56.5% { transform: rotate(19.75deg); }
  56.7% { transform: rotate(18.64deg); } 56.9% { transform: rotate(16.68deg); } 57.1% { transform: rotate(13.96deg); }
  57.45% { transform: rotate(7.77deg); } 58.25% { transform: rotate(-8.8deg); }
  58.45% { transform: rotate(-12.41deg); } 58.65% { transform: rotate(-15.45deg); }
  58.85% { transform: rotate(-17.79deg); } 59% { transform: rotate(-19.02deg); }
  59.15% { transform: rotate(-19.76deg); } 59.3% { transform: rotate(-20deg); }
  59.45% { transform: rotate(-19.72deg); } 59.65% { transform: rotate(-18.57deg); }
  59.85% { transform: rotate(-16.58deg); } 60.05% { transform: rotate(-13.83deg); }
  60.4% { transform: rotate(-7.6deg); } 61.2% { transform: rotate(8.97deg); } 61.4% { transform: rotate(12.55deg); }
  61.6% { transform: rotate(15.57deg); } 61.8% { transform: rotate(17.88deg); }
  61.95% { transform: rotate(19.08deg); } 62.1% { transform: rotate(19.79deg); } 62.25% { transform: rotate(20deg); }
  62.4% { transform: rotate(19.69deg); } 62.6% { transform: rotate(18.5deg); } 62.8% { transform: rotate(16.47deg); }
  63% { transform: rotate(13.69deg); } 63.35% { transform: rotate(7.42deg); } 64.15% { transform: rotate(-9.14deg); }
  64.35% { transform: rotate(-12.7deg); } 64.55% { transform: rotate(-15.69deg); }
  64.75% { transform: rotate(-17.96deg); } 64.9% { transform: rotate(-19.13deg); }
  65.05% { transform: rotate(-19.82deg); } 65.2% { transform: rotate(-19.99deg); }
  65.35% { transform: rotate(-19.66deg); } 65.55% { transform: rotate(-18.43deg); }
  65.75% { transform: rotate(-16.36deg); } 65.95% { transform: rotate(-13.55deg); }
  66.3% { transform: rotate(-7.25deg); } 67.1% { transform: rotate(9.3deg); } 67.45% { transform: rotate(15.13deg); }
  67.65% { transform: rotate(17.56deg); } 67.8% { transform: rotate(18.86deg); } 68% { transform: rotate(19.84deg); }
  68.15% { transform: rotate(19.99deg); } 68.3% { transform: rotate(19.62deg); }
  68.5% { transform: rotate(18.36deg); } 68.7% { transform: rotate(16.25deg); } 68.9% { transform: rotate(13.41deg); }
  69.25% { transform: rotate(7.07deg); } 70% { transform: rotate(-8.52deg); } 70.2% { transform: rotate(-12.16deg); }
  70.4% { transform: rotate(-15.25deg); } 70.6% { transform: rotate(-17.65deg); }
  70.75% { transform: rotate(-18.92deg); } 70.9% { transform: rotate(-19.71deg); }
  71.05% { transform: rotate(-20deg); } 71.2% { transform: rotate(-19.77deg); }
  71.35% { transform: rotate(-19.04deg); } 71.5% { transform: rotate(-17.82deg); }
  71.7% { transform: rotate(-15.49deg); } 71.9% { transform: rotate(-12.46deg); }
  72.1% { transform: rotate(-8.86deg); } 72.9% { transform: rotate(7.71deg); } 73.25% { transform: rotate(13.92deg); }
  73.45% { transform: rotate(16.65deg); } 73.65% { transform: rotate(18.62deg); }
  73.85% { transform: rotate(19.74deg); } 74% { transform: rotate(20deg); } 74.3% { transform: rotate(16.13deg); }
  74.85% { transform: rotate(7.08deg); } 75.15% { transform: rotate(2.85deg); } 75.45% { transform: rotate(0.12deg); }
  75.7% { transform: rotate(-0.73deg); } 76%, 100% { transform: rotate(0); }
}
@keyframes sd-boy-legb {
  0%, 48.5% { transform: rotate(0); } 48.75% { transform: rotate(0.66deg); } 49.05% { transform: rotate(-0.29deg); }
  49.35% { transform: rotate(-3.1deg); } 49.6% { transform: rotate(-6.58deg); }
  50.2% { transform: rotate(-16.29deg); } 50.5% { transform: rotate(-19.99deg); }
  50.65% { transform: rotate(-19.63deg); } 50.85% { transform: rotate(-18.38deg); }
  51.05% { transform: rotate(-16.29deg); } 51.25% { transform: rotate(-13.46deg); }
  51.6% { transform: rotate(-7.13deg); } 52.35% { transform: rotate(8.46deg); }
  52.55% { transform: rotate(12.11deg); } 52.75% { transform: rotate(15.21deg); }
  52.95% { transform: rotate(17.62deg); } 53.1% { transform: rotate(18.9deg); } 53.3% { transform: rotate(19.86deg); }
  53.45% { transform: rotate(19.98deg); } 53.6% { transform: rotate(19.6deg); } 53.8% { transform: rotate(18.3deg); }
  54% { transform: rotate(16.18deg); } 54.2% { transform: rotate(13.32deg); } 54.55% { transform: rotate(6.95deg); }
  55.3% { transform: rotate(-8.63deg); } 55.5% { transform: rotate(-12.26deg); }
  55.7% { transform: rotate(-15.33deg); } 55.9% { transform: rotate(-17.7deg); }
  56.05% { transform: rotate(-18.96deg); } 56.2% { transform: rotate(-19.73deg); }
  56.35% { transform: rotate(-20deg); } 56.5% { transform: rotate(-19.75deg); }
  56.7% { transform: rotate(-18.64deg); } 56.9% { transform: rotate(-16.68deg); }
  57.1% { transform: rotate(-13.96deg); } 57.45% { transform: rotate(-7.77deg); }
  58.25% { transform: rotate(8.8deg); } 58.45% { transform: rotate(12.41deg); }
  58.65% { transform: rotate(15.45deg); } 58.85% { transform: rotate(17.79deg); } 59% { transform: rotate(19.02deg); }
  59.15% { transform: rotate(19.76deg); } 59.3% { transform: rotate(20deg); } 59.45% { transform: rotate(19.72deg); }
  59.65% { transform: rotate(18.57deg); } 59.85% { transform: rotate(16.58deg); }
  60.05% { transform: rotate(13.83deg); } 60.4% { transform: rotate(7.6deg); } 61.2% { transform: rotate(-8.97deg); }
  61.4% { transform: rotate(-12.55deg); } 61.6% { transform: rotate(-15.57deg); }
  61.8% { transform: rotate(-17.88deg); } 61.95% { transform: rotate(-19.08deg); }
  62.1% { transform: rotate(-19.79deg); } 62.25% { transform: rotate(-20deg); }
  62.4% { transform: rotate(-19.69deg); } 62.6% { transform: rotate(-18.5deg); }
  62.8% { transform: rotate(-16.47deg); } 63% { transform: rotate(-13.69deg); }
  63.35% { transform: rotate(-7.42deg); } 64.15% { transform: rotate(9.14deg); }
  64.35% { transform: rotate(12.7deg); } 64.55% { transform: rotate(15.69deg); }
  64.75% { transform: rotate(17.96deg); } 64.9% { transform: rotate(19.13deg); }
  65.05% { transform: rotate(19.82deg); } 65.2% { transform: rotate(19.99deg); }
  65.35% { transform: rotate(19.66deg); } 65.55% { transform: rotate(18.43deg); }
  65.75% { transform: rotate(16.36deg); } 65.95% { transform: rotate(13.55deg); }
  66.3% { transform: rotate(7.25deg); } 67.1% { transform: rotate(-9.3deg); } 67.45% { transform: rotate(-15.13deg); }
  67.65% { transform: rotate(-17.56deg); } 67.8% { transform: rotate(-18.86deg); }
  68% { transform: rotate(-19.84deg); } 68.15% { transform: rotate(-19.99deg); }
  68.3% { transform: rotate(-19.62deg); } 68.5% { transform: rotate(-18.36deg); }
  68.7% { transform: rotate(-16.25deg); } 68.9% { transform: rotate(-13.41deg); }
  69.25% { transform: rotate(-7.07deg); } 70% { transform: rotate(8.52deg); } 70.2% { transform: rotate(12.16deg); }
  70.4% { transform: rotate(15.25deg); } 70.6% { transform: rotate(17.65deg); }
  70.75% { transform: rotate(18.92deg); } 70.9% { transform: rotate(19.71deg); } 71.05% { transform: rotate(20deg); }
  71.2% { transform: rotate(19.77deg); } 71.35% { transform: rotate(19.04deg); }
  71.5% { transform: rotate(17.82deg); } 71.7% { transform: rotate(15.49deg); } 71.9% { transform: rotate(12.46deg); }
  72.1% { transform: rotate(8.86deg); } 72.9% { transform: rotate(-7.71deg); }
  73.25% { transform: rotate(-13.92deg); } 73.45% { transform: rotate(-16.65deg); }
  73.65% { transform: rotate(-18.62deg); } 73.85% { transform: rotate(-19.74deg); } 74% { transform: rotate(-20deg); }
  74.3% { transform: rotate(-16.13deg); } 74.85% { transform: rotate(-7.08deg); }
  75.15% { transform: rotate(-2.85deg); } 75.45% { transform: rotate(-0.12deg); }
  75.7% { transform: rotate(0.73deg); } 76%, 100% { transform: rotate(0); }
}
@keyframes sd-boy-arm {
  0%, 48.5% { transform: translate(2px, -214px) rotate(84deg); }
  48.75% { transform: translate(2px, -214px) rotate(84.59deg); }
  49.05% { transform: translate(2px, -214px) rotate(83.74deg); }
  49.35% { transform: translate(2px, -214px) rotate(81.21deg); }
  49.6% { transform: translate(2px, -214px) rotate(78.08deg); }
  50.2% { transform: translate(2px, -214px) rotate(69.33deg); }
  50.5% { transform: translate(2px, -214px) rotate(66.01deg); }
  50.65% { transform: translate(2px, -214px) rotate(66.33deg); }
  50.85% { transform: translate(2px, -214px) rotate(67.46deg); }
  51.05% { transform: translate(2px, -214px) rotate(69.34deg); }
  51.25% { transform: translate(2px, -214px) rotate(71.89deg); }
  51.6% { transform: translate(2px, -214px) rotate(77.58deg); }
  52.35% { transform: translate(2px, -214px) rotate(91.61deg); }
  52.75% { transform: translate(2px, -214px) rotate(97.69deg); }
  52.95% { transform: translate(2px, -214px) rotate(99.85deg); }
  53.1% { transform: translate(2px, -214px) rotate(101.01deg); }
  53.3% { transform: translate(2px, -214px) rotate(101.87deg); }
  53.45% { transform: translate(2px, -214px) rotate(101.98deg); }
  53.6% { transform: translate(2px, -214px) rotate(101.64deg); }
  53.8% { transform: translate(2px, -214px) rotate(100.47deg); }
  54% { transform: translate(2px, -214px) rotate(98.56deg); }
  54.2% { transform: translate(2px, -214px) rotate(95.99deg); }
  54.55% { transform: translate(2px, -214px) rotate(90.26deg); }
  55.3% { transform: translate(2px, -214px) rotate(76.23deg); }
  55.5% { transform: translate(2px, -214px) rotate(72.97deg); }
  55.7% { transform: translate(2px, -214px) rotate(70.2deg); }
  55.9% { transform: translate(2px, -214px) rotate(68.07deg); }
  56.05% { transform: translate(2px, -214px) rotate(66.93deg); }
  56.35% { transform: translate(2px, -214px) rotate(66deg); }
  56.5% { transform: translate(2px, -214px) rotate(66.22deg); }
  56.7% { transform: translate(2px, -214px) rotate(67.22deg); }
  56.9% { transform: translate(2px, -214px) rotate(68.99deg); }
  57.1% { transform: translate(2px, -214px) rotate(71.43deg); }
  57.45% { transform: translate(2px, -214px) rotate(77.01deg); }
  58.25% { transform: translate(2px, -214px) rotate(91.92deg); }
  58.45% { transform: translate(2px, -214px) rotate(95.17deg); }
  58.65% { transform: translate(2px, -214px) rotate(97.91deg); }
  58.85% { transform: translate(2px, -214px) rotate(100.01deg); }
  59% { transform: translate(2px, -214px) rotate(101.12deg); }
  59.3% { transform: translate(2px, -214px) rotate(102deg); }
  59.45% { transform: translate(2px, -214px) rotate(101.75deg); }
  59.65% { transform: translate(2px, -214px) rotate(100.72deg); }
  59.85% { transform: translate(2px, -214px) rotate(98.92deg); }
  60.05% { transform: translate(2px, -214px) rotate(96.44deg); }
  60.4% { transform: translate(2px, -214px) rotate(90.84deg); }
  61.2% { transform: translate(2px, -214px) rotate(75.93deg); }
  61.4% { transform: translate(2px, -214px) rotate(72.7deg); }
  61.6% { transform: translate(2px, -214px) rotate(69.99deg); }
  61.8% { transform: translate(2px, -214px) rotate(67.91deg); }
  61.95% { transform: translate(2px, -214px) rotate(66.83deg); }
  62.25% { transform: translate(2px, -214px) rotate(66deg); }
  62.4% { transform: translate(2px, -214px) rotate(66.28deg); }
  62.6% { transform: translate(2px, -214px) rotate(67.35deg); }
  62.8% { transform: translate(2px, -214px) rotate(69.18deg); }
  63% { transform: translate(2px, -214px) rotate(71.68deg); }
  63.35% { transform: translate(2px, -214px) rotate(77.32deg); }
  64.15% { transform: translate(2px, -214px) rotate(92.22deg); }
  64.35% { transform: translate(2px, -214px) rotate(95.43deg); }
  64.55% { transform: translate(2px, -214px) rotate(98.12deg); }
  64.75% { transform: translate(2px, -214px) rotate(100.16deg); }
  64.9% { transform: translate(2px, -214px) rotate(101.22deg); }
  65.2% { transform: translate(2px, -214px) rotate(101.99deg); }
  65.35% { transform: translate(2px, -214px) rotate(101.69deg); }
  65.55% { transform: translate(2px, -214px) rotate(100.59deg); }
  65.75% { transform: translate(2px, -214px) rotate(98.73deg); }
  65.95% { transform: translate(2px, -214px) rotate(96.2deg); }
  66.3% { transform: translate(2px, -214px) rotate(90.52deg); }
  67.1% { transform: translate(2px, -214px) rotate(75.63deg); }
  67.45% { transform: translate(2px, -214px) rotate(70.39deg); }
  67.65% { transform: translate(2px, -214px) rotate(68.2deg); }
  67.8% { transform: translate(2px, -214px) rotate(67.03deg); }
  68% { transform: translate(2px, -214px) rotate(66.14deg); }
  68.15% { transform: translate(2px, -214px) rotate(66.01deg); }
  68.3% { transform: translate(2px, -214px) rotate(66.34deg); }
  68.5% { transform: translate(2px, -214px) rotate(67.48deg); }
  68.7% { transform: translate(2px, -214px) rotate(69.37deg); }
  68.9% { transform: translate(2px, -214px) rotate(71.93deg); }
  69.25% { transform: translate(2px, -214px) rotate(77.64deg); }
  70% { transform: translate(2px, -214px) rotate(91.66deg); }
  70.4% { transform: translate(2px, -214px) rotate(97.72deg); }
  70.6% { transform: translate(2px, -214px) rotate(99.88deg); }
  70.75% { transform: translate(2px, -214px) rotate(101.03deg); }
  71.05% { transform: translate(2px, -214px) rotate(102deg); }
  71.35% { transform: translate(2px, -214px) rotate(101.14deg); }
  71.5% { transform: translate(2px, -214px) rotate(100.04deg); }
  71.7% { transform: translate(2px, -214px) rotate(97.94deg); }
  71.9% { transform: translate(2px, -214px) rotate(95.21deg); }
  72.1% { transform: translate(2px, -214px) rotate(91.97deg); }
  72.9% { transform: translate(2px, -214px) rotate(77.06deg); }
  73.25% { transform: translate(2px, -214px) rotate(71.47deg); }
  73.45% { transform: translate(2px, -214px) rotate(69.02deg); }
  73.65% { transform: translate(2px, -214px) rotate(67.24deg); }
  73.85% { transform: translate(2px, -214px) rotate(66.23deg); }
  74% { transform: translate(2px, -214px) rotate(66deg); }
  74.3% { transform: translate(2px, -214px) rotate(69.48deg); }
  74.85% { transform: translate(2px, -214px) rotate(77.63deg); }
  75.15% { transform: translate(2px, -214px) rotate(81.43deg); }
  75.45% { transform: translate(2px, -214px) rotate(83.89deg); }
  75.7% { transform: translate(2px, -214px) rotate(84.66deg); }
  76%, 100% { transform: translate(2px, -214px) rotate(84deg); }
}
@keyframes sd-boy-look {
  0% { transform: rotate(-26deg); } 6.3% { transform: rotate(-25.99deg); } 8.35% { transform: rotate(-25.42deg); }
  11.15% { transform: rotate(-23.56deg); } 17.7% { transform: rotate(-17.78deg); }
  21% { transform: rotate(-16.11deg); } 45.05% { transform: rotate(-15.99deg); }
  45.4% { transform: rotate(-15.22deg); } 45.75% { transform: rotate(-13.5deg); }
  46.95% { transform: rotate(-4.51deg); } 47.35% { transform: rotate(-1.93deg); }
  47.7% { transform: rotate(-0.45deg); } 48%, 100% { transform: rotate(0); }
}
@keyframes sd-ship-depart {
  0%, 76% { transform: translate(0, 0); } 77% { transform: translate(0.56px, -0.04px); }
  78.15% { transform: translate(1.9px, -0.13px); } 79.35% { transform: translate(3.85px, -0.26px); }
  80.65% { transform: translate(6.51px, -0.43px); } 82% { transform: translate(9.79px, -0.65px); }
  84.75% { transform: translate(17.91px, -1.19px); } 87.65% { transform: translate(28.32px, -1.89px); }
  90.65% { transform: translate(40.85px, -2.72px); } 93.7% { transform: translate(55.29px, -3.69px); }
  96.8% { transform: translate(71.58px, -4.77px); } 100% { transform: translate(90px, -6px); }
}
@keyframes sd-sail {
  0% { transform: scaleY(0.05); } 68.1% { transform: scaleY(0.0504); } 68.3% { transform: scaleY(0.0539); }
  68.5% { transform: scaleY(0.0607); } 68.7% { transform: scaleY(0.0705); } 68.9% { transform: scaleY(0.0834); }
  69.1% { transform: scaleY(0.0989); } 69.35% { transform: scaleY(0.122); } 69.55% { transform: scaleY(0.1432); }
  69.8% { transform: scaleY(0.1726); } 70.05% { transform: scaleY(0.2052); } 70.3% { transform: scaleY(0.2404); }
  70.55% { transform: scaleY(0.278); } 70.8% { transform: scaleY(0.3177); } 71.35% { transform: scaleY(0.4102); }
  72.5% { transform: scaleY(0.6136); } 72.95% { transform: scaleY(0.691); } 73.4% { transform: scaleY(0.7642); }
  73.85% { transform: scaleY(0.831); } 74.1% { transform: scaleY(0.8647); } 74.35% { transform: scaleY(0.8954); }
  74.6% { transform: scaleY(0.9229); } 74.8% { transform: scaleY(0.9423); } 75.05% { transform: scaleY(0.963); }
  75.25% { transform: scaleY(0.9765); } 75.45% { transform: scaleY(0.9871); } 75.65% { transform: scaleY(0.9947); }
  75.85% { transform: scaleY(0.999); } 76%, 100% { transform: scaleY(1); }
}
@keyframes sd-oar {
  0%, 74% { transform: rotate(8deg); } 74.75% { transform: rotate(1.9deg); } 75.35% { transform: rotate(-1.97deg); }
  75.9% { transform: rotate(-4.19deg); } 76.45% { transform: rotate(-4.89deg); } 77% { transform: rotate(-3.92deg); }
  77.6% { transform: rotate(-1.01deg); } 78% { transform: rotate(1.9deg); } 78.6% { transform: rotate(7.49deg); }
  79.15% { transform: rotate(12.06deg); } 79.6% { transform: rotate(15.22deg); } 80% { transform: rotate(17.45deg); }
  80.55% { transform: rotate(19.45deg); } 82% { transform: rotate(22deg); } 82.2% { transform: rotate(21.59deg); }
  82.4% { transform: rotate(20.41deg); } 82.6% { transform: rotate(18.57deg); } 82.8% { transform: rotate(16.14deg); }
  83.05% { transform: rotate(12.44deg); } 83.3% { transform: rotate(8.14deg); }
  84.35% { transform: rotate(-12.3deg); } 84.8% { transform: rotate(-20deg); }
  85.05% { transform: rotate(-23.42deg); } 85.3% { transform: rotate(-26.01deg); }
  85.55% { transform: rotate(-27.59deg); } 85.75% { transform: rotate(-28deg); } 86.5% { transform: rotate(-26deg); }
  86.8% { transform: rotate(-25.75deg); } 87.15% { transform: rotate(-24.88deg); }
  87.6% { transform: rotate(-22.95deg); } 88.05% { transform: rotate(-20.23deg); }
  88.5% { transform: rotate(-16.88deg); } 89% { transform: rotate(-12.59deg); } 91.2% { transform: rotate(8.37deg); }
  91.75% { transform: rotate(12.81deg); } 92.25% { transform: rotate(16.12deg); }
  92.65% { transform: rotate(18.13deg); } 93% { transform: rotate(19.33deg); } 94.5% { transform: rotate(22deg); }
  94.7% { transform: rotate(21.59deg); } 94.95% { transform: rotate(20.01deg); }
  95.15% { transform: rotate(18.01deg); } 95.4% { transform: rotate(14.74deg); }
  95.85% { transform: rotate(7.23deg); } 96.75% { transform: rotate(-10.4deg); }
  97.1% { transform: rotate(-16.78deg); } 97.45% { transform: rotate(-22.14deg); }
  97.8% { transform: rotate(-26.01deg); } 98.05% { transform: rotate(-27.59deg); }
  98.25% { transform: rotate(-28deg); } 99% { transform: rotate(-26deg); } 99.5% { transform: rotate(-25.33deg); }
  100% { transform: rotate(-23.45deg); }
}
@keyframes sd-veil {
  0% { opacity: 0; visibility: hidden; } 87.5% { visibility: hidden; } 88.25% { opacity: 0.0013; } 88.9% { opacity: 0.016; } 89.6% { opacity: 0.0486; }
  90.3% { opacity: 0.0961; } 91.1% { opacity: 0.1657; } 92.55% { opacity: 0.3223; } 95.85% { opacity: 0.7239; }
  96.65% { opacity: 0.8097; } 97.4% { opacity: 0.8795; } 98.1% { opacity: 0.9327; } 98.75% { opacity: 0.9697; }
  99.4% { opacity: 0.9927; } 100% { opacity: 1; }
}
@keyframes sd-dark {
  0% { opacity: 1; } 9%, 100% { opacity: 0; visibility: hidden; }
}
@keyframes sd-boy-rim {
  0%, 71.14% { opacity: 1; } 71.15%, 100% { opacity: 0; }
}
</style>
