/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { sineLoop } from './sineLoop';
const { defineProps, } = {};
const __VLS_props = defineProps();
const FLAMES = [[-34, 0.7], [-17, 1], [0, 1.3], [16, 0.95], [32, 0.65]];
const SPARKS = [0, 1, 2, 3, 4, 5, 6];
const round = (n) => Math.round(n * 100) / 100;
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
    /** @type {__VLS_StyleScopedClasses['sd-flame']} */ ;
    /** @type {__VLS_StyleScopedClasses['sd-glow']} */ ;
    /** @type {__VLS_StyleScopedClasses['sd-spark']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
        ...{ class: "sd-glow" },
        ...{ style: ({ '--c': __VLS_ctx.index }) },
        cx: (__VLS_ctx.x),
        cy: (__VLS_ctx.y - 8),
        rx: (160 * __VLS_ctx.scale),
        ry: (80 * __VLS_ctx.scale),
        fill: (__VLS_ctx.glow),
    });
    /** @type {__VLS_StyleScopedClasses['sd-glow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: (`translate(${__VLS_ctx.x},${__VLS_ctx.y}) scale(${__VLS_ctx.scale})`),
    });
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(FLAMES, {})));
    for (const [[dx, h], i] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            key: (i),
            transform: (`translate(${dx},0)`),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "sd-flame" },
            ...{ style: ({ '--h': h, ...__VLS_unwrap(sineLoop, {})(9 + i * 1.7, __VLS_ctx.index * 2 + i) }) },
        });
        /** @type {__VLS_StyleScopedClasses['sd-flame']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M-12 0 C -14 -16, -5 -22, -4 -38 C 2 -26, 6 -30, 6 -42 C 14 -28, 15 -14, 12 0 Z",
            fill: "#d2501f",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            d: "M-6 0 C -7 -9, -2 -14, -1 -22 C 4 -14, 8 -10, 6 0 Z",
            fill: "#ffb54c",
        });
        // @ts-ignore
        [index, index, x, x, y, y, scale, scale, scale, glow, FLAMES, sineLoop,];
    }
    const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(SPARKS, {})));
    for (const [i] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            key: (`s${i}`),
            ...{ class: "sd-spark" },
            ...{ style: ({ '--x': `${(i - 3) * 7}px`, '--dx': `${__VLS_unwrap(round, {})(Math.sin(i * 2.3 + 1.8) * 14)}px`, '--o': `${-Math.round((((i * 1.6) / 7 + __VLS_ctx.index * 0.37) / 0.9) * 1000)}ms` }) },
            r: (__VLS_unwrap(round, {})(2 + (i % 3) * 0.6)),
            fill: "#ffc66b",
        });
        /** @type {__VLS_StyleScopedClasses['sd-spark']} */ ;
        // @ts-ignore
        [index, SPARKS, round, round,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
