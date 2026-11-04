<script setup lang="ts">
import { useId } from 'vue';

/**
 * Beat 4, the ravens: two ravens rise off Bjarnøy and fly home under the moon. Under the surface the
 * seabed turns out to be a sleeping giant: a closed eye glows, runes light up on the brow, and its breath
 * rises as bubbles that break the surface. Then the scene pushes into the moon while the second raven
 * crosses it and flies out of the frame; the beat ends on even pale moonlight.
 * Everything is timed on `--beat-duration` (set by the host from the beat meta); wing beats, kelp and
 * glints loop at fractions of it.
 */
defineProps<{ paused?: boolean }>();

const uid = useId().replace(/[^a-zA-Z0-9]/g, '-');
const id = (name: string) => `${uid}-${name}`;
const url = (name: string) => `url(#${id(name)})`;
</script>

<template>
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
        <stop offset=".45" stop-color="#cfd6cc" stop-opacity=".22"/>
        <stop offset="1" stop-color="#cfd6cc" stop-opacity="0"/>
      </radialGradient>
      <linearGradient :id="id('fogFade')" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/>
        <stop offset=".45" stop-color="#fff" stop-opacity="1"/>
        <stop offset=".6" stop-color="#fff" stop-opacity="1"/>
        <stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <mask :id="id('fogMask')" maskUnits="userSpaceOnUse" x="-300" y="540" width="2400" height="300">
        <rect x="-300" y="540" width="2400" height="300" :fill="url('fogFade')"/>
      </mask>
      <!-- the host's 256-unit fog texture at 2x: 512-unit tiles -->
      <pattern :id="id('fog')" href="#intro-fog" patternTransform="scale(2)" />
      <!-- raven glyph, facing right, ~140 units wide at scale 1; wings pivot at the shoulder -->
      <!-- ravens are drawn inline below -->
    </defs>

    <g class="b4-fadein b4-a">
      <rect x="-300" y="-300" width="2200" height="2200" fill="#d8dccd"/><!-- moonlight ground: covered by the layers, shows only when the reduced variant fades them -->
      <!-- exit: the whole scene (not the ravens) pushes into the moon -->
      <g class="b4-zoom b4-a">
      <!-- L1 sky + moon -->
      <g class="b4-l-sky b4-a">
        <rect x="-200" y="-200" width="2000" height="560" fill="#121a28"/>
        <path fill="#1a2536" d="M-200,330 C200,300 500,350 800,320 C1100,290 1400,340 1800,310 L1800,560 L-200,560 Z"/>
        <path fill="#23324a" d="M-200,520 C150,490 520,540 860,505 C1180,475 1450,520 1800,500 L1800,700 L-200,700 Z"/>
        <path fill="#2f4560" d="M-200,640 C300,615 700,650 1000,628 C1300,608 1550,640 1800,630 L1800,800 L-200,800 Z"/>
        <circle cx="1030" cy="470" r="260" :fill="url('moonHalo')"/>
        <circle cx="1030" cy="470" r="118" fill="#d8dccd"/>
        <path class="b4-craterout b4-a" fill="#c4c9b8" d="M990,410 a22,18 0 1,0 1,0 Z M1080,500 a30,24 0 1,0 1,0 Z M1040,535 a12,10 0 1,0 1,0 Z"/>
      </g>

      <!-- L2 far: Bjarnøy on the horizon, a farther skerry, fog band -->
      <g class="b4-l-far b4-a">
        <path fill="#3a5470" d="M1080,742 C1130,722 1180,716 1230,726 C1260,712 1300,714 1330,730 L1360,742 Z"/>
        <path fill="#1c2a3c" d="M330,744 L380,720 L410,722 L440,700 L470,702 L500,672 L530,668 L556,640 L574,642 L600,620 L620,626 L640,600 L660,606 L690,640 L716,646 L742,676 L770,690 L800,712 L840,728 L880,744 Z"/>
        <!-- pine teeth along the ridge -->
        <path fill="#1c2a3c" d="M452,704 l8,-26 l8,26 Z M486,676 l7,-24 l7,24 Z M520,672 l9,-30 l9,30 Z M562,644 l7,-26 l7,26 Z M610,626 l8,-28 l8,28 Z M664,610 l7,-22 l7,22 Z M700,644 l8,-26 l8,26 Z M734,674 l7,-22 l7,22 Z"/>
        <g :mask="url('fogMask')" class="b4-fogout b4-a">
          <rect class="b4-fog b4-a" x="-300" y="540" width="2600" height="300" :fill="url('fog')"/>
        </g>
      </g>

      <!-- L3 surface: the cut line between air and sea, glints, rings -->
      <g class="b4-l-surf b4-a">
        <path fill="#1f4c57" d="M-200,744 C-100,736 0,750 100,742 C200,734 300,750 400,742 C500,734 600,750 700,742 C800,734 900,750 1000,742 C1100,734 1200,750 1300,742 C1400,734 1500,750 1600,742 C1700,734 1800,748 1900,742 L1900,1000 L-200,1000 Z"/>
        <path fill="#7fa6aa" d="M-200,744 C-100,736 0,750 100,742 C200,734 300,750 400,742 C500,734 600,750 700,742 C800,734 900,750 1000,742 C1100,734 1200,750 1300,742 C1400,734 1500,750 1600,742 C1700,734 1800,748 1900,742 L1900,750 C1800,756 1700,742 1600,750 C1500,758 1400,742 1300,750 C1200,758 1100,742 1000,750 C900,758 800,742 700,750 C600,758 500,742 400,750 C300,758 200,742 100,750 C0,758 -100,744 -200,752 Z"/>
        <g fill="#e3e6d6">
          <rect class="b4-glint" x="980" y="760" width="110" height="5" rx="2.5"/>
          <rect class="b4-glint" x="1004" y="776" width="64" height="4" rx="2"/>
          <rect class="b4-glint" x="1018" y="790" width="34" height="3" rx="1.5"/>
        </g>
        <ellipse class="b4-sglow b4-a" cx="858" cy="748" rx="190" ry="38" :fill="url('surfGlow')"/>
        <g transform="translate(858 746)" fill="none" stroke="#bfe6e2" stroke-width="3">
          <ellipse class="b4-ring b4-a" style="--t:.55" rx="80" ry="10"/>
          <ellipse class="b4-ring b4-a" style="--t:.63" rx="80" ry="10"/>
          <ellipse class="b4-ring b4-a" style="--t:.67" rx="110" ry="13"/>
          <ellipse class="b4-ring b4-a" style="--t:.72" rx="80" ry="10"/>
        </g>
      </g>

      <!-- L4 deep: water bands, the sleeping giant (profile, face up), glow, bubbles -->
      <g class="b4-l-deep b4-a">
        <path fill="#183d48" d="M-200,880 C200,862 500,900 800,878 C1100,858 1400,896 1900,872 L1900,1800 L-200,1800 Z"/>
        <path fill="#112f39" d="M-200,1010 C250,990 600,1030 900,1004 C1200,984 1500,1020 1900,1000 L1900,1800 L-200,1800 Z"/>
        <!-- 80 units up, so the eye stays clear of the narration line in 16:9 -->
        <g transform="translate(0 -80)">
          <g class="b4-heave b4-a">
            <path fill="#0a1d24" d="M-200,1330 C150,1210 300,1120 430,1112 C500,1106 545,1108 575,1100 C600,1094 616,1126 644,1138 C674,1146 700,1118 718,1080 C730,1060 742,1046 752,1044 C762,1046 768,1070 778,1092 C790,1110 812,1104 826,1100 C838,1110 846,1116 856,1110 C870,1104 880,1110 890,1118 C920,1140 960,1134 990,1130 C1030,1128 1060,1160 1110,1180 C1180,1200 1240,1170 1320,1160 C1420,1150 1560,1168 1900,1190 L1900,1800 L-200,1800 Z"/>
            <!-- barnacles / weed on the brow so it reads as seabed first -->
            <path fill="#12303a" d="M400,1122 c10,-8 22,-8 30,-2 c-8,2 -20,4 -30,2 Z M470,1112 c8,-6 18,-6 24,0 Z M1180,1196 c12,-10 30,-10 40,-2 Z M1350,1166 c14,-8 30,-8 42,0 Z"/>
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

        <!-- breath: bubbles from the lips (858,1028) to the surface (~746) -->
        <g transform="translate(858 1028)" fill="#bfe6e2">
          <circle class="b4-bub b4-a" style="--t:.30;--dx:-14px" r="9"/>
          <circle class="b4-bub b4-a" style="--t:.34;--dx:10px"  r="6"/>
          <circle class="b4-bub b4-a" style="--t:.37;--dx:-4px"  r="12"/>
          <circle class="b4-bub b4-a" style="--t:.41;--dx:16px"  r="5"/>
          <circle class="b4-bub b4-a" style="--t:.44;--dx:-10px" r="8"/>
          <circle class="b4-bub b4-a" style="--t:.48;--dx:6px"   r="10"/>
          <circle class="b4-bub b4-a" style="--t:.52;--dx:-18px" r="5"/>
          <circle class="b4-bub b4-a" style="--t:.56;--dx:12px"  r="7"/>
          <!-- the big breath: one fast burst -->
          <circle class="b4-bub b4-a" style="--t:.500;--d:.17;--dx:-8px"  r="15"/>
          <circle class="b4-bub b4-a" style="--t:.510;--d:.17;--dx:16px"  r="10"/>
          <circle class="b4-bub b4-a" style="--t:.520;--d:.16;--dx:-2px"  r="19"/>
          <circle class="b4-bub b4-a" style="--t:.530;--d:.17;--dx:22px"  r="8"/>
          <circle class="b4-bub b4-a" style="--t:.540;--d:.16;--dx:-18px" r="12"/>
          <circle class="b4-bub b4-a" style="--t:.555;--d:.17;--dx:6px"   r="9"/>
        </g>
      </g>

      <!-- L5 front: near seabed and kelp, the darkest layer -->
      <g class="b4-l-front b4-a">
        <g fill="#06141a">
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
    </g>
  </svg>
