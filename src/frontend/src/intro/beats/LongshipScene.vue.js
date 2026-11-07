/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { useId } from 'vue';
import { FOG_UNEXPLORED_CSS } from '../../lib/map/fogColours';
// Wave lengths of the sea bands and fog tile sizes. The drift keyframes (b5-x*) move whole multiples of
// these per loop, which is what makes every layer loop seamlessly (checked in LongshipScene.test.ts).
export const SEA_WAVE_LEN = { mid: 200, near: 160, fg1: 400, fg2: 320 };
export const FOG_TILE = { hz: 768, other: 1024 };
export const ISLES_STRIP_WIDTH = 1600;
export default {};
const { defineProps, } = {};
const __VLS_export = await (async () => {
    const __VLS_props = defineProps();
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '-');
    const id = (name) => `${uid}-${name}`;
    const url = (name) => `url(#${id(name)})`;
    // A wave band: filled down to `bottom`, one crest per `len`.
    function wave(x0, x1, y, amp, len, bottom) {
        let d = `M${x0} ${bottom} L${x0} ${y}`;
        for (let x = x0; x < x1; x += len)
            d += ` Q${x + len / 4} ${y - amp} ${x + len / 2} ${y} Q${x + (3 * len) / 4} ${y + amp * 0.6} ${x + len} ${y}`;
        return `${d} L${x1} ${bottom}Z`;
    }
    // Foam dashes, one per wave length.
    function dashes(x0, x1, y, len, w) {
        let d = '';
        for (let x = x0; x < x1; x += len)
            d += `M${x + len * 0.12} ${y} h${w} `;
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
    const SHIELDS = Array.from({ length: 11 }, (_, i) => ({ x: 560 + i * 48, fill: i % 2 ? '#3b4b56' : '#2c3b45' }));
    const OARS = [584, 680, 776, 872, 968, 1064].map((x) => ({
        x,
        body: `M${x - 17} 892 L${x - 14} 856 C${x - 10} 847 ${x + 10} 847 ${x + 14} 856 L${x + 17} 892Z`,
    }));
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
        __VLS_withDotValue(SEA, {});
        void {};
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['light']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['light']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['r-wander']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['rb']} */ ;
        /** @type {__VLS_StyleScopedClasses['wing']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['rb']} */ ;
        /** @type {__VLS_StyleScopedClasses['wing']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['wing']} */ ;
        /** @type {__VLS_StyleScopedClasses['far']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['lf-coast']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5-landfall']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5-landfall']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5-landfall']} */ ;
        /** @type {__VLS_StyleScopedClasses['lf-mist']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5-landfall']} */ ;
        /** @type {__VLS_StyleScopedClasses['lf-curtain']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "longship" },
            ...{ class: ({ 'is-landfall': __VLS_ctx.landfall }) },
        });
        /** @type {__VLS_StyleScopedClasses['longship']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-landfall']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            ...{ class: "intro-beat b5" },
            ...{ class: ({ 'is-paused': __VLS_ctx.paused, 'b5-landfall': __VLS_ctx.landfall }) },
            viewBox: "0 0 1600 1600",
            preserveAspectRatio: "xMidYMid slice",
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['intro-beat']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-paused']} */ ;
        /** @type {__VLS_StyleScopedClasses['b5-landfall']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.defs, __VLS_intrinsics.defs)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.linearGradient, __VLS_intrinsics.linearGradient)({
            id: (__VLS_unwrap(id, {})('sky')),
            x1: "0",
            y1: "0",
            x2: "0",
            y2: "1",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "0",
            'stop-color': "#c4d0d8",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: ".52",
            'stop-color': "#e2e9ed",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: ".6",
            'stop-color': "#d4dee4",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "1",
            'stop-color': "#b9c7d0",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.pattern)({
            id: (__VLS_unwrap(id, {})('fog768')),
            href: "#intro-fog",
            patternTransform: "rotate(90) scale(3)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.pattern)({
            id: (__VLS_unwrap(id, {})('fog1024')),
            href: "#intro-fog",
            patternTransform: "scale(4)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.pattern)({
            id: (__VLS_unwrap(id, {})('fog1024f')),
            href: "#intro-fog",
            patternTransform: "scale(-4 4)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.pattern)({
            id: (__VLS_unwrap(id, {})('fog1024r')),
            href: "#intro-fog",
            patternTransform: "rotate(180) scale(4)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.linearGradient, __VLS_intrinsics.linearGradient)({
            id: (__VLS_unwrap(id, {})('g-sky')),
            x1: "0",
            y1: "0",
            x2: "0",
            y2: "1",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "0",
            'stop-color': "#fff",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: ".55",
            'stop-color': "#fff",
            'stop-opacity': ".8",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "1",
            'stop-color': "#fff",
            'stop-opacity': "0",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.linearGradient, __VLS_intrinsics.linearGradient)({
            id: (__VLS_unwrap(id, {})('g-band')),
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
            offset: ".5",
            'stop-color': "#fff",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "1",
            'stop-color': "#fff",
            'stop-opacity': "0",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.linearGradient, __VLS_intrinsics.linearGradient)({
            id: (__VLS_unwrap(id, {})('g-fg')),
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
            offset: ".4",
            'stop-color': "#fff",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "1",
            'stop-color': "#fff",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('m-sky')),
            maskUnits: "userSpaceOnUse",
            x: "0",
            y: "0",
            width: "1600",
            height: "1600",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "0",
            width: "1600",
            height: "900",
            fill: (__VLS_unwrap(url, {})('g-sky')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('m-hz')),
            maskUnits: "userSpaceOnUse",
            x: "0",
            y: "0",
            width: "1600",
            height: "1600",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "700",
            width: "1600",
            height: "280",
            fill: (__VLS_unwrap(url, {})('g-band')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('m-low')),
            maskUnits: "userSpaceOnUse",
            x: "0",
            y: "0",
            width: "1600",
            height: "1600",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "880",
            width: "1600",
            height: "300",
            fill: (__VLS_unwrap(url, {})('g-band')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('m-bank')),
            maskUnits: "userSpaceOnUse",
            x: "0",
            y: "0",
            width: "1600",
            height: "1600",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "520",
            width: "1600",
            height: "560",
            fill: (__VLS_unwrap(url, {})('g-band')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('m-fg')),
            maskUnits: "userSpaceOnUse",
            x: "0",
            y: "0",
            width: "1600",
            height: "1600",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "1120",
            width: "1600",
            height: "480",
            fill: (__VLS_unwrap(url, {})('g-fg')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.clipPath, __VLS_intrinsics.clipPath)({
            id: (__VLS_unwrap(id, {})('sailclip')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M604 503 L956 503 C968 590 968 700 948 792 L612 792 C594 700 594 590 604 503Z",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            id: (__VLS_unwrap(id, {})('isles-strip')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M40 842 C90 820 120 790 170 784 C210 778 240 800 270 796 C320 790 350 816 400 842Z",
            fill: "#aebcc5",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M130 842 C160 822 190 808 220 812 C250 816 270 830 300 842Z",
            fill: "#a3b2bc",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "196",
            y: "816",
            width: "26",
            height: "14",
            fill: "#9aa9b3",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M192 818 L209 806 L226 818Z",
            fill: "#9aa9b3",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: "light" },
            cx: "204",
            cy: "824",
            r: "3.2",
            fill: "#f0c07a",
        });
        /** @type {__VLS_StyleScopedClasses['light']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: "light l2" },
            cx: "246",
            cy: "828",
            r: "2.6",
            fill: "#f0c07a",
        });
        /** @type {__VLS_StyleScopedClasses['light']} */ ;
        /** @type {__VLS_StyleScopedClasses['l2']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            transform: "translate(209 806)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            ...{ class: "puff" },
            cx: "0",
            cy: "0",
            rx: "16",
            ry: "12",
            fill: "#b0bdc5",
        });
        /** @type {__VLS_StyleScopedClasses['puff']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            ...{ class: "puff" },
            ...{ style: {} },
            cx: "0",
            cy: "0",
            rx: "16",
            ry: "12",
            fill: "#b9c5cd",
        });
        /** @type {__VLS_StyleScopedClasses['puff']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            ...{ class: "puff" },
            ...{ style: {} },
            cx: "0",
            cy: "0",
            rx: "16",
            ry: "12",
            fill: "#b0bdc5",
        });
        /** @type {__VLS_StyleScopedClasses['puff']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M560 842 C600 826 630 800 660 798 C700 796 720 822 770 842Z",
            fill: "#b3c0c8",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: "light l3" },
            cx: "664",
            cy: "826",
            r: "3",
            fill: "#f0c07a",
        });
        /** @type {__VLS_StyleScopedClasses['light']} */ ;
        /** @type {__VLS_StyleScopedClasses['l3']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            transform: "translate(668 812)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            ...{ class: "puff" },
            ...{ style: {} },
            cx: "0",
            cy: "0",
            rx: "18",
            ry: "13",
            fill: "#bcc8cf",
        });
        /** @type {__VLS_StyleScopedClasses['puff']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            ...{ class: "puff" },
            ...{ style: {} },
            cx: "0",
            cy: "0",
            rx: "18",
            ry: "13",
            fill: "#c5cfd5",
        });
        /** @type {__VLS_StyleScopedClasses['puff']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            ...{ class: "puff" },
            ...{ style: {} },
            cx: "0",
            cy: "0",
            rx: "18",
            ry: "13",
            fill: "#bcc8cf",
        });
        /** @type {__VLS_StyleScopedClasses['puff']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M900 842 C940 812 980 770 1040 762 C1090 756 1110 790 1150 792 C1200 794 1230 818 1270 842Z",
            fill: "#aab8c2",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1010 842 C1040 820 1070 806 1100 810 C1130 814 1150 830 1170 842Z",
            fill: "#9fafb9",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: "light" },
            cx: "1060",
            cy: "826",
            r: "3.2",
            fill: "#f0c07a",
        });
        /** @type {__VLS_StyleScopedClasses['light']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: "light l2" },
            cx: "1092",
            cy: "830",
            r: "2.6",
            fill: "#f0c07a",
        });
        /** @type {__VLS_StyleScopedClasses['light']} */ ;
        /** @type {__VLS_StyleScopedClasses['l2']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: "light l3" },
            cx: "1120",
            cy: "828",
            r: "2.8",
            fill: "#f0c07a",
        });
        /** @type {__VLS_StyleScopedClasses['light']} */ ;
        /** @type {__VLS_StyleScopedClasses['l3']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            transform: "translate(1100 806)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            ...{ class: "puff" },
            ...{ style: {} },
            cx: "0",
            cy: "0",
            rx: "17",
            ry: "12",
            fill: "#b0bdc5",
        });
        /** @type {__VLS_StyleScopedClasses['puff']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            ...{ class: "puff" },
            ...{ style: {} },
            cx: "0",
            cy: "0",
            rx: "17",
            ry: "12",
            fill: "#b9c5cd",
        });
        /** @type {__VLS_StyleScopedClasses['puff']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            ...{ class: "puff" },
            ...{ style: {} },
            cx: "0",
            cy: "0",
            rx: "17",
            ry: "12",
            fill: "#b0bdc5",
        });
        /** @type {__VLS_StyleScopedClasses['puff']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "farsail" },
        });
        /** @type {__VLS_StyleScopedClasses['farsail']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1296 846 L1352 846 L1344 856 L1304 856Z",
            fill: "#9aa9b3",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "1323",
            y: "808",
            width: "2",
            height: "38",
            fill: "#9aa9b3",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1308 812 L1340 812 L1338 840 L1310 840Z",
            fill: "#a6b4bd",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1420 842 C1450 830 1470 818 1490 820 C1510 822 1530 834 1560 842Z",
            fill: "#b5c2ca",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            cx: "1490",
            cy: "818",
            r: "11",
            fill: "#f0c07a",
            opacity: ".22",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: "light l3" },
            cx: "1490",
            cy: "818",
            r: "3.6",
            fill: "#f0c07a",
        });
        /** @type {__VLS_StyleScopedClasses['light']} */ ;
        /** @type {__VLS_StyleScopedClasses['l3']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            width: "1600",
            height: "1600",
            fill: (__VLS_unwrap(url, {})('sky')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            mask: (__VLS_unwrap(url, {})('m-sky')),
            opacity: ".6",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "drift fog-sky" },
        });
        /** @type {__VLS_StyleScopedClasses['drift']} */ ;
        /** @type {__VLS_StyleScopedClasses['fog-sky']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "0",
            width: "2624",
            height: "900",
            fill: (__VLS_unwrap(url, {})('fog1024')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "drift isles" },
        });
        /** @type {__VLS_StyleScopedClasses['drift']} */ ;
        /** @type {__VLS_StyleScopedClasses['isles']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.use)({
            href: (`#${__VLS_unwrap(id, {})('isles-strip')}`),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.use)({
            href: (`#${__VLS_unwrap(id, {})('isles-strip')}`),
            x: "1600",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "lf-hz" },
        });
        /** @type {__VLS_StyleScopedClasses['lf-hz']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            mask: (__VLS_unwrap(url, {})('m-hz')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "fog-hz-op" },
        });
        /** @type {__VLS_StyleScopedClasses['fog-hz-op']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "drift fog-hz" },
        });
        /** @type {__VLS_StyleScopedClasses['drift']} */ ;
        /** @type {__VLS_StyleScopedClasses['fog-hz']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "700",
            width: "2368",
            height: "280",
            fill: (__VLS_unwrap(url, {})('fog768')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "drift sea-mid" },
        });
        /** @type {__VLS_StyleScopedClasses['drift']} */ ;
        /** @type {__VLS_StyleScopedClasses['sea-mid']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: (SEA.value.mid),
            fill: "#a7b6c0",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: (SEA.value.midDash),
            stroke: "#bfcbd2",
            'stroke-width': "3",
            'stroke-linecap': "round",
            opacity: ".8",
            fill: "none",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "coast-frame" },
        });
        /** @type {__VLS_StyleScopedClasses['coast-frame']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "lf-coast" },
        });
        /** @type {__VLS_StyleScopedClasses['lf-coast']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M960 990 C1010 940 1060 880 1130 832 C1200 784 1260 728 1330 696 C1400 664 1500 652 1600 660 L1800 676 L1800 990Z",
            fill: "#8a9a8e",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            fill: "#66776b",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1132 840 L1150 788 L1168 840Z",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1178 812 L1198 752 L1218 812Z",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1226 780 L1244 728 L1262 780Z",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1300 742 L1322 676 L1344 742Z",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1350 720 L1368 668 L1386 720Z",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1452 700 L1474 636 L1496 700Z",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1510 696 L1528 646 L1546 696Z",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1060 990 C1120 930 1210 890 1320 872 C1420 856 1520 856 1800 866 L1800 990Z",
            fill: "#788a7c",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M880 994 C960 962 1060 950 1180 946 C1320 942 1500 948 1800 954 L1800 1000 L880 1000Z",
            fill: "#cfc8b4",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M900 994 C980 974 1080 966 1200 964 C1340 962 1520 966 1800 970 L1800 1000 L900 1000Z",
            fill: "#b7b2a1",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "ship-frame" },
        });
        /** @type {__VLS_StyleScopedClasses['ship-frame']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "lf-ship" },
        });
        /** @type {__VLS_StyleScopedClasses['lf-ship']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "heave" },
        });
        /** @type {__VLS_StyleScopedClasses['heave']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "pitch" },
        });
        /** @type {__VLS_StyleScopedClasses['pitch']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M486 838 L452 1004",
            stroke: "#1b252c",
            'stroke-width': "7",
            'stroke-linecap': "round",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            cx: "455",
            cy: "990",
            rx: "9",
            ry: "24",
            fill: "#1b252c",
            transform: "rotate(12 455 990)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M780 474 L1176 790 M780 474 L436 800",
            stroke: "#2f3d47",
            'stroke-width': "2.2",
            fill: "none",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "776",
            y: "470",
            width: "8",
            height: "420",
            fill: "#1e2a32",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sail" },
        });
        /** @type {__VLS_StyleScopedClasses['sail']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M604 503 L956 503 C968 590 968 700 948 792 L612 792 C594 700 594 590 604 503Z",
            fill: "#3b4a55",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            'clip-path': (__VLS_unwrap(url, {})('sailclip')),
            fill: "#52636f",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "652",
            y: "500",
            width: "54",
            height: "300",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "753",
            y: "500",
            width: "54",
            height: "300",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "854",
            y: "500",
            width: "54",
            height: "300",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "588",
            y: "495",
            width: "384",
            height: "8",
            rx: "3",
            fill: "#1e2a32",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M452 882 L456 814 C460 805 482 805 488 814 L492 882Z",
            fill: "#222f38",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            cx: "471",
            cy: "794",
            r: "13",
            fill: "#222f38",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "cloak" },
        });
        /** @type {__VLS_StyleScopedClasses['cloak']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1124 842 C1114 846 1104 854 1096 864 L1109 862 L1104 872 L1121 864Z",
            fill: "#2a3842",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1119 876 L1121 844 C1123 838 1135 838 1137 844 L1140 876Z",
            fill: "#222f38",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            cx: "1130",
            cy: "830",
            r: "8.5",
            fill: "#222f38",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1122 826 C1124 818 1135 817 1139 825 L1135 823 L1132 827 L1128 822Z",
            fill: "#222f38",
        });
        const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(OARS, {})));
        for (const [o] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                key: (o.x),
                ...{ class: "rower" },
            });
            /** @type {__VLS_StyleScopedClasses['rower']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: (o.body),
                fill: "#1e2a33",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                cx: (o.x),
                cy: "836",
                r: "12",
                fill: "#1e2a33",
            });
            // @ts-ignore
            [landfall, landfall, paused, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, id, url, url, url, url, url, url, url, url, url, url, url, SEA, SEA, OARS,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M426 800 C440 852 470 880 520 888 L1080 888 C1130 880 1160 852 1170 800 L1198 800 C1198 882 1162 966 1060 992 L540 992 C438 966 396 882 396 800Z",
            fill: "#222f38",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M440 860 C470 885 500 896 540 901 L1060 901 C1100 896 1140 882 1168 852 M452 884 C484 904 512 916 552 922 L1050 922 C1092 916 1128 902 1156 882",
            stroke: "#34444f",
            'stroke-width': "3",
            fill: "none",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M396 806 C390 752 394 706 420 686 C442 670 470 678 470 700 C470 718 452 726 442 716 C452 712 456 702 448 694 C436 686 422 696 420 716 C418 744 422 776 426 806Z",
            fill: "#222f38",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M1170 806 C1176 760 1182 720 1196 696 C1208 680 1232 676 1246 686 L1236 692 L1250 700 L1232 704 C1218 706 1208 716 1204 734 C1200 756 1198 780 1198 806Z",
            fill: "#222f38",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            cx: "1224",
            cy: "689",
            r: "2.2",
            fill: "#6b7c88",
        });
        const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(SHIELDS, {})));
        for (const [s] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                key: (s.x),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                cx: (s.x),
                cy: "890",
                r: "21",
                fill: (s.fill),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                cx: (s.x),
                cy: "890",
                r: "5",
                fill: "#1c262d",
            });
            // @ts-ignore
            [SHIELDS,];
        }
        const __VLS_2 = __VLS_tryAsConstant((__VLS_unwrap(OARS, {})));
        for (const [o] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                key: (o.x),
                transform: (`translate(${o.x} 910)`),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "oar" },
            });
            /** @type {__VLS_StyleScopedClasses['oar']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "-2.5",
                y: "0",
                width: "5",
                height: "170",
                rx: "2",
                fill: "#182229",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
                cx: "0",
                cy: "156",
                rx: "7",
                ry: "20",
                fill: "#182229",
            });
            // @ts-ignore
            [OARS,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "drift sea-near" },
        });
        /** @type {__VLS_StyleScopedClasses['drift']} */ ;
        /** @type {__VLS_StyleScopedClasses['sea-near']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: (SEA.value.near1),
            fill: "#7f929f",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: (SEA.value.near1Dash),
            stroke: "#dfe7ec",
            'stroke-width': "3",
            'stroke-linecap': "round",
            opacity: ".55",
            fill: "none",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: (SEA.value.near2),
            fill: "#748896",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "ship-frame" },
        });
        /** @type {__VLS_StyleScopedClasses['ship-frame']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "lf-ship" },
        });
        /** @type {__VLS_StyleScopedClasses['lf-ship']} */ ;
        const __VLS_3 = __VLS_tryAsConstant((__VLS_unwrap(OARS, {})));
        for (const [o] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                key: (o.x),
                transform: (`translate(${o.x + 40} 986)`),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
                ...{ class: "splash" },
                cx: "0",
                cy: "0",
                rx: "16",
                ry: "5",
                fill: "#eef3f6",
            });
            /** @type {__VLS_StyleScopedClasses['splash']} */ ;
            // @ts-ignore
            [SEA, SEA, SEA, OARS,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            mask: (__VLS_unwrap(url, {})('m-low')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "fog-low-op" },
        });
        /** @type {__VLS_StyleScopedClasses['fog-low-op']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "drift fog-low" },
        });
        /** @type {__VLS_StyleScopedClasses['drift']} */ ;
        /** @type {__VLS_StyleScopedClasses['fog-low']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "880",
            width: "2624",
            height: "300",
            fill: (__VLS_unwrap(url, {})('fog1024f')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "drift sea-fg1" },
        });
        /** @type {__VLS_StyleScopedClasses['drift']} */ ;
        /** @type {__VLS_StyleScopedClasses['sea-fg1']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: (SEA.value.fg1),
            fill: "#5a6d7a",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "drift sea-fg2" },
        });
        /** @type {__VLS_StyleScopedClasses['drift']} */ ;
        /** @type {__VLS_StyleScopedClasses['sea-fg2']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: (SEA.value.fg2),
            fill: "#445663",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            mask: (__VLS_unwrap(url, {})('m-fg')),
            opacity: ".75",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "drift fog-fg" },
        });
        /** @type {__VLS_StyleScopedClasses['drift']} */ ;
        /** @type {__VLS_StyleScopedClasses['fog-fg']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "1120",
            width: "2624",
            height: "480",
            fill: (__VLS_unwrap(url, {})('fog1024r')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "ravens" },
        });
        /** @type {__VLS_StyleScopedClasses['ravens']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "ravens-y" },
        });
        /** @type {__VLS_StyleScopedClasses['ravens-y']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            transform: "translate(0 470)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "bob-a" },
        });
        /** @type {__VLS_StyleScopedClasses['bob-a']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "r-pitch" },
        });
        /** @type {__VLS_StyleScopedClasses['r-pitch']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "r-wander" },
        });
        /** @type {__VLS_StyleScopedClasses['r-wander']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            transform: "scale(.6)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            transform: "translate(-6 -6) scale(.86)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            ...{ class: "wing far" },
            fill: "#2a3640",
            d: "M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z",
        });
        /** @type {__VLS_StyleScopedClasses['wing']} */ ;
        /** @type {__VLS_StyleScopedClasses['far']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            fill: "#1a242b",
            d: "M-66,-8 L-32,-5 C-12,-12 18,-12 33,-7 C40,-13 51,-13 57,-7 L74,-3 L57,1 C49,6 39,6 31,5 C10,11 -20,9 -34,4 L-66,10 L-56,1 Z",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            transform: "translate(2 -6)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            ...{ class: "wing" },
            fill: "#1a242b",
            d: "M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z",
        });
        /** @type {__VLS_StyleScopedClasses['wing']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            transform: "translate(-130 525)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sway-b" },
        });
        /** @type {__VLS_StyleScopedClasses['sway-b']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "bob-b" },
        });
        /** @type {__VLS_StyleScopedClasses['bob-b']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "r-pitch" },
        });
        /** @type {__VLS_StyleScopedClasses['r-pitch']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "r-wander" },
        });
        /** @type {__VLS_StyleScopedClasses['r-wander']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "rb" },
            transform: "scale(.52)",
        });
        /** @type {__VLS_StyleScopedClasses['rb']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            transform: "translate(-6 -6) scale(.86)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            ...{ class: "wing far" },
            fill: "#2a3640",
            d: "M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z",
        });
        /** @type {__VLS_StyleScopedClasses['wing']} */ ;
        /** @type {__VLS_StyleScopedClasses['far']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            fill: "#1a242b",
            d: "M-66,-8 L-32,-5 C-12,-12 18,-12 33,-7 C40,-13 51,-13 57,-7 L74,-3 L57,1 C49,6 39,6 31,5 C10,11 -20,9 -34,4 L-66,10 L-56,1 Z",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            transform: "translate(2 -6)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            ...{ class: "wing" },
            fill: "#1a242b",
            d: "M-14,0 C-10,-30 0,-62 22,-86 L19,-71 L32,-80 L25,-62 L38,-66 L27,-48 C31,-30 27,-14 18,0 Z",
        });
        /** @type {__VLS_StyleScopedClasses['wing']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "lf-hz" },
        });
        /** @type {__VLS_StyleScopedClasses['lf-hz']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            mask: (__VLS_unwrap(url, {})('m-bank')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "fog-bank-op" },
        });
        /** @type {__VLS_StyleScopedClasses['fog-bank-op']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "drift fog-bank" },
        });
        /** @type {__VLS_StyleScopedClasses['drift']} */ ;
        /** @type {__VLS_StyleScopedClasses['fog-bank']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "520",
            width: "3648",
            height: "560",
            fill: (__VLS_unwrap(url, {})('fog1024')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "lf-mist" },
        });
        /** @type {__VLS_StyleScopedClasses['lf-mist']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "drift fog-fg" },
        });
        /** @type {__VLS_StyleScopedClasses['drift']} */ ;
        /** @type {__VLS_StyleScopedClasses['fog-fg']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "0",
            width: "2624",
            height: "1600",
            fill: (__VLS_unwrap(url, {})('fog1024')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            width: "1600",
            height: "1600",
            fill: (__VLS_unwrap(FOG_UNEXPLORED_CSS, {})),
            opacity: ".55",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            ...{ class: "lf-curtain" },
            id: (__VLS_unwrap(id, {})('curtain')),
            width: "1600",
            height: "1600",
            fill: (__VLS_unwrap(FOG_UNEXPLORED_CSS, {})),
        });
        /** @type {__VLS_StyleScopedClasses['lf-curtain']} */ ;
        // @ts-ignore
        [id, url, url, url, url, url, url, url, SEA, SEA, FOG_UNEXPLORED_CSS, FOG_UNEXPLORED_CSS,];
        return {};
    };
    void [__VLS_template];
    return (await import('vue')).defineComponent({
        __typeProps: {},
    });
})();
