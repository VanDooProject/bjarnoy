/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, useId } from 'vue';
const { defineProps, } = {};
const props = defineProps();
const uid = useId().replace(/[^a-zA-Z0-9]/g, '-');
const id = (name) => `${uid}-${name}`;
const url = (name) => `url(#${id(name)})`;
const sceneStyle = computed(() => ({ '--hall-elapsed': `${props.elapsedMs ?? 0}ms` }));
// Flame tongues: [path, fill, flicker period ms, phase offset ms].
const TONGUES = [
    ['M800 1132 C 790 1060, 830 1010, 842 940 C 860 1000, 880 1010, 878 960 C 900 1000, 930 960, 920 880 C 970 950, 990 1040, 982 1132 Z', '#c2401a', 600, 0],
    ['M826 1132 C 818 1070, 852 1040, 862 990 C 876 1030, 890 1024, 894 984 C 914 1020, 940 1000, 936 950 C 966 1010, 972 1070, 960 1132 Z', '#f07a2c', 450, -180],
    ['M852 1132 C 846 1090, 868 1070, 876 1036 C 886 1062, 898 1060, 902 1030 C 918 1060, 934 1086, 930 1132 Z', '#ffc35c', 360, -120],
    ['M868 1132 C 866 1110, 880 1098, 886 1080 C 894 1100, 912 1108, 912 1132 Z', '#fff0b8', 300, -240],
    ['M778 1132 C 776 1100, 796 1086, 798 1060 C 812 1086, 826 1100, 822 1132 Z', '#c2401a', 510, -300],
    ['M968 1132 C 966 1104, 984 1090, 988 1062 C 1004 1090, 1012 1108, 1008 1132 Z', '#c2401a', 420, -60],
];
// Embers: [cx, cy, r, sideways drift px, start ms, period ms].
const EMBERS = [
    [870, 1080, 4, -60, 600, 2520], [900, 1070, 3, 40, 780, 2160], [925, 1060, 3.5, 90, 1020, 2880],
    [850, 1090, 2.5, -110, 1200, 2400], [890, 1050, 3, 10, 1440, 3120], [940, 1090, 2.5, 130, 1620, 2280],
    [860, 1060, 3.5, -30, 1860, 2700], [910, 1085, 2, 70, 2100, 1980], [880, 1075, 3, -80, 2340, 3000],
    [955, 1070, 2.5, 30, 2640, 2460], [835, 1080, 2, -140, 2820, 2760], [895, 1090, 4, 110, 3120, 2340],
];
// Smoke column: soft puffs bending towards the smoke hole, each swaying more the higher it is.
// [cx, cy, rx, ry, sway px, period ms, phase ms]
const PUFFS = [
    [890, 1000, 62, 120, 5, 2520, 0],
    [882, 870, 100, 150, 12, 2760, -720],
    [864, 720, 165, 175, 22, 3000, -1440],
    [838, 560, 220, 185, 34, 3300, -2160],
    [808, 400, 270, 175, 46, 3600, -2880],
    [785, 240, 310, 165, 58, 3960, -3600],
];
// the smoke column's box: every puff at the far end of its sway, with a little margin. The smoke masks and
// rects stay inside it: a mask region is rastered whole, and these masks redraw every frame
const SMOKE_BOX = (() => {
    const x0 = Math.min(...PUFFS.map(([cx, , rx, , a]) => cx - rx - a)) - 10;
    const x1 = Math.max(...PUFFS.map(([cx, , rx, , a]) => cx + rx + a)) + 10;
    const y0 = Math.min(...PUFFS.map(([, cy, , ry]) => cy - ry)) - 10;
    const y1 = Math.max(...PUFFS.map(([, cy, , ry]) => cy + ry)) + 10;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
})();
const STONES = [
    [770, 1146, 30, 15], [822, 1152, 32, 15], [880, 1155, 34, 15], [942, 1153, 32, 15], [1000, 1147, 30, 14],
];
const STONE_TOPS = [
    'M748 1141 q22 -10 44 0 q-22 -4 -44 0 Z', 'M800 1146 q22 -10 46 0 q-22 -4 -46 0 Z', 'M856 1149 q24 -10 48 0 q-24 -4 -48 0 Z',
    'M918 1147 q22 -10 46 0 q-22 -4 -46 0 Z', 'M978 1142 q20 -10 42 0 q-20 -4 -42 0 Z',
];
const PLANKS = [-90, 210, 330, 520, 640, 760, 880, 1000, 1120, 1290, 1410, 1530, 1690];
const SKALD = 'M478 1112 C 470 1040, 486 962, 516 908 C 524 880, 530 846, 544 814 C 548 800, 552 792, 556 780 ' +
    'C 566 770, 590 768, 606 778 C 618 788, 622 804, 624 818 L 636 838 L 628 842 C 630 850, 632 856, 628 862 ' +
    'C 640 884, 636 916, 618 948 L 612 940 C 622 920, 626 902, 622 888 L 640 906 C 650 924, 654 942, 654 960 ' +
    'C 656 976, 660 990, 664 1000 C 690 998, 712 1002, 726 1016 C 734 1040, 734 1090, 732 1132 L 756 1142 ' +
    'L 756 1150 L 700 1150 C 698 1110, 698 1070, 692 1046 C 682 1052, 674 1066, 668 1100 L 660 1112 Z';
