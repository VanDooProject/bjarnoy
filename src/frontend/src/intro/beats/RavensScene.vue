<script setup lang="ts">
import { useId } from 'vue';
import IntroLongship from './IntroLongship.vue';

/**
 * Beat 4, the ravens: the camera goes on turning with the longship, out to sea, from where the sending left
 * it (same horizon at y 785, the ship at the same place and size). Bjarnøy comes in from the right with two
 * ravens rising off it, the moon comes in from the right, rising and growing, and the seabed comes up from
 * below: a sleeping giant. A closed eye glows, runes light up on the brow, and its breath rises as bubbles that
 * break the surface. Night lifts toward dawn over the beat. Then the scene pushes into the moon, now behind the
 * ship, while the second raven crosses it: the push ends with the ship exactly where the fog hold draws it,
 * on moonlight that has turned the colour of the fog.
 * The story is timed on `--beat-duration` (set by the host from the voice clip: 8.8 s in English, 9.5 s in
 * German); the eye flickers once on "not empty", the giant wakes on "under the sea" at about 60 %, and
 * the push starts at 88 %, after the voice. Wing beats, kelp, bubble rises, rings, the rowing and the
 * first raven's flight run on fixed times, so a longer beat does not slow them down.
 */
defineProps<{ paused?: boolean }>();

const uid = useId().replace(/[^a-zA-Z0-9]/g, '-');
const id = (name: string) => `${uid}-${name}`;
const url = (name: string) => `url(#${id(name)})`;

// night (palette A) to dawn: each layer's colour at the start and at the end of the lift
const dawn = (c0: string, c1: string) => ({ '--c0': c0, '--c1': c1 });
const C = {
  sky0: dawn('#161b23', '#5d6874'),
  sky1: dawn('#1d232c', '#6e7a86'),
  sky2: dawn('#252c36', '#7d8994'),
  sky3: dawn('#313a45', '#8d99a3'),
  skerry: dawn('#3c4652', '#7f8b95'),
  isle: dawn('#1d232b', '#4a5560'),
  farWater: dawn('#1f2830', '#8d9ca7'),
  surf: dawn('#26313a', '#55636e'),
  surfLine: dawn('#3d4a55', '#74838f'),
  deep0: dawn('#1f2931', '#3f4c57'),
  deep1: dawn('#182128', '#323e48'),
  front: dawn('#090d11', '#1b232b'),
};
</script>