</template>

<style scoped>
/* timeline animations: one run over the beat */
.b4 .b4-a { animation-duration: var(--beat-duration); animation-timing-function: linear; animation-fill-mode: both; animation-iteration-count: 1; }

.b4 .b4-fadein { animation-name: b4-fade-in; }
@keyframes b4-fade-in { 0% { opacity: 0 } 8%, 100% { opacity: 1 } }

/* parallax camera: drifts right and tilts down toward the water */
.b4 .b4-l-sky, .b4 .b4-l-far, .b4 .b4-l-surf, .b4 .b4-l-deep, .b4 .b4-l-front { animation-timing-function: cubic-bezier(.4, 0, .6, 1); }
.b4 .b4-l-sky { animation-name: b4-cam-sky; }
.b4 .b4-l-far { animation-name: b4-cam-far; }
.b4 .b4-l-surf { animation-name: b4-cam-surf; }
.b4 .b4-l-deep { animation-name: b4-cam-deep; }
.b4 .b4-l-front { animation-name: b4-cam-front; }
@keyframes b4-cam-sky { to { transform: translate(-14px, 22px) } }
@keyframes b4-cam-far { to { transform: translate(-30px, 8px) } }
@keyframes b4-cam-surf { to { transform: translate(-44px, -12px) } }
@keyframes b4-cam-deep { to { transform: translate(-64px, -42px) } }
@keyframes b4-cam-front { to { transform: translate(-100px, -70px) } }