const ARM = 'M 626 896 L 640 906 C 664 918, 684 930, 700 934 C 712 920, 724 904, 734 890 L 742 868 L 750 864 L 754 872 ' +
    'L 764 866 L 766 876 L 760 892 C 750 914, 730 946, 712 966 C 696 978, 672 970, 650 958 C 638 950, 628 930, 626 896 Z';
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    void {};
    /** @type {__VLS_StyleScopedClasses['cam']} */ ;
    /** @type {__VLS_StyleScopedClasses['far']} */ ;
    /** @type {__VLS_StyleScopedClasses['near']} */ ;
    /** @type {__VLS_StyleScopedClasses['arm']} */ ;
    /** @type {__VLS_StyleScopedClasses['skald']} */ ;
    /** @type {__VLS_StyleScopedClasses['staff']} */ ;
    /** @type {__VLS_StyleScopedClasses['gutter']} */ ;
    /** @type {__VLS_StyleScopedClasses['tongue']} */ ;
    /** @type {__VLS_StyleScopedClasses['glow']} */ ;
    /** @type {__VLS_StyleScopedClasses['hall']} */ ;
    /** @type {__VLS_StyleScopedClasses['hall']} */ ;
    /** @type {__VLS_StyleScopedClasses['cam']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-fire']} */ ;
    /** @type {__VLS_StyleScopedClasses['far']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-fire']} */ ;
    /** @type {__VLS_StyleScopedClasses['near']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-fire']} */ ;
    /** @type {__VLS_StyleScopedClasses['skald']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-fire']} */ ;
    /** @type {__VLS_StyleScopedClasses['staff']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-fire']} */ ;
    /** @type {__VLS_StyleScopedClasses['gutter']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-fire']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-fire']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-fire']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-fire']} */ ;
    /** @type {__VLS_StyleScopedClasses['arm']} */ ;
    /** @type {__VLS_StyleScopedClasses['cam']} */ ;
    /** @type {__VLS_StyleScopedClasses['far']} */ ;
    /** @type {__VLS_StyleScopedClasses['near']} */ ;
    /** @type {__VLS_StyleScopedClasses['skald']} */ ;
    /** @type {__VLS_StyleScopedClasses['staff']} */ ;
    /** @type {__VLS_StyleScopedClasses['gutter']} */ ;
    /** @type {__VLS_StyleScopedClasses['dim']} */ ;
    /** @type {__VLS_StyleScopedClasses['rimlight']} */ ;
    /** @type {__VLS_StyleScopedClasses['dark']} */ ;
    /** @type {__VLS_StyleScopedClasses['arm']} */ ;
    /** @type {__VLS_StyleScopedClasses['dark']} */ ;
    /** @type {__VLS_StyleScopedClasses['cam']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-prophecy']} */ ;
    /** @type {__VLS_StyleScopedClasses['far']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-prophecy']} */ ;
    /** @type {__VLS_StyleScopedClasses['near']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-prophecy']} */ ;
    /** @type {__VLS_StyleScopedClasses['skald']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-prophecy']} */ ;
    /** @type {__VLS_StyleScopedClasses['staff']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-prophecy']} */ ;
    /** @type {__VLS_StyleScopedClasses['gutter']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-prophecy']} */ ;
    /** @type {__VLS_StyleScopedClasses['dim']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-prophecy']} */ ;
    /** @type {__VLS_StyleScopedClasses['arm']} */ ;
    /** @type {__VLS_StyleScopedClasses['tongue']} */ ;
    /** @type {__VLS_StyleScopedClasses['glow']} */ ;
    /** @type {__VLS_StyleScopedClasses['ember']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
        ...{ class: "intro-beat hall" },
        ...{ class: ([`is-${__VLS_ctx.beat}`, { 'is-paused': __VLS_ctx.paused, 'is-held': __VLS_ctx.held }]) },
        ...{ style: (__VLS_unwrap(sceneStyle, {})) },
        viewBox: "0 0 1600 1600",
        preserveAspectRatio: "xMidYMid slice",
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['intro-beat']} */ ;
    /** @type {__VLS_StyleScopedClasses['hall']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-paused']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-held']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.defs, __VLS_intrinsics.defs)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        id: (__VLS_unwrap(id, {})('skald')),
        d: (__VLS_unwrap(SKALD, {})),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        id: (__VLS_unwrap(id, {})('arm')),
        d: (__VLS_unwrap(ARM, {})),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.clipPath, __VLS_intrinsics.clipPath)({
        id: (__VLS_unwrap(id, {})('skald-clip')),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.use)({
        href: (`#${__VLS_unwrap(id, {})('skald')}`),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.clipPath, __VLS_intrinsics.clipPath)({
        id: (__VLS_unwrap(id, {})('arm-clip')),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.use)({
        href: (`#${__VLS_unwrap(id, {})('arm')}`),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.linearGradient, __VLS_intrinsics.linearGradient)({
        id: (__VLS_unwrap(id, {})('lit')),
        gradientUnits: "userSpaceOnUse",
        x1: "560",
        y1: "0",
        x2: "770",
        y2: "0",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "0",
        'stop-color': "#7a3214",
        'stop-opacity': "0",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "1",
        'stop-color': "#7a3214",
        'stop-opacity': ".6",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
        id: (__VLS_unwrap(id, {})('glow')),
        cx: "50%",
        cy: "50%",
        r: "50%",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "0",
        'stop-color': "#ffb764",
        'stop-opacity': ".62",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: ".22",
        'stop-color': "#f07a2c",
        'stop-opacity': ".34",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: ".55",
        'stop-color': "#9a3d17",
        'stop-opacity': ".14",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "1",
        'stop-color': "#5a1f0b",
        'stop-opacity': "0",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
        id: (__VLS_unwrap(id, {})('floorlight')),
        cx: "50%",
        cy: "50%",
        r: "50%",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "0",
        'stop-color': "#ff9a48",
        'stop-opacity': ".42",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "1",
        'stop-color': "#ff9a48",
        'stop-opacity': "0",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
        id: (__VLS_unwrap(id, {})('vignette')),
        cx: "50%",
        cy: "56%",
        r: "62%",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: ".55",
        'stop-color': "#000",
        'stop-opacity': "0",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "1",
        'stop-color': "#000",
        'stop-opacity': ".78",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
        id: (__VLS_unwrap(id, {})('puff')),
        cx: "50%",
        cy: "50%",
        r: "50%",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "0",
        'stop-color': "#fff",
        'stop-opacity': ".9",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: ".55",
        'stop-color': "#fff",
        'stop-opacity': ".5",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "1",
        'stop-color': "#fff",
        'stop-opacity': "0",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.pattern)({
        id: (__VLS_unwrap(id, {})('fog-a')),
        href: "#intro-fog",
        patternTransform: "scale(2)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.pattern)({
        id: (__VLS_unwrap(id, {})('fog-b')),
        href: "#intro-fog",
        patternTransform: "translate(60 210) scale(2)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
        id: (__VLS_unwrap(id, {})('column')),
        maskUnits: "userSpaceOnUse",
        ...(__VLS_unwrap(SMOKE_BOX, {})),
    });
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(PUFFS, {})));
    for (const [p, i] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            key: (i),
            ...{ class: "sway" },
            ...{ style: ({ '--a': `${p[4]}px`, '--p': `${p[5]}ms`, '--o': `${p[6]}ms` }) },
        });
        /** @type {__VLS_StyleScopedClasses['sway']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            cx: (p[0]),
            cy: (p[1]),
            rx: (p[2]),
            ry: (p[3]),
            fill: (__VLS_unwrap(url, {})('puff')),
        });
        // @ts-ignore
        [beat, paused, held, sceneStyle, id, id, id, id, id, id, id, id, id, id, id, id, id, id, SKALD, ARM, SMOKE_BOX, PUFFS, url,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
        id: (__VLS_unwrap(id, {})('smoke-a')),
        maskUnits: "userSpaceOnUse",
        ...(__VLS_unwrap(SMOKE_BOX, {})),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "rise-a" },
    });
    /** @type {__VLS_StyleScopedClasses['rise-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "lean lean-a" },
    });
    /** @type {__VLS_StyleScopedClasses['lean']} */ ;
    /** @type {__VLS_StyleScopedClasses['lean-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "300",
        y: "0",
        width: "1300",
        height: "1800",
        fill: (__VLS_unwrap(url, {})('fog-a')),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
        id: (__VLS_unwrap(id, {})('smoke-b')),
        maskUnits: "userSpaceOnUse",
        ...(__VLS_unwrap(SMOKE_BOX, {})),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "rise-b" },
    });
    /** @type {__VLS_StyleScopedClasses['rise-b']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "lean lean-b" },
    });
    /** @type {__VLS_StyleScopedClasses['lean']} */ ;
    /** @type {__VLS_StyleScopedClasses['lean-b']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "300",
        y: "0",
        width: "1300",
        height: "1800",
        fill: (__VLS_unwrap(url, {})('fog-b')),
    });
    var __VLS_1 = {
        id: (__VLS_unwrap(id, {})),
    };
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "cam" },
    });
    /** @type {__VLS_StyleScopedClasses['cam']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "far" },
    });
    /** @type {__VLS_StyleScopedClasses['far']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "-400",
        y: "-200",
        width: "2400",
        height: "2000",
        fill: "#0d0705",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "-400",
        y: "330",
        width: "2400",
        height: "830",
        fill: "#170e09",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        fill: "#1c110b",
    });
    const __VLS_3 = __VLS_tryAsConstant((__VLS_unwrap(PLANKS, {})));
    for (const [x] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            key: (x),
            x: (x),
            y: "330",
            width: "7",
            height: "830",
        });
        // @ts-ignore
        [id, id, id, SMOKE_BOX, SMOKE_BOX, url, url, PLANKS,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M-400 620 L700 70 L900 70 L2000 620 L2000 480 L900 -60 L700 -60 L-400 480 Z",
        fill: "#100906",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M-400 660 L700 110 L700 70 L-400 620 Z M2000 660 L900 110 L900 70 L2000 620 Z",
        fill: "#22150d",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "-400",
        y: "448",
        width: "2400",
        height: "38",
        fill: "#24160e",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "-400",
        y: "486",
        width: "2400",
        height: "8",
        fill: "#1a100a",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        fill: "#26170e",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M392 494 h50 v666 h-50 Z M386 494 h62 l-8 26 h-46 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M1158 494 h50 v666 h-50 Z M1152 494 h62 l-8 26 h-46 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M70 494 h56 v666 h-56 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M1474 494 h56 v666 h-56 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M-250 494 h56 v666 h-56 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M1790 494 h56 v666 h-56 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: "250",
        cy: "760",
        r: "72",
        fill: "#2b1a10",
        stroke: "#3a2416",
        'stroke-width': "10",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M250 688 v144 M178 760 h144",
        stroke: "#22150d",
        'stroke-width': "12",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: "250",
        cy: "760",
        r: "17",
        fill: "#3d2717",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: "1352",
        cy: "742",
        r: "72",
        fill: "#2b1a10",
        stroke: "#3a2416",
        'stroke-width': "10",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M1301 691 l102 102 M1403 691 l-102 102",
        stroke: "#22150d",
        'stroke-width': "12",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: "1352",
        cy: "742",
        r: "17",
        fill: "#3d2717",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: "-80",
        cy: "770",
        r: "64",
        fill: "#2b1a10",
        stroke: "#3a2416",
        'stroke-width': "10",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: "-80",
        cy: "770",
        r: "15",
        fill: "#3d2717",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: "1680",
        cy: "760",
        r: "64",
        fill: "#2b1a10",
        stroke: "#3a2416",
        'stroke-width': "10",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: "1680",
        cy: "760",
        r: "15",
        fill: "#3d2717",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        fill: "#1f130c",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "560",
        y: "494",
        width: "4",
        height: "120",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M548 614 h28 l-6 70 h-16 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "1060",
        y: "494",
        width: "4",
        height: "96",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M1050 590 h24 l-5 54 h-14 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "dim" },
    });
    /** @type {__VLS_StyleScopedClasses['dim']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "glow" },
        cx: "890",
        cy: "1010",
        r: "760",
        fill: (__VLS_unwrap(url, {})('glow')),
    });
    /** @type {__VLS_StyleScopedClasses['glow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "-400",
        y: "1150",
        width: "2400",
        height: "650",
        fill: "#120a06",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "-400",
        y: "1150",
        width: "2400",
        height: "6",
        fill: "#2a180e",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "dim" },
    });
    /** @type {__VLS_StyleScopedClasses['dim']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
        ...{ class: "glow" },
        cx: "890",
        cy: "1168",
        rx: "620",
        ry: "96",
        fill: (__VLS_unwrap(url, {})('floorlight')),
    });
    /** @type {__VLS_StyleScopedClasses['glow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M752 1150 q138 -30 276 0 q-138 22 -276 0 Z",
        fill: "#1a0f09",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        fill: "#2b1a11",
    });
    const __VLS_4 = __VLS_tryAsConstant((__VLS_unwrap(STONES, {})));
    for (const [s, i] of __VLS_vFor(__VLS_nonNull(__VLS_4))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            key: (i),
            cx: (s[0]),
            cy: (s[1]),
            rx: (s[2]),
            ry: (s[3]),
        });
        // @ts-ignore
        [url, url, STONES,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "rim" },
        fill: "#6b3518",
    });
    /** @type {__VLS_StyleScopedClasses['rim']} */ ;
    const __VLS_5 = __VLS_tryAsConstant((__VLS_unwrap(STONE_TOPS, {})));
    for (const [d, i] of __VLS_vFor(__VLS_nonNull(__VLS_5))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            key: (i),
            d: (d),
        });
        // @ts-ignore
        [STONE_TOPS,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "800",
        y: "1118",
        width: "190",
        height: "20",
        rx: "9",
        fill: "#1d1109",
        transform: "rotate(-7 895 1128)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "790",
        y: "1120",
        width: "200",
        height: "20",
        rx: "9",
        fill: "#24150b",
        transform: "rotate(8 890 1130)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "staff" },
    });
    /** @type {__VLS_StyleScopedClasses['staff']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "rimlight" },
    });
    /** @type {__VLS_StyleScopedClasses['rimlight']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "rim" },
        d: "M604 1128 L656 690",
        stroke: "#8a3f19",
        'stroke-width': "13",
        'stroke-linecap': "round",
        transform: "translate(4 -2)",
    });
    /** @type {__VLS_StyleScopedClasses['rim']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M604 1128 L656 690",
        stroke: "#0a0504",
        'stroke-width': "13",
        'stroke-linecap': "round",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M656 690 q-14 -10 -6 -30 q14 -4 18 12 q4 12 -12 18 Z",
        fill: "#0a0504",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "skald" },
    });
    /** @type {__VLS_StyleScopedClasses['skald']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M432 1150 q4 -48 30 -56 h170 q26 8 30 56 Z",
        fill: "#140b07",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "rimlight" },
    });
    /** @type {__VLS_StyleScopedClasses['rimlight']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.use)({
        ...{ class: "rim" },
        href: (`#${__VLS_unwrap(id, {})('skald')}`),
        fill: "#8a3f19",
        transform: "translate(5 -3)",
    });
    /** @type {__VLS_StyleScopedClasses['rim']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.use)({
        href: (`#${__VLS_unwrap(id, {})('skald')}`),
        fill: "#1a0e09",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "rimlight" },
        'clip-path': (__VLS_unwrap(url, {})('skald-clip')),
    });
    /** @type {__VLS_StyleScopedClasses['rimlight']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "430",
        y: "740",
        width: "360",
        height: "420",
        fill: (__VLS_unwrap(url, {})('lit')),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "arm" },
    });
    /** @type {__VLS_StyleScopedClasses['arm']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "rimlight" },
    });
    /** @type {__VLS_StyleScopedClasses['rimlight']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.use)({
        ...{ class: "rim" },
        href: (`#${__VLS_unwrap(id, {})('arm')}`),
        fill: "#8a3f19",
        transform: "translate(5 -3)",
    });
    /** @type {__VLS_StyleScopedClasses['rim']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.use)({
        href: (`#${__VLS_unwrap(id, {})('arm')}`),
        fill: "#1a0e09",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "rimlight" },
        'clip-path': (__VLS_unwrap(url, {})('arm-clip')),
    });
    /** @type {__VLS_StyleScopedClasses['rimlight']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "620",
        y: "850",
        width: "160",
        height: "140",
        fill: (__VLS_unwrap(url, {})('lit')),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "near" },
        fill: "#050302",
    });
    /** @type {__VLS_StyleScopedClasses['near']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M-100 1600 L-100 1330 C -20 1290, 60 1280, 120 1296 C 150 1250, 210 1236, 250 1262 C 282 1282, 292 1318, 282 1350 C 330 1380, 360 1440, 372 1600 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M1700 1600 L1700 1360 C 1640 1330, 1560 1326, 1500 1350 C 1474 1310, 1420 1300, 1388 1328 C 1360 1352, 1360 1390, 1376 1414 C 1328 1442, 1300 1520, 1296 1600 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "smoke" },
        mask: (__VLS_unwrap(url, {})('column')),
    });
    /** @type {__VLS_StyleScopedClasses['smoke']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        ...(__VLS_unwrap(SMOKE_BOX, {})),
        fill: "#806c5e",
        mask: (__VLS_unwrap(url, {})('smoke-a')),
        opacity: ".75",
    });
    var __VLS_6 = {
        id: (__VLS_unwrap(id, {})),
        url: (__VLS_unwrap(url, {})),
    };
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "smoke" },
        mask: (__VLS_unwrap(url, {})('column')),
    });
    /** @type {__VLS_StyleScopedClasses['smoke']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        ...(__VLS_unwrap(SMOKE_BOX, {})),
        fill: "#806c5e",
        mask: (__VLS_unwrap(url, {})('smoke-b')),
        opacity: ".55",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "gutter" },
    });
    /** @type {__VLS_StyleScopedClasses['gutter']} */ ;
    const __VLS_8 = __VLS_tryAsConstant((__VLS_unwrap(TONGUES, {})));
    for (const [t, i] of __VLS_vFor(__VLS_nonNull(__VLS_8))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            key: (i),
            ...{ class: "tongue" },
            ...{ style: ({ '--p': `${t[2]}ms`, '--o': `${t[3]}ms` }) },
        });
        /** @type {__VLS_StyleScopedClasses['tongue']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: (t[0]),
            fill: (t[1]),
        });
        // @ts-ignore
        [id, id, id, id, id, SMOKE_BOX, SMOKE_BOX, url, url, url, url, url, url, url, url, url, TONGUES,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        fill: "#ffbe63",
    });
    const __VLS_9 = __VLS_tryAsConstant((__VLS_unwrap(EMBERS, {})));
    for (const [e, i] of __VLS_vFor(__VLS_nonNull(__VLS_9))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            key: (i),
            ...{ class: "ember" },
            cx: (e[0]),
            cy: (e[1]),
            r: (e[2]),
            ...{ style: ({ '--x': `${e[3]}px`, '--d': `${e[4]}ms`, '--s': `${e[5]}ms` }) },
        });
        /** @type {__VLS_StyleScopedClasses['ember']} */ ;
        // @ts-ignore
        [EMBERS,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "0",
        y: "0",
        width: "1600",
        height: "1600",
        fill: (__VLS_unwrap(url, {})('vignette')),
    });
    if (__VLS_ctx.beat === 'fire') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            ...{ class: "dark" },
            x: "0",
            y: "0",
            width: "1600",
            height: "1600",
            fill: "#000",
        });
        /** @type {__VLS_StyleScopedClasses['dark']} */ ;
    }
    var __VLS_2 = __VLS_1, __VLS_7 = __VLS_6;
    // @ts-ignore
    [beat, url,];
    return {
        __VLS_Slots: {},
    };
};
void [__VLS_template, {}];
const __VLS_base = (await import('vue')).defineComponent({
    __typeProps: {},
});
const __VLS_export = {};
export default {};