<template>
  <div class="ravens">
  <svg class="intro-beat b4" :class="{ 'is-paused': paused }" viewBox="0 0 1600 1600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient :id="id('eyeGlow')" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#c8fbf4" stop-opacity="1"/>
        <stop offset=".25" stop-color="#7fe3dc" stop-opacity=".75"/>
        <stop offset="1" stop-color="#3fb3b0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient :id="id('surfGlow')" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#c8fbf4" stop-opacity=".9"/>
        <stop offset=".4" stop-color="#7fe3dc" stop-opacity=".35"/>
        <stop offset="1" stop-color="#3fb3b0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient :id="id('moonHalo')" cx="0.5" cy="0.5" r="0.5">
        <stop offset=".45" stop-color="#d6dee3" stop-opacity=".22"/>
        <stop offset="1" stop-color="#d6dee3" stop-opacity="0"/>
      </radialGradient>
      <linearGradient :id="id('fogFade')" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/>
        <stop offset=".45" stop-color="#fff" stop-opacity="1"/>
        <stop offset=".6" stop-color="#fff" stop-opacity="1"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <mask :id="id('fogMask')" maskUnits="userSpaceOnUse" x="-1000" y="581" width="3300" height="300">
        <rect x="-1000" y="581" width="3300" height="300" :fill="url('fogFade')"/>
      </mask>
      <!-- the host's 256-unit fog texture at 2x: 512-unit tiles -->
      <pattern :id="id('fog')" href="#intro-fog" patternTransform="scale(2)" />
    </defs>

    <rect x="-300" y="-300" width="2200" height="2200" fill="#dfe5e8"/><!-- moonlight ground: covered by the layers, shows only when the reduced variant fades them -->
    <!-- exit: the whole scene (not the ravens) pushes into the moon around the ship -->
    <g class="b4-zoom b4-a">
      <!-- L1 sky + moon, rising low over the sea -->
      <g class="b4-l-sky b4-a">
        <rect class="b4-dawn b4-a" :style="C.sky0" x="-200" y="-200" width="2000" height="560"/>
        <path class="b4-dawn b4-a" :style="C.sky1" d="M-200,330 C200,300 500,350 800,320 C1100,290 1400,340 1800,310 L1800,560 L-200,560 Z"/>
        <path class="b4-dawn b4-a" :style="C.sky2" d="M-200,520 C150,490 520,540 860,505 C1180,475 1450,520 1800,500 L1800,700 L-200,700 Z"/>
        <path class="b4-dawn b4-a" :style="C.sky3" d="M-200,640 C300,615 700,650 1000,628 C1300,608 1550,640 1800,630 L1800,800 L-200,800 Z"/>
        <!-- the moon comes in from the right, rising out of the sea and growing (the far water covers it below the horizon) -->
        <g class="b4-moon b4-a"><g transform="translate(-1030 -470)">
          <circle cx="1030" cy="470" r="260" :fill="url('moonHalo')"/>
          <circle cx="1030" cy="470" r="118" fill="#dfe5e8"/>
          <path class="b4-craterout b4-a" fill="#c8d0d5" d="M990,410 a22,18 0 1,0 1,0 Z M1080,500 a30,24 0 1,0 1,0 Z M1040,535 a12,10 0 1,0 1,0 Z"/>
        </g></g>
      </g>

      <!-- L2 far: Bjarnøy and a farther skerry on the horizon, the sea out to it, fog band; it comes in from the right -->
      <g class="b4-l-far b4-a">
        <path class="b4-dawn b4-a" :style="C.skerry" transform="translate(-190 43)" d="M1080,742 C1130,722 1180,716 1230,726 C1260,712 1300,714 1330,730 L1360,742 Z"/>
        <g class="b4-dawn b4-a" :style="C.isle" transform="translate(0 41)">
          <path d="M330,744 L380,720 L410,722 L440,700 L470,702 L500,672 L530,668 L556,640 L574,642 L600,620 L620,626 L640,600 L660,606 L690,640 L716,646 L742,676 L770,690 L800,712 L840,728 L880,744 Z"/>
          <!-- pine teeth along the ridge -->
          <path d="M452,704 l8,-26 l8,26 Z M486,676 l7,-24 l7,24 Z M520,672 l9,-30 l9,30 Z M562,644 l7,-26 l7,26 Z M610,626 l8,-28 l8,28 Z M664,610 l7,-22 l7,22 Z M700,644 l8,-26 l8,26 Z M734,674 l7,-22 l7,22 Z"/>
        </g>
        <rect class="b4-dawn b4-a" :style="C.farWater" x="-1000" y="785" width="3300" height="120"/>
        <g :mask="url('fogMask')" class="b4-fogout b4-a">
          <rect class="b4-fog b4-a" x="-1000" y="581" width="3300" height="300" :fill="url('fog')"/>
        </g>
      </g>

      <!-- the longship: from where the sending left it, drifting to the middle as the camera overtakes it; no
           parallax of its own, so the push lands it exactly (see b4-ship and b4-zoom) -->
      <g class="b4-ship b4-a"><IntroLongship boy strakes underway /></g>

      <!-- L3 surface: the cut line between air and sea (it covers the ship's keel), rings; the water reaches down to
           where the seabed rises from -->
      <g class="b4-l-surf b4-a">
        <g transform="translate(0 96)">
          <path class="b4-dawn b4-a" :style="C.surf" d="M-200,744 C-100,736 0,750 100,742 C200,734 300,750 400,742 C500,734 600,750 700,742 C800,734 900,750 1000,742 C1100,734 1200,750 1300,742 C1400,734 1500,750 1600,742 C1700,734 1800,748 1900,742 L1900,1800 L-200,1800 Z"/>
          <path class="b4-dawn-line b4-a" :style="C.surfLine" fill="none" stroke-width="2" d="M-200,744 C-100,736 0,750 100,742 C200,734 300,750 400,742 C500,734 600,750 700,742 C800,734 900,750 1000,742 C1100,734 1200,750 1300,742 C1400,734 1500,750 1600,742 C1700,734 1800,748 1900,742"/>
        </g>
        <ellipse class="b4-sglow b4-a" cx="858" cy="844" rx="190" ry="38" :fill="url('surfGlow')"/>
        <g transform="translate(858 842)" fill="none" stroke="#bfe6e2" stroke-width="3">
          <ellipse class="b4-ring b4-a" style="--t:.64" rx="80" ry="10"/>
          <ellipse class="b4-ring b4-a" style="--t:.71" rx="80" ry="10"/>
          <ellipse class="b4-ring b4-a" style="--t:.77" rx="110" ry="13"/>
          <ellipse class="b4-ring b4-a" style="--t:.80" rx="80" ry="10"/>
        </g>
      </g>

      <!-- L4 deep: water bands, the sleeping giant (profile, face up), glow, bubbles -->
      <g class="b4-l-deep b4-a">
        <g transform="translate(0 40)">
          <path class="b4-dawn b4-a" :style="C.deep0" d="M-200,880 C200,862 500,900 800,878 C1100,858 1400,896 1900,872 L1900,1800 L-200,1800 Z"/>
          <path class="b4-dawn b4-a" :style="C.deep1" d="M-200,1010 C250,990 600,1030 900,1004 C1200,984 1500,1020 1900,1000 L1900,1800 L-200,1800 Z"/>
        </g>
        <!-- 80 units up, so the eye stays clear of the narration line in 16:9 -->
        <g transform="translate(0 -80)">
          <g class="b4-heave b4-a">
            <path fill="#0b201e" d="M-200,1330 C150,1210 300,1120 430,1112 C500,1106 545,1108 575,1100 C600,1094 616,1126 644,1138 C674,1146 700,1118 718,1080 C730,1060 742,1046 752,1044 C762,1046 768,1070 778,1092 C790,1110 812,1104 826,1100 C838,1110 846,1116 856,1110 C870,1104 880,1110 890,1118 C920,1140 960,1134 990,1130 C1030,1128 1060,1160 1110,1180 C1180,1200 1240,1170 1320,1160 C1420,1150 1560,1168 1900,1190 L1900,1800 L-200,1800 Z"/>
            <!-- barnacles / weed on the brow so it reads as seabed first -->
            <path fill="#143229" d="M400,1122 c10,-8 22,-8 30,-2 c-8,2 -20,4 -30,2 Z M470,1112 c8,-6 18,-6 24,0 Z M1180,1196 c12,-10 30,-10 40,-2 Z M1350,1166 c14,-8 30,-8 42,0 Z"/>
            <!-- closed eye: a lid line in the socket -->
            <circle class="b4-eye b4-a" cx="640" cy="1144" r="90" :fill="url('eyeGlow')"/>
            <path class="b4-eye b4-a" fill="none" stroke="#c8fbf4" stroke-width="4" stroke-linecap="round" d="M614,1140 Q640,1154 668,1144"/>
            <!-- brow runes, cold rune-fire -->
            <g class="b4-rune b4-a" fill="none" stroke="#8fe6df" stroke-width="3.5" stroke-linecap="round">
              <path d="M452,1134 l0,22 M452,1140 l10,-6 M452,1148 l10,-6"/>
              <path d="M486,1128 l0,22 M486,1128 l9,8 l-9,8"/>
              <path d="M520,1124 l0,22 M512,1132 l16,8"/>
              <path d="M552,1120 l0,22 M552,1128 l9,-6 M552,1128 l-9,-6"/>
            </g>
          </g>
        </g>

        <!-- breath: bubbles from the lips (858,1028) to the surface (~842) -->
        <g transform="translate(858 1028)" fill="#bfe6e2">
          <circle class="b4-bub b4-a" style="--t:.46;--dx:-14px" r="9"/>
          <circle class="b4-bub b4-a" style="--t:.49;--dx:10px"  r="6"/>
          <circle class="b4-bub b4-a" style="--t:.52;--dx:-4px"  r="12"/>
          <circle class="b4-bub b4-a" style="--t:.55;--dx:16px"  r="5"/>
          <circle class="b4-bub b4-a" style="--t:.58;--dx:-10px" r="8"/>
          <circle class="b4-bub b4-a" style="--t:.61;--dx:6px"   r="10"/>
          <circle class="b4-bub b4-a" style="--t:.64;--dx:-18px" r="5"/>
          <circle class="b4-bub b4-a" style="--t:.67;--dx:12px"  r="7"/>
          <!-- the big breath: one fast burst -->
          <circle class="b4-bub b4-a" style="--t:.660;--d:.17;--dx:-8px"  r="15"/>
          <circle class="b4-bub b4-a" style="--t:.668;--d:.17;--dx:16px"  r="10"/>
          <circle class="b4-bub b4-a" style="--t:.676;--d:.16;--dx:-2px"  r="19"/>
          <circle class="b4-bub b4-a" style="--t:.684;--d:.17;--dx:22px"  r="8"/>
          <circle class="b4-bub b4-a" style="--t:.692;--d:.16;--dx:-18px" r="12"/>
          <circle class="b4-bub b4-a" style="--t:.704;--d:.17;--dx:6px"   r="9"/>
        </g>
      </g>

      <!-- L5 front: near seabed and kelp, the darkest layer -->
      <g class="b4-l-front b4-a">
        <g class="b4-dawn b4-a" :style="C.front">
          <g transform="translate(260 1330)"><path class="b4-kelp" d="M-6,0 C-20,-60 14,-110 -4,-170 C-12,-200 4,-230 10,-250 C14,-220 4,-200 10,-170 C26,-110 -6,-60 8,0 Z"/></g>
          <g transform="translate(300 1340)"><path class="b4-kelp" d="M-5,0 C-16,-50 12,-90 -2,-140 C-8,-160 4,-180 8,-196 C12,-174 4,-158 9,-140 C22,-90 -4,-50 7,0 Z"/></g>
          <g transform="translate(1290 1300)"><path class="b4-kelp" d="M-6,0 C-20,-60 14,-110 -4,-170 C-12,-200 4,-230 10,-250 C14,-220 4,-200 10,-170 C26,-110 -6,-60 8,0 Z"/></g>
          <g transform="translate(1340 1310)"><path class="b4-kelp" d="M-5,0 C-16,-50 12,-90 -2,-140 C-8,-160 4,-180 8,-196 C12,-174 4,-158 9,-140 C22,-90 -4,-50 7,0 Z"/></g>
          <path d="M-300,1340 C-100,1300 100,1320 260,1306 C380,1296 460,1330 600,1336 C760,1342 900,1300 1060,1312 C1200,1322 1300,1290 1450,1296 C1600,1302 1750,1330 1900,1320 L1900,1800 L-300,1800 Z"/>
        </g>
      </g>
    </g>

    <!-- ravens fly above all layers (they are nearest at the end) -->
    <g class="b4-r1 b4-a">
      <g transform="translate(-6 -6) scale(.86)"><path class="b4-flap b4-far" fill="#151b24" d="M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z"/></g>
      <path fill="#07090d" d="M-66,-8 L-32,-5 C-12,-12 18,-12 33,-7 C40,-13 51,-13 57,-7 L74,-3 L57,1 C49,6 39,6 31,5 C10,11 -20,9 -34,4 L-66,10 L-56,1 Z"/>
      <g transform="translate(2 -6)"><path class="b4-flap" fill="#07090d" d="M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z"/></g>
    </g>
    <g class="b4-r2 b4-a">
      <g transform="translate(-6 -6) scale(.86)"><path class="b4-flap b4-far" fill="#151b24" d="M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z"/></g>
      <path fill="#07090d" d="M-66,-8 L-32,-5 C-12,-12 18,-12 33,-7 C40,-13 51,-13 57,-7 L74,-3 L57,1 C49,6 39,6 31,5 C10,11 -20,9 -34,4 L-66,10 L-56,1 Z"/>
      <g transform="translate(2 -6)"><path class="b4-flap" fill="#07090d" d="M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z"/></g>
    </g>

  </svg>
  </div>
</template>

<style scoped>
.ravens { position: absolute; inset: 0; }
/* timeline animations: one run over the beat */
.b4 .b4-a { animation-duration: var(--beat-duration); animation-timing-function: linear; animation-fill-mode: both; animation-iteration-count: 1; }


/* night lifts toward dawn: every layer from its --c0 to its --c1 */
.b4 .b4-dawn { animation-name: b4-dawn; }
@keyframes b4-dawn { 0%, 15% { fill: var(--c0); animation-timing-function: ease-in-out } 95%, 100% { fill: var(--c1) } }
.b4 .b4-dawn-line { animation-name: b4-dawn-line; }
@keyframes b4-dawn-line { 0%, 15% { stroke: var(--c0); animation-timing-function: ease-in-out } 95%, 100% { stroke: var(--c1) } }

/* camera: goes on turning right with the ship from the sending's pan (the far layer comes in from the right and
   keeps moving faster than the ship drifts), tilts down toward the water, and the seabed comes up from below */
.b4 .b4-l-sky, .b4 .b4-l-far, .b4 .b4-l-surf, .b4 .b4-l-deep, .b4 .b4-l-front { animation-timing-function: cubic-bezier(.4, 0, .6, 1); }
.b4 .b4-l-sky { animation-name: b4-cam-sky; }
.b4 .b4-l-far { animation-name: b4-cam-far; }
.b4 .b4-l-surf { animation-name: b4-cam-surf; }
.b4 .b4-l-deep { animation-name: b4-cam-deep; }
.b4 .b4-l-front { animation-name: b4-cam-front; }
@keyframes b4-cam-sky { to { transform: translate(-14px, 22px) } }
@keyframes b4-cam-far { 0% { transform: translate(620px, 0); animation-timing-function: cubic-bezier(.3, .5, .6, 1) } 100% { transform: translate(-330px, 8px) } }
@keyframes b4-cam-surf { to { transform: translate(-44px, -12px) } }
@keyframes b4-cam-deep { 0% { transform: translate(0, 520px); animation-timing-function: cubic-bezier(.25, .6, .4, 1) } 32% { transform: translate(-20px, -10px) } 100% { transform: translate(-64px, -42px) } }
@keyframes b4-cam-front { 0% { transform: translate(0, 640px); animation-timing-function: cubic-bezier(.25, .6, .4, 1) } 32% { transform: translate(-30px, -20px) } 100% { transform: translate(-100px, -70px) } }

/* the longship: it starts where the sending leaves it (scale .374; the sending ends at different points of the
   ship's run in English and German, this is between the two) and keeps that size, drifting to the middle as the
   camera overtakes it, so the push (.68 / .374) lands it on the hold's ship. Its colours go from the sending's
   dusk silhouette to the hold's. */
.b4 .b4-ship { animation-name: b4-ship; transform-box: view-box; transform-origin: 0 0; }
@keyframes b4-ship {
  0% { transform: translate(945px, 471px) scale(.374); animation-timing-function: cubic-bezier(.3, .2, .5, 1) }
  88%, 100% { transform: translate(692.198px, 458.992px) scale(.374) }
}
.b4 .b4-ship :deep(.s-steer), .b4 .b4-ship :deep(.s-rig), .b4 .b4-ship :deep(.s-strake) { animation: b4-ship-stroke var(--beat-duration) linear both; }
.b4 .b4-ship :deep([class^='s-']:not(.s-steer):not(.s-rig):not(.s-strake)) { animation: b4-ship-fill var(--beat-duration) linear both; }
@keyframes b4-ship-fill { 0%, 55% { fill: var(--c0) } 97%, 100% { fill: var(--c1) } }
@keyframes b4-ship-stroke { 0%, 55% { stroke: var(--c0) } 97%, 100% { stroke: var(--c1) } }
.b4 .b4-ship :deep(.s-steer), .b4 .b4-ship :deep(.s-steer-blade) { --c0: #0e1318; --c1: #1b252c; }
.b4 .b4-ship :deep(.s-rig) { --c0: #0e1318; --c1: #2f3d47; }
.b4 .b4-ship :deep(.s-mast) { --c0: #0e1318; --c1: #1e2a32; }
.b4 .b4-ship :deep(.s-sail) { --c0: #6b4a41; --c1: #3b4a55; }
.b4 .b4-ship :deep(.s-stripe) { --c0: #4a3530; --c1: #52636f; }
.b4 .b4-ship :deep(.s-crew) { --c0: #0b1015; --c1: #222f38; }
.b4 .b4-ship :deep(.s-cloak) { --c0: #0b1015; --c1: #2a3842; }
.b4 .b4-ship :deep(.s-rower) { --c0: #0b1015; --c1: #1e2a33; }
.b4 .b4-ship :deep(.s-hull) { --c0: #0e1318; --c1: #222f38; }
.b4 .b4-ship :deep(.s-strake) { --c0: #0e1318; --c1: #34444f; }
.b4 .b4-ship :deep(.s-eye) { --c0: #0e1318; --c1: #6b7c88; }
.b4 .b4-ship :deep(.s-shield-a) { --c0: #27313b; --c1: #3b4b56; }
.b4 .b4-ship :deep(.s-shield-b) { --c0: #1e262e; --c1: #2c3b45; }
.b4 .b4-ship :deep(.s-boss) { --c0: #0e1318; --c1: #1c262d; }
.b4 .b4-ship :deep(.s-oar) { --c0: #0e1318; --c1: #182229; }

/* exit: the scene (not the ravens) pushes into the moon around the ship's waterline (1000, 780.632), and lands
   the ship on the fog hold's: its point (823, 860) goes to where the hold draws it at the hold's first frame
   (705.64, 894.08, after the hold's -110 offset, .68 scale about 800/975, and its heave). */
.b4 .b4-zoom { animation-name: b4-zoom; transform-origin: 1000px 780.632px; }
@keyframes b4-zoom {
  0%, 88% { transform: translate(0, 0) scale(1); animation-timing-function: cubic-bezier(.5, 0, .8, .5) }
  99%, 100% { transform: translate(-294.36px, 113.448px) scale(1.818182) }
}
/* the moon comes in from the right, low, rises out of the sea and grows until it fills the sky behind the ship
   (with the sky's drift its centre ends at the ship's waterline point, 1000/780) */
.b4 .b4-moon { animation-name: b4-moon; transform-box: view-box; transform-origin: 0 0; }
@keyframes b4-moon {
  0% { transform: translate(1760px, 860px) scale(.9); animation-timing-function: cubic-bezier(.3, .5, .5, 1) }
  40% { transform: translate(1014px, 800px) scale(1.8) }
  88% { transform: translate(1014px, 762px) scale(3.6) }
  99%, 100% { transform: translate(1014px, 758px) scale(5) }
}
/* the craters fade while the moon fills the frame, so the beat ends on even, fog-pale moonlight */
.b4 .b4-craterout { animation-name: b4-crater-out; }
@keyframes b4-crater-out { 0%, 95% { opacity: 1 } 99%, 100% { opacity: 0 } }

/* fog along the horizon: drifts one 512-unit tile, fades out before the zoom would blow it up */
.b4 .b4-fog { animation-name: b4-fog; }
@keyframes b4-fog { 0% { transform: translateX(0); opacity: .3 } 50% { opacity: .4 } 100% { transform: translateX(-512px); opacity: .28 } }
.b4 .b4-fogout { animation-name: b4-fog-out; }
@keyframes b4-fog-out { 0%, 87% { opacity: 1 } 93%, 100% { opacity: 0 } }


/* ravens: they rise off the island and grow as they fly toward the camera (scale = distance) */
.b4 .b4-r1 { animation-name: b4-raven1; animation-duration: 6000ms; animation-timing-function: cubic-bezier(.35, .05, .6, 1); }
@keyframes b4-raven1 {
  0%   { transform: translate(1180px, 731px) scale(.10) rotate(-6deg); opacity: 0 }
  6%   { opacity: 1 }
  40%  { transform: translate(1080px, 540px) scale(.42) rotate(-8deg) }
  66%  { transform: translate(1120px, 400px) scale(.85) rotate(-14deg) }
  86%  { transform: translate(1760px, 160px) scale(1.7) rotate(-18deg); opacity: 1 }
  100% { transform: translate(1900px, 120px) scale(1.8) rotate(-18deg); opacity: 1 }
}
/* raven 2 skims the water past the rings, keeps flying, crosses the moon behind the ship and leaves the frame on the right */
.b4 .b4-r2 { animation-name: b4-raven2; --flaps: 16; --flap-off: -150ms; }
@keyframes b4-raven2 {
  0%, 9% { transform: translate(1080px, 741px) scale(.10) rotate(-2deg); opacity: 0 }
  15%  { opacity: 1 }
  44%  { transform: translate(840px, 730px) scale(.34) rotate(6deg) }
  64%  { transform: translate(860px, 790px) scale(.6) rotate(2deg) }
  72%  { transform: translate(960px, 770px) scale(.72) rotate(-8deg) }
  82%  { transform: translate(1060px, 750px) scale(.85) rotate(-5deg) }
  91%  { transform: translate(1180px, 715px) scale(1) rotate(-6deg) }
  97%  { transform: translate(1420px, 650px) scale(1.1) rotate(-8deg); opacity: 1 }
  100% { transform: translate(1730px, 590px) scale(1.15) rotate(-9deg); opacity: 1 }
}
/* wing beats; each wing pivots at the shoulder (its group's origin) */
.b4 .b4-flap { animation: b4-flap calc(6000ms / var(--flaps, 18)) ease-in-out infinite alternate; animation-delay: var(--flap-off, 0s); transform-origin: 0 0; }
.b4 .b4-flap.b4-far { animation-delay: calc(var(--flap-off, 0s) - 67ms); }
@keyframes b4-flap { from { transform: scaleY(1) } to { transform: scaleY(-.5) } }

/* the giant: the eye opens and closes once on "not empty", then eye glow and runes breathe and the body heaves once */
.b4 .b4-eye { animation-name: b4-eye; }
.b4 .b4-rune { animation-name: b4-rune; }
.b4 .b4-heave { animation-name: b4-heave; animation-timing-function: ease-in-out; }
@keyframes b4-eye { 0%, 34% { opacity: 0 } 37% { opacity: .7 } 40% { opacity: .12 } 42%, 52% { opacity: 0 } 61% { opacity: .85 } 69% { opacity: .4 } 77% { opacity: 1 } 86% { opacity: .35 } 93% { opacity: .7 } 100% { opacity: .5 } }
@keyframes b4-rune { 0%, 56% { opacity: 0 } 65% { opacity: .7 } 73% { opacity: .2 } 81% { opacity: .9 } 90% { opacity: .25 } 100% { opacity: .55 } }
@keyframes b4-heave { 0%, 58% { transform: translateY(0) } 76% { transform: translateY(-14px) } 93% { transform: translateY(1px) } 100% { transform: translateY(0) } }

/* breath: a trickle of bubbles from the lips, then one fast burst; --t start, --d length, --dx drift */
.b4 .b4-bub {
  animation-name: b4-bub;
  animation-duration: calc(6000ms * var(--d, .27));
  animation-delay: calc(var(--beat-duration) * var(--t));
  animation-timing-function: cubic-bezier(.3, .1, .7, 1);
}
@keyframes b4-bub {
  0%   { transform: translate(0, 0) scale(.5); opacity: 0 }
  10%  { opacity: .9 }
  50%  { transform: translate(calc(var(--dx) * -.6), -92px) scale(.85) }
  92%  { opacity: .85 }
  100% { transform: translate(var(--dx), -186px) scale(1.15); opacity: 0 }
}
/* rings on the surface, and a glow where the burst breaks */
.b4 .b4-ring {
  animation-name: b4-ring;
  animation-duration: 1800ms;
  animation-delay: calc(var(--beat-duration) * var(--t));
  animation-timing-function: cubic-bezier(.2, .6, .4, 1);
}
@keyframes b4-ring { 0% { transform: scale(.1); opacity: 0 } 12% { opacity: .9 } 100% { transform: scale(1.7); opacity: 0 } }
.b4 .b4-sglow { animation-name: b4-surface-glow; transform-box: fill-box; transform-origin: center; }
@keyframes b4-surface-glow { 0%, 75% { opacity: 0; transform: scale(.6) } 79% { opacity: .9; transform: scale(1) } 100% { opacity: 0; transform: scale(1.35) } }

/* kelp sways */
.b4 .b4-kelp { animation: b4-kelp 3600ms ease-in-out infinite alternate; transform-origin: 0 0; }
.b4 .b4-kelp:nth-of-type(2n) { animation-delay: -1500ms; }
@keyframes b4-kelp { from { transform: rotate(-4deg) } to { transform: rotate(5deg) } }
</style>
