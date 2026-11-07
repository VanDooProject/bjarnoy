/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { useId } from 'vue';
const { defineProps, } = {};
const __VLS_props = defineProps();
const uid = useId().replace(/[^a-zA-Z0-9]/g, '-');
const id = (name) => `${uid}-${name}`;
const url = (name) => `url(#${id(name)})`;
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
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-l-sky']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-l-far']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-l-surf']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-l-deep']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-l-front']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-glint']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-glint']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-flap']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-kelp']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
        ...{ class: "intro-beat b4" },
        ...{ class: ({ 'is-paused': __VLS_ctx.paused }) },
        viewBox: "0 0 1600 1600",
        preserveAspectRatio: "xMidYMid slice",
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['intro-beat']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-paused']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.defs, __VLS_intrinsics.defs)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
        id: (__VLS_unwrap(id, {})('eyeGlow')),
        cx: "0.5",
        cy: "0.5",
        r: "0.5",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "0",
        'stop-color': "#c8fbf4",
        'stop-opacity': "1",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: ".25",
        'stop-color': "#7fe3dc",
        'stop-opacity': ".75",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "1",
        'stop-color': "#3fb3b0",
        'stop-opacity': "0",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
        id: (__VLS_unwrap(id, {})('surfGlow')),
        cx: "0.5",
        cy: "0.5",
        r: "0.5",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "0",
        'stop-color': "#c8fbf4",
        'stop-opacity': ".9",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: ".4",
        'stop-color': "#7fe3dc",
        'stop-opacity': ".35",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "1",
        'stop-color': "#3fb3b0",
        'stop-opacity': "0",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
        id: (__VLS_unwrap(id, {})('moonHalo')),
        cx: "0.5",
        cy: "0.5",
        r: "0.5",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: ".45",
        'stop-color': "#cfd6cc",
        'stop-opacity': ".22",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "1",
        'stop-color': "#cfd6cc",
        'stop-opacity': "0",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.linearGradient, __VLS_intrinsics.linearGradient)({
        id: (__VLS_unwrap(id, {})('fogFade')),
        x1: "0",
        y1: "0",
        x2: "0",
        y2: "1",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "0",
        'stop-color': "#fff",
        'stop-opacity': "0",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: ".45",
        'stop-color': "#fff",
        'stop-opacity': "1",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: ".6",
        'stop-color': "#fff",
        'stop-opacity': "1",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "1",
        'stop-color': "#fff",
        'stop-opacity': "0",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
        id: (__VLS_unwrap(id, {})('fogMask')),
        maskUnits: "userSpaceOnUse",
        x: "-300",
        y: "540",
        width: "2400",
        height: "300",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "-300",
        y: "540",
        width: "2400",
        height: "300",
        fill: (__VLS_unwrap(url, {})('fogFade')),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.pattern)({
        id: (__VLS_unwrap(id, {})('fog')),
        href: "#intro-fog",
        patternTransform: "scale(2)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-fadein b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-fadein']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "-300",
        y: "-300",
        width: "2200",
        height: "2200",
        fill: "#d8dccd",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-zoom b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-zoom']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-l-sky b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-l-sky']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "-200",
        y: "-200",
        width: "2000",
        height: "560",
        fill: "#121a28",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#1a2536",
        d: "M-200,330 C200,300 500,350 800,320 C1100,290 1400,340 1800,310 L1800,560 L-200,560 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#23324a",
        d: "M-200,520 C150,490 520,540 860,505 C1180,475 1450,520 1800,500 L1800,700 L-200,700 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#2f4560",
        d: "M-200,640 C300,615 700,650 1000,628 C1300,608 1550,640 1800,630 L1800,800 L-200,800 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: "1030",
        cy: "470",
        r: "260",
        fill: (__VLS_unwrap(url, {})('moonHalo')),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        cx: "1030",
        cy: "470",
        r: "118",
        fill: "#d8dccd",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-craterout b4-a" },
        fill: "#c4c9b8",
        d: "M990,410 a22,18 0 1,0 1,0 Z M1080,500 a30,24 0 1,0 1,0 Z M1040,535 a12,10 0 1,0 1,0 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-craterout']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-l-far b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-l-far']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#3a5470",
        d: "M1080,742 C1130,722 1180,716 1230,726 C1260,712 1300,714 1330,730 L1360,742 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#1c2a3c",
        d: "M330,744 L380,720 L410,722 L440,700 L470,702 L500,672 L530,668 L556,640 L574,642 L600,620 L620,626 L640,600 L660,606 L690,640 L716,646 L742,676 L770,690 L800,712 L840,728 L880,744 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#1c2a3c",
        d: "M452,704 l8,-26 l8,26 Z M486,676 l7,-24 l7,24 Z M520,672 l9,-30 l9,30 Z M562,644 l7,-26 l7,26 Z M610,626 l8,-28 l8,28 Z M664,610 l7,-22 l7,22 Z M700,644 l8,-26 l8,26 Z M734,674 l7,-22 l7,22 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        mask: (__VLS_unwrap(url, {})('fogMask')),
        ...{ class: "b4-fogout b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-fogout']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        ...{ class: "b4-fog b4-a" },
        x: "-300",
        y: "540",
        width: "2600",
        height: "300",
        fill: (__VLS_unwrap(url, {})('fog')),
    });
    /** @type {__VLS_StyleScopedClasses['b4-fog']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-l-surf b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-l-surf']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#1f4c57",
        d: "M-200,744 C-100,736 0,750 100,742 C200,734 300,750 400,742 C500,734 600,750 700,742 C800,734 900,750 1000,742 C1100,734 1200,750 1300,742 C1400,734 1500,750 1600,742 C1700,734 1800,748 1900,742 L1900,1000 L-200,1000 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#7fa6aa",
        d: "M-200,744 C-100,736 0,750 100,742 C200,734 300,750 400,742 C500,734 600,750 700,742 C800,734 900,750 1000,742 C1100,734 1200,750 1300,742 C1400,734 1500,750 1600,742 C1700,734 1800,748 1900,742 L1900,750 C1800,756 1700,742 1600,750 C1500,758 1400,742 1300,750 C1200,758 1100,742 1000,750 C900,758 800,742 700,750 C600,758 500,742 400,750 C300,758 200,742 100,750 C0,758 -100,744 -200,752 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        fill: "#e3e6d6",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        ...{ class: "b4-glint" },
        x: "980",
        y: "760",
        width: "110",
        height: "5",
        rx: "2.5",
    });
    /** @type {__VLS_StyleScopedClasses['b4-glint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        ...{ class: "b4-glint" },
        x: "1004",
        y: "776",
        width: "64",
        height: "4",
        rx: "2",
    });
    /** @type {__VLS_StyleScopedClasses['b4-glint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        ...{ class: "b4-glint" },
        x: "1018",
        y: "790",
        width: "34",
        height: "3",
        rx: "1.5",
    });
    /** @type {__VLS_StyleScopedClasses['b4-glint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
        ...{ class: "b4-sglow b4-a" },
        cx: "858",
        cy: "748",
        rx: "190",
        ry: "38",
        fill: (__VLS_unwrap(url, {})('surfGlow')),
    });
    /** @type {__VLS_StyleScopedClasses['b4-sglow']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(858 746)",
        fill: "none",
        stroke: "#bfe6e2",
        'stroke-width': "3",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
        ...{ class: "b4-ring b4-a" },
        ...{ style: {} },
        rx: "80",
        ry: "10",
    });
    /** @type {__VLS_StyleScopedClasses['b4-ring']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
        ...{ class: "b4-ring b4-a" },
        ...{ style: {} },
        rx: "80",
        ry: "10",
    });
    /** @type {__VLS_StyleScopedClasses['b4-ring']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
        ...{ class: "b4-ring b4-a" },
        ...{ style: {} },
        rx: "110",
        ry: "13",
    });
    /** @type {__VLS_StyleScopedClasses['b4-ring']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
        ...{ class: "b4-ring b4-a" },
        ...{ style: {} },
        rx: "80",
        ry: "10",
    });
    /** @type {__VLS_StyleScopedClasses['b4-ring']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-l-deep b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-l-deep']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#183d48",
        d: "M-200,880 C200,862 500,900 800,878 C1100,858 1400,896 1900,872 L1900,1800 L-200,1800 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#112f39",
        d: "M-200,1010 C250,990 600,1030 900,1004 C1200,984 1500,1020 1900,1000 L1900,1800 L-200,1800 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(0 -80)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-heave b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-heave']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#0a1d24",
        d: "M-200,1330 C150,1210 300,1120 430,1112 C500,1106 545,1108 575,1100 C600,1094 616,1126 644,1138 C674,1146 700,1118 718,1080 C730,1060 742,1046 752,1044 C762,1046 768,1070 778,1092 C790,1110 812,1104 826,1100 C838,1110 846,1116 856,1110 C870,1104 880,1110 890,1118 C920,1140 960,1134 990,1130 C1030,1128 1060,1160 1110,1180 C1180,1200 1240,1170 1320,1160 C1420,1150 1560,1168 1900,1190 L1900,1800 L-200,1800 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#12303a",
        d: "M400,1122 c10,-8 22,-8 30,-2 c-8,2 -20,4 -30,2 Z M470,1112 c8,-6 18,-6 24,0 Z M1180,1196 c12,-10 30,-10 40,-2 Z M1350,1166 c14,-8 30,-8 42,0 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-eye b4-a" },
        cx: "640",
        cy: "1144",
        r: "90",
        fill: (__VLS_unwrap(url, {})('eyeGlow')),
    });
    /** @type {__VLS_StyleScopedClasses['b4-eye']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-eye b4-a" },
        fill: "none",
        stroke: "#c8fbf4",
        'stroke-width': "4",
        'stroke-linecap': "round",
        d: "M614,1140 Q640,1154 668,1144",
    });
    /** @type {__VLS_StyleScopedClasses['b4-eye']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-rune b4-a" },
        fill: "none",
        stroke: "#8fe6df",
        'stroke-width': "3.5",
        'stroke-linecap': "round",
    });
    /** @type {__VLS_StyleScopedClasses['b4-rune']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M452,1134 l0,22 M452,1140 l10,-6 M452,1148 l10,-6",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M486,1128 l0,22 M486,1128 l9,8 l-9,8",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M520,1124 l0,22 M512,1132 l16,8",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M552,1120 l0,22 M552,1128 l9,-6 M552,1128 l-9,-6",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(858 1028)",
        fill: "#bfe6e2",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "9",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "6",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "12",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "5",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "8",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "10",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "5",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "7",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "15",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "10",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "19",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "8",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "12",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "b4-bub b4-a" },
        ...{ style: {} },
        r: "9",
    });
    /** @type {__VLS_StyleScopedClasses['b4-bub']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-l-front b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-l-front']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        fill: "#06141a",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(260 1330)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-kelp" },
        d: "M-6,0 C-20,-60 14,-110 -4,-170 C-12,-200 4,-230 10,-250 C14,-220 4,-200 10,-170 C26,-110 -6,-60 8,0 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-kelp']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(300 1340)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-kelp" },
        d: "M-5,0 C-16,-50 12,-90 -2,-140 C-8,-160 4,-180 8,-196 C12,-174 4,-158 9,-140 C22,-90 -4,-50 7,0 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-kelp']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(1290 1300)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-kelp" },
        d: "M-6,0 C-20,-60 14,-110 -4,-170 C-12,-200 4,-230 10,-250 C14,-220 4,-200 10,-170 C26,-110 -6,-60 8,0 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-kelp']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(1340 1310)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-kelp" },
        d: "M-5,0 C-16,-50 12,-90 -2,-140 C-8,-160 4,-180 8,-196 C12,-174 4,-158 9,-140 C22,-90 -4,-50 7,0 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-kelp']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M-300,1340 C-100,1300 100,1320 260,1306 C380,1296 460,1330 600,1336 C760,1342 900,1300 1060,1312 C1200,1322 1300,1290 1450,1296 C1600,1302 1750,1330 1900,1320 L1900,1800 L-300,1800 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-r1 b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-r1']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(-6 -6) scale(.86)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-flap b4-far" },
        fill: "#151b24",
        d: "M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-flap']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-far']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#07090d",
        d: "M-66,-8 L-32,-5 C-12,-12 18,-12 33,-7 C40,-13 51,-13 57,-7 L74,-3 L57,1 C49,6 39,6 31,5 C10,11 -20,9 -34,4 L-66,10 L-56,1 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(2 -6)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-flap" },
        fill: "#07090d",
        d: "M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-flap']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-r2 b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-r2']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(-6 -6) scale(.86)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-flap b4-far" },
        fill: "#151b24",
        d: "M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-flap']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-far']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#07090d",
        d: "M-66,-8 L-32,-5 C-12,-12 18,-12 33,-7 C40,-13 51,-13 57,-7 L74,-3 L57,1 C49,6 39,6 31,5 C10,11 -20,9 -34,4 L-66,10 L-56,1 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(2 -6)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-flap" },
        fill: "#07090d",
        d: "M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-flap']} */ ;
    // @ts-ignore
    [paused, id, id, id, id, id, id, url, url, url, url, url, url,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
