<script setup lang="ts">
import { useId } from 'vue';

/**
 * The longship, drawn once for every intro scene that shows it (the sending, the ravens, the fog hold), in its
 * own 1600-unit local space: hull from x 396 to 1250, waterline about y 975. Each scene places it with a
 * transform and animates its parts through these classes (with `:deep()`):
 *   .ship-sail   the sail with its stripes, pivoting at the yard's centre (780, 503)
 *   .ship-oar    each oar, pivoting at its thole (x, 910)
 *   .ship-rower  each rower (body and head)
 *   .ship-cloak  the boy's cloak, pivoting at his shoulder (1124, 842)
 *   .ship-boy    the boy at the prow (with `boy`)
 * Colours come from custom properties (defaults: the fog hold's); a scene can also animate `fill`/`stroke`
 * on the colour classes (.s-hull, .s-sail, ...) directly.
 * `underway` rows (5 strokes per `--ship-loop`, default 12 s), billows the sail and blows the boy's cloak.
 * `bold` draws the thin parts (mast, yard, oars, rigging) heavier, for a ship that is only seen small.
 */
withDefaults(defineProps<{ bold?: boolean; boy?: boolean; strakes?: boolean; underway?: boolean }>(), { bold: false, boy: false, strakes: false, underway: false });

const clipId = `${useId().replace(/[^a-zA-Z0-9]/g, '-')}-sailclip`;
const SAIL = 'M604 503 L956 503 C968 590 968 700 948 792 L612 792 C594 700 594 590 604 503Z';
const SHIELDS = Array.from({ length: 11 }, (_, i) => ({ x: 560 + i * 48, a: i % 2 === 1 }));
const OARS = [584, 680, 776, 872, 968, 1064].map((x) => ({
  x,
  body: `M${x - 17} 892 L${x - 14} 856 C${x - 10} 847 ${x + 10} 847 ${x + 14} 856 L${x + 17} 892Z`,
}));
</script>

<template>
  <g class="intro-longship" :class="{ 'is-underway': underway }">
    <defs><clipPath :id="clipId"><path :d="SAIL"/></clipPath></defs>
    <!-- steering oar (far side) -->
    <path class="s-steer" d="M486 838 L452 1004" :stroke-width="bold ? 8 : 7" stroke-linecap="round" fill="none"/>
    <ellipse class="s-steer-blade" cx="455" cy="990" :rx="bold ? 10 : 9" ry="24" transform="rotate(12 455 990)"/>
    <!-- mast, rigging, sail -->
    <path class="s-rig" d="M780 474 L1176 790 M780 474 L436 800" :stroke-width="bold ? 4 : 2.2" fill="none"/>
    <rect class="s-mast" :x="bold ? 775 : 776" y="470" :width="bold ? 10 : 8" height="420"/>
    <g transform="translate(780 503)"><g class="ship-sail"><g transform="translate(-780 -503)">
      <path class="s-sail" :d="SAIL"/>
      <g class="s-stripe" :clip-path="`url(#${clipId})`"><rect x="652" y="500" width="54" height="300"/><rect x="753" y="500" width="54" height="300"/><rect x="854" y="500" width="54" height="300"/></g>
    </g></g></g>
    <rect class="s-mast" x="588" :y="bold ? 494 : 495" width="384" :height="bold ? 10 : 8" rx="3"/>
    <!-- steersman -->
    <path class="s-crew" d="M452 882 L456 814 C460 805 482 805 488 814 L492 882Z"/>
    <circle class="s-crew" cx="471" cy="794" r="13"/>
    <!-- the boy at the prow -->
    <g v-if="boy" class="ship-boy">
      <g transform="translate(1124 842)"><g class="ship-cloak"><path class="s-cloak" d="M0 0 C-10 4 -20 12 -28 22 L-15 20 L-20 30 L-3 22Z"/></g></g>
      <path class="s-crew" d="M1119 876 L1121 844 C1123 838 1135 838 1137 844 L1140 876Z"/>
      <circle class="s-crew" cx="1130" cy="830" r="8.5"/>
      <path class="s-crew" d="M1122 826 C1124 818 1135 817 1139 825 L1135 823 L1132 827 L1128 822Z"/>
    </g>
    <!-- rowers (behind the shields) -->
    <g v-for="o in OARS" :key="o.x" class="ship-rower">
      <path class="s-rower" :d="o.body"/>
      <circle class="s-rower" :cx="o.x" cy="836" r="12"/>
    </g>
    <!-- hull -->
    <path class="s-hull" d="M426 800 C440 852 470 880 520 888 L1080 888 C1130 880 1160 852 1170 800 L1198 800 C1198 882 1162 966 1060 992 L540 992 C438 966 396 882 396 800Z"/>
    <path v-if="strakes" class="s-strake" d="M440 860 C470 885 500 896 540 901 L1060 901 C1100 896 1140 882 1168 852 M452 884 C484 904 512 916 552 922 L1050 922 C1092 916 1128 902 1156 882" stroke-width="3" fill="none"/>
    <path class="s-hull" d="M396 806 C390 752 394 706 420 686 C442 670 470 678 470 700 C470 718 452 726 442 716 C452 712 456 702 448 694 C436 686 422 696 420 716 C418 744 422 776 426 806Z"/>
    <path class="s-hull" d="M1170 806 C1176 760 1182 720 1196 696 C1208 680 1232 676 1246 686 L1236 692 L1250 700 L1232 704 C1218 706 1208 716 1204 734 C1200 756 1198 780 1198 806Z"/>
    <circle v-if="strakes" class="s-eye" cx="1224" cy="689" r="2.2"/>
    <g v-for="s in SHIELDS" :key="s.x">
      <circle :class="s.a ? 's-shield-a' : 's-shield-b'" :cx="s.x" cy="890" r="21"/>
      <circle class="s-boss" :cx="s.x" cy="890" r="5"/>
    </g>
    <g v-for="o in OARS" :key="`o${o.x}`" :transform="`translate(${o.x} 910)`">
      <g class="ship-oar">
        <rect class="s-oar" :x="bold ? -3 : -2.5" y="0" :width="bold ? 6 : 5" height="170" rx="2"/>
        <ellipse class="s-oar" cx="0" cy="156" :rx="bold ? 8 : 7" ry="20"/>
      </g>
    </g>
  </g>