/* exit: the scene (not the ravens) pushes into the moon. It scales around the moon's spot during the exit
   (1017, 490: its place plus the sky's parallax offset) while that spot moves to the frame centre. */
.b4 .b4-zoom { animation-name: b4-zoom; transform-origin: 1017px 490px; }
@keyframes b4-zoom {
  0%, 80% { transform: translate(0, 0) scale(1); animation-timing-function: cubic-bezier(.5, 0, .8, .5) }
  96%, 100% { transform: translate(-217px, 310px) scale(9) }
}
/* the craters fade while the moon fills the frame, so the beat ends on even pale moonlight */
.b4 .b4-craterout { animation-name: b4-crater-out; }
@keyframes b4-crater-out { 0%, 90% { opacity: 1 } 96%, 100% { opacity: 0 } }

/* fog along the waterline: drifts one 512-unit tile, fades out before the zoom would blow it up */
.b4 .b4-fog { animation-name: b4-fog; }
@keyframes b4-fog { 0% { transform: translateX(0); opacity: .3 } 50% { opacity: .4 } 100% { transform: translateX(-512px); opacity: .28 } }
.b4 .b4-fogout { animation-name: b4-fog-out; }
@keyframes b4-fog-out { 0%, 80% { opacity: 1 } 88%, 100% { opacity: 0 } }

/* moon glints on the surface */
.b4 .b4-glint { animation: b4-glint calc(var(--beat-duration) / 3) linear infinite alternate; }
.b4 .b4-glint:nth-child(2) { animation-delay: calc(var(--beat-duration) / -5); }
.b4 .b4-glint:nth-child(3) { animation-delay: calc(var(--beat-duration) / -9); }
@keyframes b4-glint { from { opacity: .25 } to { opacity: .85 } }

