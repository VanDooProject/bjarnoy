/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { useId } from 'vue';
import IntroLongship from './IntroLongship.vue';
import SendingFire from './SendingFire.vue';
import { sineLoop } from './sineLoop';
// The ship's run (sd-ship-depart, on --ship-ms, linear between its keyframes) leaves at 62.86 %, speeds up to 80 % and
// goes on straight to its end (its keyframes are copied here); the camera (sd-cam-mid) holds still at its end frame from 100 % of the beat. So where
// the ship is around the end of the beat follows from how long its run has played; the ravens scene starts its ship
// there and follows this path through the crossfade, so the cut has one ship (checked against the keyframes in
// SendingScene.test.ts).
export const SHIP_MS = 14000;
/** [fraction of the run, translate x, translate y] from the ship's departure on: sd-ship-depart's keyframes */
export const SHIP_TRACK = [
    [0.6286, 0, 0],
    [0.6357, 0.56, -0.04],
    [0.6439, 1.9, -0.13],
    [0.6525, 3.85, -0.26],
    [0.6618, 6.51, -0.43],
    [0.6714, 9.79, -0.65],
    [0.6911, 17.91, -1.19],
    [0.7118, 28.32, -1.89],
    [0.7332, 40.85, -2.72],
    [0.755, 55.29, -3.69],
    [0.7771, 71.58, -4.77],
    [0.8, 90, -6],
    [1.0, 249.6, -16.64],
];
/** After its run the ship keeps its last speed (sd-ship-on, from the run's end): this far over this long. */
export const SHIP_ON = { ms: 4000, x: 228, y: -15.2 };
export const SHIP_PLACE = { x: 772, y: 499, scale: 0.36 };
export const CAM_MID_END = { x: -32, y: -36, scale: 1.04 };
/** The element whose animation is the ship's run, for a scene that picks the ship up while the sending fades out. */
export const SENDING_SHIP_TRACK = '[data-sending-ship-track]';
/**
 * The ship's transform in viewBox units (translate x, y and scale of its local drawing) once its run has played
 * `shipMs`, with the camera at its end frame: at the sending's end that is the beat's length.
 */
