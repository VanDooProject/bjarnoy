/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { useId } from 'vue';
const { defineProps, withDefaults, } = {};
const __VLS_props = withDefaults(defineProps(), { bold: false, boy: false, strakes: false, underway: false });
const clipId = `${useId().replace(/[^a-zA-Z0-9]/g, '-')}-sailclip`;
const SAIL = 'M604 503 L956 503 C968 590 968 700 948 792 L612 792 C594 700 594 590 604 503Z';
const SHIELDS = Array.from({ length: 11 }, (_, i) => ({ x: 560 + i * 48, a: i % 2 === 1 }));
const OARS = [584, 680, 776, 872, 968, 1064].map((x) => ({
    x,
    body: `M${x - 17} 892 L${x - 14} 856 C${x - 10} 847 ${x + 10} 847 ${x + 14} 856 L${x + 17} 892Z`,
}));
const __VLS_defaults = { bold: false, boy: false, strakes: false, underway: false };
void __VLS_defaults;
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
    /** @type {__VLS_StyleScopedClasses['ship-oar']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-underway']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-underway']} */ ;
    /** @type {__VLS_StyleScopedClasses['ship-sail']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-underway']} */ ;
    /** @type {__VLS_StyleScopedClasses['ship-cloak']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "intro-longship" },
        ...{ class: ({ 'is-underway': __VLS_ctx.underway }) },
    });
    /** @type {__VLS_StyleScopedClasses['intro-longship']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-underway']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.defs, __VLS_intrinsics.defs)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.clipPath, __VLS_intrinsics.clipPath)({
        id: (__VLS_unwrap(clipId, {})),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        d: (__VLS_unwrap(SAIL, {})),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "s-steer" },
        d: "M486 838 L452 1004",
        'stroke-width': (__VLS_ctx.bold ? 8 : 7),
        'stroke-linecap': "round",
        fill: "none",
    });
    /** @type {__VLS_StyleScopedClasses['s-steer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
        ...{ class: "s-steer-blade" },
        cx: "455",
        cy: "990",
        rx: (__VLS_ctx.bold ? 10 : 9),
        ry: "24",
        transform: "rotate(12 455 990)",
    });
    /** @type {__VLS_StyleScopedClasses['s-steer-blade']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "s-rig" },
        d: "M780 474 L1176 790 M780 474 L436 800",
        'stroke-width': (__VLS_ctx.bold ? 4 : 2.2),
        fill: "none",
    });
    /** @type {__VLS_StyleScopedClasses['s-rig']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
        ...{ class: "s-mast" },
        x: (__VLS_ctx.bold ? 775 : 776),
        y: "470",
        width: (__VLS_ctx.bold ? 10 : 8),
        height: "420",
    });
    /** @type {__VLS_StyleScopedClasses['s-mast']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(780 503)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "ship-sail" },
    });
    /** @type {__VLS_StyleScopedClasses['ship-sail']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        transform: "translate(-780 -503)",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "s-sail" },
        d: (__VLS_unwrap(SAIL, {})),
    });
    /** @type {__VLS_StyleScopedClasses['s-sail']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
        ...{ class: "s-stripe" },
        'clip-path': (`url(#${__VLS_unwrap(clipId, {})})`),
    });
    /** @type {__VLS_StyleScopedClasses['s-stripe']} */ ;
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
        ...{ class: "s-mast" },
        x: "588",
        y: (__VLS_ctx.bold ? 494 : 495),
        width: "384",
        height: (__VLS_ctx.bold ? 10 : 8),
        rx: "3",
    });
    /** @type {__VLS_StyleScopedClasses['s-mast']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "s-crew" },
        d: "M452 882 L456 814 C460 805 482 805 488 814 L492 882Z",
    });
    /** @type {__VLS_StyleScopedClasses['s-crew']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
        ...{ class: "s-crew" },
        cx: "471",
        cy: "794",
        r: "13",
    });
    /** @type {__VLS_StyleScopedClasses['s-crew']} */ ;
    if (__VLS_ctx.boy) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "ship-boy" },
        });
        /** @type {__VLS_StyleScopedClasses['ship-boy']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            transform: "translate(1124 842)",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "ship-cloak" },
        });
        /** @type {__VLS_StyleScopedClasses['ship-cloak']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            ...{ class: "s-cloak" },
            d: "M0 0 C-10 4 -20 12 -28 22 L-15 20 L-20 30 L-3 22Z",
        });
        /** @type {__VLS_StyleScopedClasses['s-cloak']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            ...{ class: "s-crew" },
            d: "M1119 876 L1121 844 C1123 838 1135 838 1137 844 L1140 876Z",
        });
        /** @type {__VLS_StyleScopedClasses['s-crew']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: "s-crew" },
            cx: "1130",
            cy: "830",
            r: "8.5",
        });
        /** @type {__VLS_StyleScopedClasses['s-crew']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            ...{ class: "s-crew" },
            d: "M1122 826 C1124 818 1135 817 1139 825 L1135 823 L1132 827 L1128 822Z",
        });
        /** @type {__VLS_StyleScopedClasses['s-crew']} */ ;
    }
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(OARS, {})));
    for (const [o] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            key: (o.x),
            ...{ class: "ship-rower" },
        });
        /** @type {__VLS_StyleScopedClasses['ship-rower']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            ...{ class: "s-rower" },
            d: (o.body),
        });
        /** @type {__VLS_StyleScopedClasses['s-rower']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: "s-rower" },
            cx: (o.x),
            cy: "836",
            r: "12",
        });
        /** @type {__VLS_StyleScopedClasses['s-rower']} */ ;
        // @ts-ignore
        [underway, clipId, clipId, SAIL, SAIL, bold, bold, bold, bold, bold, bold, bold, boy, OARS,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "s-hull" },
        d: "M426 800 C440 852 470 880 520 888 L1080 888 C1130 880 1160 852 1170 800 L1198 800 C1198 882 1162 966 1060 992 L540 992 C438 966 396 882 396 800Z",
    });
    /** @type {__VLS_StyleScopedClasses['s-hull']} */ ;
    if (__VLS_ctx.strakes) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            ...{ class: "s-strake" },
            d: "M440 860 C470 885 500 896 540 901 L1060 901 C1100 896 1140 882 1168 852 M452 884 C484 904 512 916 552 922 L1050 922 C1092 916 1128 902 1156 882",
            'stroke-width': "3",
            fill: "none",
        });
        /** @type {__VLS_StyleScopedClasses['s-strake']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "s-hull" },
        d: "M396 806 C390 752 394 706 420 686 C442 670 470 678 470 700 C470 718 452 726 442 716 C452 712 456 702 448 694 C436 686 422 696 420 716 C418 744 422 776 426 806Z",
    });
    /** @type {__VLS_StyleScopedClasses['s-hull']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        ...{ class: "s-hull" },
        d: "M1170 806 C1176 760 1182 720 1196 696 C1208 680 1232 676 1246 686 L1236 692 L1250 700 L1232 704 C1218 706 1208 716 1204 734 C1200 756 1198 780 1198 806Z",
    });
    /** @type {__VLS_StyleScopedClasses['s-hull']} */ ;
    if (__VLS_ctx.strakes) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: "s-eye" },
            cx: "1224",
            cy: "689",
            r: "2.2",
        });
        /** @type {__VLS_StyleScopedClasses['s-eye']} */ ;
    }
    const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(SHIELDS, {})));
    for (const [s] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            key: (s.x),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: (s.a ? 's-shield-a' : 's-shield-b') },
            cx: (s.x),
            cy: "890",
            r: "21",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
            ...{ class: "s-boss" },
            cx: (s.x),
            cy: "890",
            r: "5",
        });
        /** @type {__VLS_StyleScopedClasses['s-boss']} */ ;
        // @ts-ignore
        [strakes, strakes, SHIELDS,];
    }
    const __VLS_2 = __VLS_tryAsConstant((__VLS_unwrap(OARS, {})));
    for (const [o] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            key: (`o${o.x}`),
            transform: (`translate(${o.x} 910)`),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.g, __VLS_intrinsics.g)({
            ...{ class: "ship-oar" },
        });
        /** @type {__VLS_StyleScopedClasses['ship-oar']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.rect)({
            ...{ class: "s-oar" },
            x: (__VLS_ctx.bold ? -3 : -2.5),
            y: "0",
            width: (__VLS_ctx.bold ? 6 : 5),
            height: "170",
            rx: "2",
        });
        /** @type {__VLS_StyleScopedClasses['s-oar']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.ellipse)({
            ...{ class: "s-oar" },
            cx: "0",
            cy: "156",
            rx: (__VLS_ctx.bold ? 8 : 7),
            ry: "20",
        });
        /** @type {__VLS_StyleScopedClasses['s-oar']} */ ;
        // @ts-ignore
        [bold, bold, bold, OARS,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
