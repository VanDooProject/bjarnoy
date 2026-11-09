/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, inject, onMounted, ref, useId, useTemplateRef } from 'vue';
import IntroLongship from './IntroLongship.vue';
import { SENDING_SHIP_TRACK, sendingShipAt } from './SendingScene.vue';
import { meta as sendingMeta } from './SendingBeat.vue';
import { meta as ravensMeta } from './RavensBeat.vue';
import { INTRO_BEAT_MS } from './types';
const { defineProps, } = {};
const __VLS_props = defineProps();
// The ship starts exactly where the sending's ship is and follows its path through the crossfade (to 20 % of this
// beat), so the cut shows one ship. Where that is follows from how long the sending ran (its voice clip), but its
// animations can start a little behind the beat's clock (the time its first frame takes), so once this scene's ship
// has started, while the sending is still crossfading out, the path is taken from the sending ship's run as it
// actually stands, less the time this scene's own ship has already run.
const beatMs = inject(INTRO_BEAT_MS, (id) => (id === 'sending' ? sendingMeta.durationMs : ravensMeta.durationMs));
const handoverMs = 0.2 * beatMs('ravens');
const shipFrom = ref(beatMs('sending'));
const rootStyle = computed(() => {
    const a = sendingShipAt(shipFrom.value);
    const b = sendingShipAt(shipFrom.value + handoverMs);
    return { '--ship-x0': `${a.x}px`, '--ship-y0': `${a.y}px`, '--ship-x1': `${b.x}px`, '--ship-y1': `${b.y}px` };
});
const root = useTemplateRef('root');
const runOf = (el) => (el && typeof el.getAnimations === 'function' ? el.getAnimations()[0] : undefined);
onMounted(() => {
    const own = runOf(root.value?.querySelector('.b4-ship'));
    // a new animation has no time until it has started; `ready` rejects (AbortError) when the scene goes before that
    own?.ready
        ?.then(() => {
        const track = runOf(document.querySelector(SENDING_SHIP_TRACK));
        if (track?.currentTime == null || own.currentTime == null)
            return;
        shipFrom.value = Number(track.currentTime) - Number(own.currentTime);
    })
        .catch(() => { });
});
const uid = useId().replace(/[^a-zA-Z0-9]/g, '-');
const id = (name) => `${uid}-${name}`;
const url = (name) => `url(#${id(name)})`;
// night (palette A) to dawn: each layer's colour at the start and at the end of the lift
const dawn = (c0, c1) => ({ '--c0': c0, '--c1': c1 });
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
    __VLS_withDotValue(C, {});
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
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-l-surf']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-l-deep']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-l-front']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['s-steer']} */ ;
    /** @type {__VLS_StyleScopedClasses['s-rig']} */ ;
    /** @type {__VLS_StyleScopedClasses['s-strake']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['s-steer']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['s-rig']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['s-strake']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4']} */ ;
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "root",
        ...{ class: "ravens" },
        ...{ style: (__VLS_unwrap(rootStyle, {})) },
    });
    /** @type {__VLS_StyleScopedClasses['ravens']} */ ;
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
        'stop-color': "#d6dee3",
        'stop-opacity': ".22",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.stop)({
        offset: "1",
        'stop-color': "#d6dee3",
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
        x: "-1000",
        y: "581",
        width: "3300",
        height: "300",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "-1000",
        y: "581",
        width: "3300",
        height: "300",
        fill: (__VLS_unwrap(url, {})('fogFade')),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.pattern)({
        id: (__VLS_unwrap(id, {})('fog')),
        href: "#intro-fog",
        patternTransform: "scale(2)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        x: "-300",
        y: "-300",
        width: "2200",
        height: "2200",
        fill: "#dfe5e8",
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
        ...{ class: "b4-dawn b4-a" },
        ...{ style: (C.value.sky0) },
        x: "-200",
        y: "-200",
        width: "2000",
        height: "560",
    });
    /** @type {__VLS_StyleScopedClasses['b4-dawn']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-dawn b4-a" },
        ...{ style: (C.value.sky1) },
        d: "M-200,330 C200,300 500,350 800,320 C1100,290 1400,340 1800,310 L1800,560 L-200,560 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-dawn']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-dawn b4-a" },
        ...{ style: (C.value.sky2) },
        d: "M-200,520 C150,490 520,540 860,505 C1180,475 1450,520 1800,500 L1800,700 L-200,700 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-dawn']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-dawn b4-a" },
        ...{ style: (C.value.sky3) },
        d: "M-200,640 C300,615 700,650 1000,628 C1300,608 1550,640 1800,630 L1800,800 L-200,800 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-dawn']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-moon b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-moon']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(-1030 -470)",
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
        fill: "#dfe5e8",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-craterout b4-a" },
        fill: "#c8d0d5",
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
        ...{ class: "b4-dawn b4-a" },
        ...{ style: (C.value.skerry) },
        transform: "translate(-640 43)",
        d: "M1080,742 C1130,722 1180,716 1230,726 C1260,712 1300,714 1330,730 L1360,742 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-dawn']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-dawn b4-a" },
        ...{ style: (C.value.isle) },
        transform: "translate(350 41)",
    });
    /** @type {__VLS_StyleScopedClasses['b4-dawn']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M330,744 L380,720 L410,722 L440,700 L470,702 L500,672 L530,668 L556,640 L574,642 L600,620 L620,626 L640,600 L660,606 L690,640 L716,646 L742,676 L770,690 L800,712 L840,728 L880,744 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: "M458.4,704.3 L458.4,694.3 L452,694.3 L460,670.3 L468,694.3 L461.6,694.3 L461.6,704.3 Z M491.4,682 L491.4,672 L486,672 L493,650 L500,672 L494.6,672 L494.6,682 Z M527.4,671.1 L527.4,661.1 L520,661.1 L529,633.1 L538,661.1 L530.6,661.1 L530.6,671.1 Z M567.4,644.4 L567.4,634.4 L562,634.4 L569,610.4 L576,634.4 L570.6,634.4 L570.6,644.4 Z M616.4,628.4 L616.4,618.4 L610,618.4 L618,592.4 L626,618.4 L619.6,618.4 L619.6,628.4 Z M669.4,621.5 L669.4,611.5 L664,611.5 L671,591.5 L678,611.5 L672.6,611.5 L672.6,621.5 Z M706.4,647.2 L706.4,637.2 L700,637.2 L708,613.2 L716,637.2 L709.6,637.2 L709.6,647.2 Z M739.4,677.8 L739.4,667.8 L734,667.8 L741,647.8 L748,667.8 L742.6,667.8 L742.6,677.8 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        ...{ class: "b4-dawn b4-a" },
        ...{ style: (C.value.farWater) },
        x: "-1000",
        y: "785",
        width: "3300",
        height: "120",
    });
    /** @type {__VLS_StyleScopedClasses['b4-dawn']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        mask: (__VLS_unwrap(url, {})('fogMask')),
        ...{ class: "b4-fogout b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-fogout']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        ...{ class: "b4-fog b4-a" },
        x: "-1000",
        y: "581",
        width: "3300",
        height: "300",
        fill: (__VLS_unwrap(url, {})('fog')),
    });
    /** @type {__VLS_StyleScopedClasses['b4-fog']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-ship b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-ship']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    const __VLS_0 = IntroLongship;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        boy: true, strakes: true, underway: true,
    }));
    const __VLS_2 = __VLS_1({
        boy: true,
        strakes: true,
        underway: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-l-surf b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-l-surf']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(0 96)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-dawn b4-a" },
        ...{ style: (C.value.surf) },
        d: "M-200,744 C-100,736 0,750 100,742 C200,734 300,750 400,742 C500,734 600,750 700,742 C800,734 900,750 1000,742 C1100,734 1200,750 1300,742 C1400,734 1500,750 1600,742 C1700,734 1800,748 1900,742 L1900,1800 L-200,1800 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-dawn']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-dawn-line b4-a" },
        ...{ style: (C.value.surfLine) },
        fill: "none",
        'stroke-width': "2",
        d: "M-200,744 C-100,736 0,750 100,742 C200,734 300,750 400,742 C500,734 600,750 700,742 C800,734 900,750 1000,742 C1100,734 1200,750 1300,742 C1400,734 1500,750 1600,742 C1700,734 1800,748 1900,742",
    });
    /** @type {__VLS_StyleScopedClasses['b4-dawn-line']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
        ...{ class: "b4-sglow b4-a" },
        cx: "858",
        cy: "844",
        rx: "190",
        ry: "38",
        fill: (__VLS_unwrap(url, {})('surfGlow')),
    });
    /** @type {__VLS_StyleScopedClasses['b4-sglow']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(858 842)",
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(0 40)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-dawn b4-a" },
        ...{ style: (C.value.deep0) },
        d: "M-200,880 C200,862 500,900 800,878 C1100,858 1400,896 1900,872 L1900,1800 L-200,1800 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-dawn']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "b4-dawn b4-a" },
        ...{ style: (C.value.deep1) },
        d: "M-200,1010 C250,990 600,1030 900,1004 C1200,984 1500,1020 1900,1000 L1900,1800 L-200,1800 Z",
    });
    /** @type {__VLS_StyleScopedClasses['b4-dawn']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(0 -80)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "b4-heave b4-a" },
    });
    /** @type {__VLS_StyleScopedClasses['b4-heave']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#0b201e",
        d: "M-200,1330 C150,1210 300,1120 430,1112 C500,1106 545,1108 575,1100 C600,1094 616,1126 644,1138 C674,1146 700,1118 718,1080 C730,1060 742,1046 752,1044 C762,1046 768,1070 778,1092 C790,1110 812,1104 826,1100 C838,1110 846,1116 856,1110 C870,1104 880,1110 890,1118 C920,1140 960,1134 990,1130 C1030,1128 1060,1160 1110,1180 C1180,1200 1240,1170 1320,1160 C1420,1150 1560,1168 1900,1190 L1900,1800 L-200,1800 Z",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        fill: "#143229",
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
        ...{ class: "b4-dawn b4-a" },
        ...{ style: (C.value.front) },
    });
    /** @type {__VLS_StyleScopedClasses['b4-dawn']} */ ;
    /** @type {__VLS_StyleScopedClasses['b4-a']} */ ;
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
    [rootStyle, paused, id, id, id, id, id, id, url, url, url, url, url, url, C, C, C, C, C, C, C, C, C, C, C, C,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