export function sendingShipAt(shipMs) {
    const t = Math.min(1, Math.max(SHIP_TRACK[0][0], shipMs / SHIP_MS));
    let i = 0;
    while (i < SHIP_TRACK.length - 2 && t > SHIP_TRACK[i + 1][0])
        i++;
    const [t0, x0, y0] = SHIP_TRACK[i];
    const [t1, x1, y1] = SHIP_TRACK[i + 1];
    const f = (t - t0) / (t1 - t0);
    const on = Math.min(SHIP_ON.ms, Math.max(0, shipMs - SHIP_MS)) / SHIP_ON.ms;
    return {
        x: CAM_MID_END.x + CAM_MID_END.scale * (SHIP_PLACE.x + x0 + (x1 - x0) * f + SHIP_ON.x * on),
        y: CAM_MID_END.y + CAM_MID_END.scale * (SHIP_PLACE.y + y0 + (y1 - y0) * f + SHIP_ON.y * on),
        scale: CAM_MID_END.scale * SHIP_PLACE.scale,
    };
}
export default {};
const { defineProps, } = {};
const __VLS_export = await (async () => {
    const __VLS_props = defineProps();
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '-');
    const id = (name) => `${uid}-${name}`;
    const url = (name) => `url(#${id(name)})`;
    // smoke columns over the burning homeland: [x, y, strength]
    const SMOKE_COLS = [[330, 606, 1], [520, 598, 0.85]];
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
    const FIRES = [[330, 612, 1.25], [520, 602, 1.1], [472, 692, 0.75]];
    const fix = (n) => Math.round(n * 100) / 100;
    // soft puffs along a column, wider and swaying more the higher they are
    const PUFFS = SMOKE_COLS.map(([bx, by], c) => Array.from({ length: 6 }, (_, i) => {
        const t = i / 5;
        return {
            cx: fix(bx - t * t * 70),
            cy: fix(by - 40 - t * (by - 40)),
            rx: fix(58 + t * 200),
            ry: fix(90 + t * 100),
            style: { ...sineLoop(0.9 - i * 0.07, i * 0.55 + c), '--a': `${4 + i * 11}px` },
        };
    }));
    const GLINTS = [
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
        __VLS_withDotValue(PUFFS, {});
        __VLS_withDotValue(FIRES, {});
        void {};
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-boy']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-pan-far']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-pan-shore']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-pan-fig']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-pan-near']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-j-thigh']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-j-shin']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-j-bthigh']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-j-bshin']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-j-cloak']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-j-torso']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-j-head']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-j-arm']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-j-fore']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-j-farm']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-j-ffore']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-boy-bob']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-boy-l']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-boy-r']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-legf']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-legb']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-boy-arm']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-look']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-ship-depart']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
            ...{ class: "intro-beat b3" },
            ...{ class: ({ 'is-paused': __VLS_ctx.paused }) },
            viewBox: "0 0 1600 1600",
            preserveAspectRatio: "xMidYMid slice",
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['intro-beat']} */ ;
        /** @type {__VLS_StyleScopedClasses['b3']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-paused']} */ ;
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
            'stop-color': "#1c232d",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: ".42",
            'stop-color': "#3a414c",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: ".5",
            'stop-color': "#6e6668",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
            id: (__VLS_unwrap(id, {})('puff')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "0",
            'stop-color': "#fff",
            'stop-opacity': ".95",
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
        __VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
            id: (__VLS_unwrap(id, {})('fireglow')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "0",
            'stop-color': "#ff8a3d",
            'stop-opacity': ".7",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: ".4",
            'stop-color': "#c8562a",
            'stop-opacity': ".3",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "1",
            'stop-color': "#7a3a2a",
            'stop-opacity': "0",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
            id: (__VLS_unwrap(id, {})('ember')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "0",
            'stop-color': "#d08a5c",
            'stop-opacity': ".75",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: ".45",
            'stop-color': "#9a5a42",
            'stop-opacity': ".35",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "1",
            'stop-color': "#5e3a33",
            'stop-opacity': "0",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.radialGradient, __VLS_intrinsics.radialGradient)({
            id: (__VLS_unwrap(id, {})('vig')),
            cx: ".5",
            cy: ".5",
            r: ".7",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: ".55",
            'stop-color': "#05070a",
            'stop-opacity': "0",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "1",
            'stop-color': "#05070a",
            'stop-opacity': ".6",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.linearGradient, __VLS_intrinsics.linearGradient)({
            id: (__VLS_unwrap(id, {})('band')),
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
            id: (__VLS_unwrap(id, {})('ramp')),
            x1: "0",
            y1: "0",
            x2: "1",
            y2: "0",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: ".45",
            'stop-color': "#fff",
            'stop-opacity': "0",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: ".62",
            'stop-color': "#fff",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
            offset: "1",
            'stop-color': "#fff",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.pattern)({
            id: (__VLS_unwrap(id, {})('smk')),
            href: "#intro-fog",
            patternTransform: "scale(2)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.pattern)({
            id: (__VLS_unwrap(id, {})('wsp')),
            href: "#intro-fog",
            patternTransform: "translate(170 90) scale(2)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.pattern)({
            id: (__VLS_unwrap(id, {})('fog')),
            href: "#intro-fog",
            patternTransform: "scale(4)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.pattern)({
            id: (__VLS_unwrap(id, {})('fog2')),
            href: "#intro-fog",
            patternTransform: "rotate(180) scale(3)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('cols')),
            maskUnits: "userSpaceOnUse",
            ...(__VLS_unwrap(PUFF_REGION, {})),
        });
        const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(SMOKE_COLS, {})));
        for (const [[, , o], c] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                key: (c),
                opacity: (o),
            });
            const __VLS_1 = __VLS_tryAsConstant((PUFFS.value[c]));
            for (const [p, i] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                    key: (i),
                    ...{ class: "sd-sway" },
                    ...{ style: (p.style) },
                });
                /** @type {__VLS_StyleScopedClasses['sd-sway']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
                    cx: (p.cx),
                    cy: (p.cy),
                    rx: (p.rx),
                    ry: (p.ry),
                    fill: (__VLS_unwrap(url, {})('puff')),
                });
                // @ts-ignore
                [paused, id, id, id, id, id, id, id, id, id, id, id, id, PUFF_REGION, SMOKE_COLS, PUFFS, url,];
            }
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('smkA')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            ...(__VLS_unwrap(SMOKE_BOX, {})),
            fill: (__VLS_unwrap(url, {})('smk')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('smkB')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            ...(__VLS_unwrap(SMOKE_BOX, {})),
            fill: (__VLS_unwrap(url, {})('wsp')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('hz')),
            maskUnits: "userSpaceOnUse",
            x: "-40",
            y: "660",
            width: "1680",
            height: "260",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "-40",
            y: "660",
            width: "1680",
            height: "260",
            fill: (__VLS_unwrap(url, {})('band')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('shore')),
            maskUnits: "userSpaceOnUse",
            x: "0",
            y: "860",
            width: "1600",
            height: "220",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "860",
            width: "1600",
            height: "220",
            fill: (__VLS_unwrap(url, {})('band')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('right')),
            maskUnits: "userSpaceOnUse",
            x: "0",
            y: "860",
            width: "1600",
            height: "220",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "860",
            width: "1600",
            height: "220",
            fill: (__VLS_unwrap(url, {})('ramp')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('hzTex')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "-40",
            y: "640",
            width: "2700",
            height: "300",
            fill: (__VLS_unwrap(url, {})('fog')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.mask, __VLS_intrinsics.mask)({
            id: (__VLS_unwrap(id, {})('shoreTex')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "-808",
            y: "840",
            width: "2448",
            height: "260",
            fill: (__VLS_unwrap(url, {})('fog2')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            width: "1600",
            height: "1600",
            fill: (__VLS_unwrap(url, {})('sky')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-a sd-glow-set" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-glow-set']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            cx: "1110",
            cy: "790",
            rx: "820",
            ry: "190",
            fill: "#5e5459",
            opacity: ".5",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            cx: "1110",
            cy: "790",
            rx: "600",
            ry: "120",
            fill: "#80635d",
            opacity: ".5",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            cx: "1110",
            cy: "790",
            rx: "380",
            ry: "66",
            fill: "#a8775f",
            opacity: ".55",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            cx: "1110",
            cy: "790",
            rx: "190",
            ry: "30",
            fill: "#d39d78",
            opacity: ".6",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-a sd-cam-far" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-cam-far']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-a sd-pan-far" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-pan-far']} */ ;
        const __VLS_2 = __VLS_tryAsConstant((__VLS_unwrap(SMOKE_COLS, {})));
        for (const [[bx, by], c] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
                key: (c),
                ...{ class: "sd-ember" },
                ...{ style: ({ '--i': c }) },
                cx: (bx),
                cy: (by - 70),
                rx: "140",
                ry: "120",
                fill: (__VLS_unwrap(url, {})('ember')),
            });
            /** @type {__VLS_StyleScopedClasses['sd-ember']} */ ;
            // @ts-ignore
            [id, id, id, id, id, id, id, SMOKE_COLS, url, url, url, url, url, url, url, url, url, SMOKE_BOX, SMOKE_BOX,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            mask: (__VLS_unwrap(url, {})('cols')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-rise sd-rise-a" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-rise']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-rise-a']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            ...(__VLS_unwrap(SMOKE_BOX, {})),
            fill: "#5c6068",
            opacity: ".72",
            mask: (__VLS_unwrap(url, {})('smkA')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-rise sd-rise-b" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-rise']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-rise-b']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            ...(__VLS_unwrap(SMOKE_BOX, {})),
            fill: "#74767c",
            opacity: ".3",
            mask: (__VLS_unwrap(url, {})('smkB')),
        });
        const __VLS_3 = __VLS_tryAsConstant((FIRES.value.slice(0, 2)));
        for (const [[x, y, sc], c] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
            const __VLS_4 = SendingFire;
            // @ts-ignore
            const __VLS_5 = __VLS_asFunctionalComponent1(__VLS_4, new __VLS_4({
                // @ts-ignore
                key: (c), x: (x), y: (y), scale: (sc), index: (c), glow: (__VLS_unwrap(url, {})('fireglow')),
            }));
            const __VLS_6 = __VLS_5({
                key: (c),
                x: (x),
                y: (y),
                scale: (sc),
                index: (c),
                glow: (__VLS_unwrap(url, {})('fireglow')),
            }, ...__VLS_functionalComponentArgsRest(__VLS_5));
            // @ts-ignore
            [url, url, url, url, SMOKE_BOX, SMOKE_BOX, FIRES,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M0 790 L0 600 L90 560 L170 610 L250 540 L330 600 L430 520 L520 590 L610 560 L700 640 L800 650 L880 720 L940 790 Z",
            fill: "#2d343e",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M0 790 L0 680 L120 650 L230 690 L360 640 L470 690 L590 670 L700 720 L820 760 L880 790 Z",
            fill: "#252b34",
        });
        const __VLS_9 = SendingFire;
        // @ts-ignore
        const __VLS_10 = __VLS_asFunctionalComponent1(__VLS_9, new __VLS_9({
            // @ts-ignore
            x: (FIRES.value[2][0]), y: (FIRES.value[2][1]), scale: (FIRES.value[2][2]), index: (2), glow: (__VLS_unwrap(url, {})('fireglow')),
        }));
        const __VLS_11 = __VLS_10({
            x: (FIRES.value[2][0]),
            y: (FIRES.value[2][1]),
            scale: (FIRES.value[2][2]),
            index: (2),
            glow: (__VLS_unwrap(url, {})('fireglow')),
        }, ...__VLS_functionalComponentArgsRest(__VLS_10));
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "786",
            width: "1600",
            height: "814",
            fill: "#1d252e",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({});
        const __VLS_14 = __VLS_tryAsConstant((__VLS_unwrap(GLINTS, {})));
        for (const [[x, y, w, h, o], i] of __VLS_vFor(__VLS_nonNull(__VLS_14))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                key: (i),
                ...{ class: "sd-glint" },
                ...{ style: (__VLS_unwrap(sineLoop, {})(0.4, i * 1.3)) },
                x: (x),
                y: (y),
                width: (w),
                height: (h),
                fill: "#8c6a5c",
                opacity: (o),
            });
            /** @type {__VLS_StyleScopedClasses['sd-glint']} */ ;
            // @ts-ignore
            [url, FIRES, FIRES, FIRES, GLINTS, sineLoop,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-hz-out" },
            mask: (__VLS_unwrap(url, {})('hz')),
            opacity: ".42",
        });
        /** @type {__VLS_StyleScopedClasses['sd-hz-out']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-fog sd-fog-hz" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-fog']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-fog-hz']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "-40",
            y: "640",
            width: "2700",
            height: "300",
            fill: "#808891",
            mask: (__VLS_unwrap(url, {})('hzTex')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-a sd-cam-mid" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-cam-mid']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-a sd-ship-depart" },
            'data-sending-ship-track': true,
        });
        /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-ship-depart']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-ship-on" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-ship-on']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-heave" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-heave']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-pitch" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-pitch']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-longship" },
            transform: "translate(772,499) scale(0.36)",
        });
        /** @type {__VLS_StyleScopedClasses['sd-longship']} */ ;
        const __VLS_15 = IntroLongship;
        // @ts-ignore
        const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
            // @ts-ignore
            bold: true, boy: true,
        }));
        const __VLS_17 = __VLS_16({
            bold: true,
            boy: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_16));
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "0",
            y: "851",
            width: "1600",
            height: "40",
            fill: "#1d252e",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "860",
            y: "852",
            width: "520",
            height: "2",
            fill: "#8c6a5c",
            opacity: ".4",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-a sd-pan-shore" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-pan-shore']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M0 872 L380 880 C640 892 860 908 1040 952 C1150 980 1260 1050 1600 1110 L1600 1600 L0 1600 Z",
            fill: "#2a2f35",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M0 884 L380 892 C640 904 860 922 1030 968 C1140 998 1250 1068 1600 1130 L1600 1600 L0 1600 Z",
            fill: "#161b21",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({});
        const __VLS_20 = __VLS_tryAsConstant((__VLS_unwrap(ASH, {})));
        for (const [a, i] of __VLS_vFor(__VLS_nonNull(__VLS_20))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                key: (i),
                ...{ class: "sd-ash" },
                ...{ style: (a.style) },
                r: (a.r),
                fill: "#8f969d",
                opacity: ".4",
            });
            /** @type {__VLS_StyleScopedClasses['sd-ash']} */ ;
            // @ts-ignore
            [url, url, ASH,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-a sd-cam-fig" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-cam-fig']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-a sd-pan-fig" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-pan-fig']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            cx: "610",
            cy: "1164",
            rx: "170",
            ry: "12",
            fill: "#05070a",
            opacity: ".5",
        });
        const __VLS_21 = __VLS_tryAsConstant((__VLS_unwrap(FIGS, {})));
        for (const [fig] of __VLS_vFor(__VLS_nonNull(__VLS_21))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                key: (fig.fill),
                transform: (fig.shift),
                fill: (fig.fill),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "495",
                y: "540",
                width: "8",
                height: "626",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M499,494 L511,546 L487,546 Z",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                transform: "translate(600,1160) scale(2.2)",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-j-cloak" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-j-cloak']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M-14,-206 Q-32,-206 -38,-182 Q-54,-110 -76,0 L16,0 Q12,-100 18,-200 Z",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-j-bthigh" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-j-bthigh']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "0",
                y: "-8",
                width: "56",
                height: "16",
                rx: "7",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                cx: "55",
                cy: "0",
                r: "8",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-j-bshin" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-j-bshin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "0",
                y: "-7",
                width: "56",
                height: "14",
                rx: "6",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "48",
                y: "-7",
                width: "10",
                height: "14",
                rx: "3",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-j-thigh" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-j-thigh']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "0",
                y: "-8",
                width: "56",
                height: "16",
                rx: "7",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                cx: "55",
                cy: "0",
                r: "8",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-j-shin" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-j-shin']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "0",
                y: "-7",
                width: "56",
                height: "14",
                rx: "6",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "48",
                y: "-22",
                width: "11",
                height: "29",
                rx: "3",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-j-torso" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-j-torso']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-j-farm" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-j-farm']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "-6",
                y: "-6.5",
                width: "46",
                height: "13",
                rx: "6.5",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                cx: "40",
                cy: "0",
                r: "6.5",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-j-ffore" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-j-ffore']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "-5",
                y: "-5.5",
                width: "42",
                height: "11",
                rx: "5.5",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                cx: "40",
                cy: "0",
                r: "8.5",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M-23,54 L25,54 Q22,20 20,0 L18,-64 Q15,-86 3,-94 Q-17,-93 -24,-76 L-22,0 Q-25,26 -23,54 Z",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M-28,-80 q4,-12 14,-14 q7,-8 16,-5 q8,-4 12,2 q3,3 2,8 q-4,5 -10,4 q-9,5 -19,2 q-9,4 -15,-1 Z",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-j-head" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-j-head']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M-12,-14 L-14,3 Q-9,7 -3,4 L-1,-8 Z",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                cx: "3",
                cy: "-16",
                r: "13",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M-12,-17 C-12,-31 -4,-41 4,-43 C12,-41 20,-31 20,-17 Z",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "-14",
                y: "-20",
                width: "34",
                height: "5",
                rx: "2",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                d: "M7,-9 Q18,-8 19,3 L16,24 Q13,34 9,25 Q4,12 -1,3 Q1,-6 7,-9 Z",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-boy" },
                ...{ class: ({ 'is-rim': fig.rim }) },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-boy']} */ ;
            /** @type {__VLS_StyleScopedClasses['is-rim']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-boy-bob" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-boy-bob']} */ ;
            const __VLS_22 = __VLS_tryAsConstant((__VLS_unwrap(SIDES, {})));
            for (const [side] of __VLS_vFor(__VLS_nonNull(__VLS_22))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                    key: (side.cls),
                    ...{ class: "sd-a" },
                    ...{ class: (side.cls) },
                    transform: (side.flip),
                });
                /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M-24,-224 C-40,-182 -50,-122 -54,-68 L-28,-74 Z",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                    ...{ class: "sd-a sd-legb" },
                });
                /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
                /** @type {__VLS_StyleScopedClasses['sd-legb']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                    x: "-23",
                    y: "-86",
                    width: "17",
                    height: "86",
                    rx: "4",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                    x: "-23",
                    y: "-8",
                    width: "24",
                    height: "8",
                    rx: "3",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                    ...{ class: "sd-a sd-legf" },
                });
                /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
                /** @type {__VLS_StyleScopedClasses['sd-legf']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                    x: "6",
                    y: "-86",
                    width: "17",
                    height: "86",
                    rx: "4",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                    x: "6",
                    y: "-8",
                    width: "24",
                    height: "8",
                    rx: "3",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M-31,-219 Q0,-240 33,-219 L46,-78 L-44,-78 Z",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                    transform: "translate(0,-232)",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                    ...{ class: "sd-a sd-look" },
                });
                /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
                /** @type {__VLS_StyleScopedClasses['sd-look']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                    transform: "translate(0,232)",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                    cx: "0",
                    cy: "-260",
                    r: "25",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M22,-264 L32,-254 L22,-250 Z",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M-23,-270 C-23,-295 17,-299 27,-274 C12,-283 -8,-281 -23,-270 Z",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                    ...{ class: "sd-a sd-boy-arm" },
                });
                /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
                /** @type {__VLS_StyleScopedClasses['sd-boy-arm']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
                    d: "M-8,-8 L64,-6 L64,6 L-8,8 Z",
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
                    cx: "70",
                    cy: "0",
                    rx: "9.5",
                    ry: "7.5",
                });
                // @ts-ignore
                [FIGS, SIDES,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                transform: "translate(600,1160) scale(2.2)",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-j-torso" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-j-torso']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-j-arm" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-j-arm']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "-5",
                y: "-6",
                width: "51",
                height: "12",
                rx: "6",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                cx: "46",
                cy: "0",
                r: "6.5",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
                ...{ class: "sd-a sd-j-fore" },
            });
            /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
            /** @type {__VLS_StyleScopedClasses['sd-j-fore']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
                x: "-5",
                y: "-6",
                width: "46",
                height: "12",
                rx: "6",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
                cx: "43",
                cy: "0",
                r: "7",
            });
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            mask: (__VLS_unwrap(url, {})('right')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            mask: (__VLS_unwrap(url, {})('shore')),
            opacity: ".26",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-fog sd-fog-shore" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-fog']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-fog-shore']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            x: "-808",
            y: "840",
            width: "2448",
            height: "260",
            fill: "#808891",
            mask: (__VLS_unwrap(url, {})('shoreTex')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-a sd-cam-near" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-cam-near']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-a sd-pan-near" },
        });
        /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-pan-near']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M-40 1600 L-40 1330 C40 1290 120 1300 190 1340 C260 1320 330 1350 380 1420 C420 1460 460 1520 470 1600 Z",
            fill: "#090b0e",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M120 1310 L132 1250 L142 1312 M170 1330 L190 1262 L196 1336 M230 1330 L236 1280 L250 1334",
            stroke: "#090b0e",
            'stroke-width': "5",
            fill: "none",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            width: "1600",
            height: "1600",
            fill: (__VLS_unwrap(url, {})('vig')),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            ...{ class: "sd-a sd-dark" },
            width: "1600",
            height: "1600",
            fill: "#06080b",
        });
        /** @type {__VLS_StyleScopedClasses['sd-a']} */ ;
        /** @type {__VLS_StyleScopedClasses['sd-dark']} */ ;
        // @ts-ignore
        [url, url, url, url,];
        return {};
    };
    void [__VLS_template];
    return (await import('vue')).defineComponent({
        __typeProps: {},
    });
})();