</template>

<style scoped>
.intro-longship * { transform-box: view-box; }
.ship-sail, .ship-oar, .ship-cloak { transform-origin: 0 0; }
.s-steer { stroke: var(--ship-steer, #1b252c); }
.s-steer-blade { fill: var(--ship-steer, #1b252c); }
.s-rig { stroke: var(--ship-rig, #2f3d47); }
.s-mast { fill: var(--ship-mast, #1e2a32); }
.s-sail { fill: var(--ship-sail, #3b4a55); }
.s-stripe { fill: var(--ship-stripe, #52636f); }
.s-crew { fill: var(--ship-crew, #222f38); }
.s-cloak { fill: var(--ship-cloak, #2a3842); }
.s-rower { fill: var(--ship-rower, #1e2a33); }
.s-hull { fill: var(--ship-hull, #222f38); }
.s-strake { stroke: var(--ship-strake, #34444f); }
.s-eye { fill: var(--ship-eye, #6b7c88); }
.s-shield-a { fill: var(--ship-shield-a, #3b4b56); }
.s-shield-b { fill: var(--ship-shield-b, #2c3b45); }
.s-boss { fill: var(--ship-boss, #1c262d); }
.s-oar { fill: var(--ship-oar, #182229); }
/* underway: 5 strokes per --ship-loop */
.is-underway .ship-oar { animation: ship-oar calc(var(--ship-loop, 12s) / 5) linear infinite; }
.is-underway .ship-rower { animation: ship-rower calc(var(--ship-loop, 12s) / 5) ease-in-out infinite; }
.is-underway .ship-sail { animation: ship-sail var(--ship-loop, 12s) ease-in-out infinite; }
.is-underway .ship-cloak { animation: ship-cloak calc(var(--ship-loop, 12s) / 10) ease-in-out infinite; }
@keyframes ship-oar {
  0%   { transform: rotate(-26deg) scaleY(1);   animation-timing-function: cubic-bezier(.3,0,.6,1); }  /* catch */
  56%  { transform: rotate(20deg)  scaleY(1); }                                                       /* end of drive */
  64%  { transform: rotate(22deg)  scaleY(.78); animation-timing-function: ease-in-out; }              /* blade out */
  94%  { transform: rotate(-28deg) scaleY(.78); }                                                     /* recovery */
  100% { transform: rotate(-26deg) scaleY(1); }
}
@keyframes ship-rower { 0%,100% { transform: translate(9px, 0); } 56% { transform: translate(-9px, 3px); } }
@keyframes ship-sail { 0%,100% { transform: skewX(1deg) scaleX(1); } 18% { transform: skewX(4deg) scaleX(.965); } 30% { transform: skewX(2.5deg) scaleX(.985); } 52% { transform: skewX(5.5deg) scaleX(.95); } 68% { transform: skewX(1.5deg) scaleX(.99); } 84% { transform: skewX(3.5deg) scaleX(.97); } }
@keyframes ship-cloak { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-7deg); } }
</style>