/* ravens: they rise off the island and grow as they fly toward the camera (scale = distance) */
.b4 .b4-r1 { animation-name: b4-raven1; animation-timing-function: cubic-bezier(.35, .05, .6, 1); }
@keyframes b4-raven1 {
  0%   { transform: translate(600px, 690px) scale(.10) rotate(-6deg); opacity: 0 }
  6%   { opacity: 1 }
  40%  { transform: translate(830px, 520px) scale(.42) rotate(-8deg) }
  66%  { transform: translate(1120px, 400px) scale(.85) rotate(-14deg) }
  86%  { transform: translate(1760px, 160px) scale(1.7) rotate(-18deg); opacity: 1 }
  100% { transform: translate(1900px, 120px) scale(1.8) rotate(-18deg); opacity: 1 }
}
/* raven 2 skims the rings, keeps flying, crosses the full moon and leaves the frame on the right */
.b4 .b4-r2 { animation-name: b4-raven2; --flaps: 16; --flap-off: calc(var(--beat-duration) / -40); }
@keyframes b4-raven2 {
  0%, 9% { transform: translate(560px, 700px) scale(.10) rotate(-2deg); opacity: 0 }
  15%  { opacity: 1 }
  38%  { transform: translate(720px, 640px) scale(.34) rotate(6deg) }
  56%  { transform: translate(860px, 688px) scale(.6) rotate(2deg) }
  66%  { transform: translate(960px, 660px) scale(.72) rotate(-8deg) }
  78%  { transform: translate(1060px, 655px) scale(.85) rotate(-5deg) }
  90%  { transform: translate(1180px, 635px) scale(1) rotate(-6deg) }
  96%  { transform: translate(1420px, 600px) scale(1.1) rotate(-8deg); opacity: 1 }
  100% { transform: translate(1730px, 560px) scale(1.15) rotate(-9deg); opacity: 1 }
}
/* wing beats; each wing pivots at the shoulder (its group's origin) */
.b4 .b4-flap { animation: b4-flap calc(var(--beat-duration) / var(--flaps, 18)) ease-in-out infinite alternate; animation-delay: var(--flap-off, 0s); transform-origin: 0 0; }
.b4 .b4-flap.b4-far { animation-delay: calc(var(--flap-off, 0s) - var(--beat-duration) / 90); }
@keyframes b4-flap { from { transform: scaleY(1) } to { transform: scaleY(-.5) } }

/* the giant: eye glow and runes breathe, the body heaves once */
.b4 .b4-eye { animation-name: b4-eye; }
.b4 .b4-rune { animation-name: b4-rune; }
.b4 .b4-heave { animation-name: b4-heave; animation-timing-function: ease-in-out; }
@keyframes b4-eye { 0%, 20% { opacity: 0 } 32% { opacity: .85 } 46% { opacity: .4 } 58% { opacity: 1 } 74% { opacity: .35 } 88% { opacity: .7 } 100% { opacity: .5 } }
@keyframes b4-rune { 0%, 26% { opacity: 0 } 38% { opacity: .7 } 52% { opacity: .2 } 64% { opacity: .9 } 80% { opacity: .25 } 100% { opacity: .55 } }
@keyframes b4-heave { 0%, 30% { transform: translateY(0) } 58% { transform: translateY(-14px) } 86% { transform: translateY(1px) } 100% { transform: translateY(0) } }

/* breath: a trickle of bubbles from the lips, then one fast burst; --t start, --d length, --dx drift */
.b4 .b4-bub {
  animation-name: b4-bub;
  animation-duration: calc(var(--beat-duration) * var(--d, .27));
  animation-delay: calc(var(--beat-duration) * var(--t));
  animation-timing-function: cubic-bezier(.3, .1, .7, 1);
}
@keyframes b4-bub {
  0%   { transform: translate(0, 0) scale(.5); opacity: 0 }
  10%  { opacity: .9 }
  50%  { transform: translate(calc(var(--dx) * -.6), -140px) scale(.85) }
  92%  { opacity: .85 }
  100% { transform: translate(var(--dx), -282px) scale(1.15); opacity: 0 }
}
/* rings on the surface, and a glow where the burst breaks */
.b4 .b4-ring {
  animation-name: b4-ring;
  animation-duration: calc(var(--beat-duration) * .3);
  animation-delay: calc(var(--beat-duration) * var(--t));
  animation-timing-function: cubic-bezier(.2, .6, .4, 1);
}
@keyframes b4-ring { 0% { transform: scale(.1); opacity: 0 } 12% { opacity: .9 } 100% { transform: scale(1.7); opacity: 0 } }
.b4 .b4-sglow { animation-name: b4-surface-glow; transform-box: fill-box; transform-origin: center; }
@keyframes b4-surface-glow { 0%, 66% { opacity: 0; transform: scale(.6) } 71% { opacity: .9; transform: scale(1) } 100% { opacity: 0; transform: scale(1.35) } }

/* kelp sways */
.b4 .b4-kelp { animation: b4-kelp calc(var(--beat-duration) * .6) ease-in-out infinite alternate; transform-origin: 0 0; }
.b4 .b4-kelp:nth-of-type(2n) { animation-delay: calc(var(--beat-duration) * -.25); }
@keyframes b4-kelp { from { transform: rotate(-4deg) } to { transform: rotate(5deg) } }
</style>
