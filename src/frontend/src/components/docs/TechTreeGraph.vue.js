/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// The tech tree as a dependency graph: one card per building, links drawn
// between what needs what, and a hover that traces a chain in both
// directions — prerequisites full strength, what it leads to half-lit, the
// rest dimmed out of the way.
//
// All of the geometry and traversal lives in lib/techtree (and is tested
// there); this file is the rendering and the hover state.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AtlasSprite from '../AtlasSprite.vue';
import { GRAPH_CATEGORY_COLOR, GRAPH_LEGEND, art, } from '../../lib/techtree/buildingPresentation';
import { buildGraph, hoverSets } from '../../lib/techtree/graph';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { TOUCH_QUERY } from '../../lib/breakpoints';
import { BYPASS_Y, CARD_H, CARD_W, COLUMNS, COLUMN_TITLES, GRID_W, GUTTER, TECH_TREE_LAYOUT, } from '../../lib/techtree/layout';
import { buildTechTreeNodes, prerequisitesOf } from '../../lib/techtree/nodes';
import { pathD, routeEdges } from '../../lib/techtree/routing';
const { defineProps, } = {};
const props = defineProps();
const { t } = useI18n({ useScope: 'global' });
const hovered = ref(null);
const isTouch = useMediaQuery(TOUCH_QUERY);
const hoveredCategory = ref(null);
const nodes = computed(() => buildTechTreeNodes(props.byType));
const graph = computed(() => buildGraph(nodes.value.map((n) => n.type), (type) => prerequisitesOf(props.byType, type)));
// Only the buildings actually drawn, so a link never runs to a missing card.
const layout = computed(() => Object.fromEntries(nodes.value.map((node) => [node.type, TECH_TREE_LAYOUT[node.type]])));
// Independent of hover — the picture is routed once and only re-coloured.
const segments = computed(() => routeEdges(layout.value, graph.value));
const sets = computed(() => hoverSets(graph.value, hovered.value));
const categoryMembers = computed(() => hoveredCategory.value
    ? new Set(nodes.value.filter((n) => n.category === hoveredCategory.value).map((n) => n.type))
    : null);
const focused = computed(() => hovered.value !== null || hoveredCategory.value !== null);
/** full = a prerequisite of what's hovered (or hovered itself); soft = downstream of it. */
function emphasis(type) {
    if (!focused.value)
        return 'none';
    if (categoryMembers.value)
        return categoryMembers.value.has(type) ? 'full' : 'dim';
    if (sets.value.up.has(type))
        return 'full';
    if (sets.value.down.has(type))
        return 'soft';
    return 'dim';
}
function linkEmphasis(keys) {
    if (!focused.value)
        return 'none';
    if (categoryMembers.value)
        return 'dim';
    if (keys.some((k) => sets.value.upKeys.has(k)))
        return 'full';
    if (keys.some((k) => sets.value.downKeys.has(k)))
        return 'soft';
    return 'dim';
}
const paths = computed(() => segments.value.map((segment, index) => ({
    key: `${index}:${segment.keys.join(',')}`,
    d: pathD(segment.points),
    emphasis: linkEmphasis(segment.keys),
})));
const cards = computed(() => nodes.value.map((node) => {
    const ref = art(node.type);
    return {
        ...node,
        emphasis: emphasis(node.type),
        current: hovered.value === node.type,
        accent: GRAPH_CATEGORY_COLOR[node.category],
        atlas: ref.kind === 'atlas' ? ref.frame : null,
        png: ref.kind === 'png' ? ref.url : null,
    };
}));
const legend = computed(() => GRAPH_LEGEND.map((entry) => ({
    ...entry,
    color: GRAPH_CATEGORY_COLOR[entry.id],
    active: hoveredCategory.value === entry.id,
})));
const status = computed(() => {
    if (hoveredCategory.value) {
        const label = GRAPH_LEGEND.find((e) => e.id === hoveredCategory.value)?.label ?? '';
        return `${label} — the buildings in this family.`;
    }
    if (hovered.value) {
        const label = nodes.value.find((n) => n.type === hovered.value)?.label ?? '';
        return `${label} — gold is what it needs, dimmed gold is what it leads to.`;
    }
    return isTouch.value
        ? 'Tap a family to pick out its buildings, or a building to jump to its levels.'
        : 'Hover a building to trace what it needs, or a family to pick out its buildings.';
});
function focusBuilding(type) {
    hovered.value = type;
    hoveredCategory.value = null;
}
function focusCategory(id) {
    hoveredCategory.value = id;
    hovered.value = null;
}
function clear() {
    hovered.value = null;
    hoveredCategory.value = null;
}
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
    /** @type {__VLS_StyleScopedClasses['legend-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['legend-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['legend-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "tech-graph" },
        'aria-labelledby': "tech-graph-heading",
    });
    /** @type {__VLS_StyleScopedClasses['tech-graph']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "graph-head" },
        ...{ style: ({ maxWidth: `${__VLS_unwrap(GRID_W, {})}px` }) },
    });
    /** @type {__VLS_StyleScopedClasses['graph-head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        id: "tech-graph-heading",
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    (__VLS_unwrap(t, {})('docs.techTree.graphEyebrow'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "status" },
        'aria-live': "polite",
    });
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    (__VLS_unwrap(status, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ onMouseleave: (clear) },
        ...{ class: "legend" },
    });
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(legend, {})));
    for (const [entry] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            key: (entry.id),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onMouseenter: (...[$event]) => {
                    void $event;
                    return (focusCategory(entry.id));
                    // @ts-ignore
                    [GRID_W, t, status, legend,];
                } },
            ...{ onFocus: (...[$event]) => {
                    void $event;
                    return (focusCategory(entry.id));
                    // @ts-ignore
                    [];
                } },
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (entry.active ? clear() : focusCategory(entry.id));
                    // @ts-ignore
                    [];
                } },
            type: "button",
            ...{ class: "legend-button" },
            ...{ class: ({ active: entry.active }) },
        });
        /** @type {__VLS_StyleScopedClasses['legend-button']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "swatch" },
            ...{ style: ({ background: entry.color }) },
        });
        /** @type {__VLS_StyleScopedClasses['swatch']} */ ;
        (entry.label);
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "graph-scroll" },
    });
    /** @type {__VLS_StyleScopedClasses['graph-scroll']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onMouseleave: (clear) },
        ...{ class: "grid" },
        ...{ style: ({ width: `${__VLS_unwrap(GRID_W, {})}px`, height: `${__VLS_unwrap(BYPASS_Y, {}) + 8}px` }) },
    });
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "columns" },
        ...{ style: ({ gridTemplateColumns: `repeat(${__VLS_unwrap(COLUMNS, {})}, ${__VLS_unwrap(CARD_W, {})}px)`, gap: `${__VLS_unwrap(GUTTER, {})}px` }) },
    });
    /** @type {__VLS_StyleScopedClasses['columns']} */ ;
    const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(COLUMN_TITLES, {})));
    for (const [title] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            key: (title),
        });
        (title);
        // @ts-ignore
        [GRID_W, BYPASS_Y, COLUMNS, CARD_W, GUTTER, COLUMN_TITLES,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
        ...{ class: "links" },
        viewBox: (`0 0 ${__VLS_unwrap(GRID_W, {})} ${__VLS_unwrap(BYPASS_Y, {}) + 8}`),
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['links']} */ ;
    const __VLS_2 = __VLS_tryAsConstant((__VLS_unwrap(paths, {})));
    for (const [path] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
            key: (path.key),
            ...{ class: (['link', `link--${path.emphasis}`]) },
            d: (path.d),
            fill: "none",
            'stroke-linejoin': "round",
            'stroke-linecap': "round",
        });
        /** @type {__VLS_StyleScopedClasses['link']} */ ;
        // @ts-ignore
        [GRID_W, BYPASS_Y, paths,];
    }
    const __VLS_3 = __VLS_tryAsConstant((__VLS_unwrap(cards, {})));
    for (const [card] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
            ...{ onMouseenter: (...[$event]) => {
                    void $event;
                    return (focusBuilding(card.type));
                    // @ts-ignore
                    [cards,];
                } },
            ...{ onFocus: (...[$event]) => {
                    void $event;
                    return (focusBuilding(card.type));
                    // @ts-ignore
                    [];
                } },
            key: (card.type),
            ...{ class: "card" },
            ...{ class: ([`card--${card.emphasis}`, { 'card--current': card.current, 'card--anchor': card.isAnchor }]) },
            href: (`#${card.type}`),
            ...{ style: ({
                    left: `${card.x}px`,
                    top: `${card.y}px`,
                    width: `${__VLS_unwrap(CARD_W, {})}px`,
                    height: `${__VLS_unwrap(CARD_H, {})}px`,
                    borderTopColor: card.accent,
                }) },
        });
        /** @type {__VLS_StyleScopedClasses['card']} */ ;
        /** @type {__VLS_StyleScopedClasses['card--current']} */ ;
        /** @type {__VLS_StyleScopedClasses['card--anchor']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "card-top" },
        });
        /** @type {__VLS_StyleScopedClasses['card-top']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "thumb" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
        if (card.atlas) {
            const __VLS_4 = AtlasSprite;
            // @ts-ignore
            const __VLS_5 = __VLS_asFunctionalComponent1(__VLS_4, new __VLS_4({
                // @ts-ignore
                frame: (card.atlas),
            }));
            const __VLS_6 = __VLS_5({
                frame: (card.atlas),
            }, ...__VLS_functionalComponentArgsRest(__VLS_5));
        }
        else if (card.png) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                src: (card.png),
                alt: "",
            });
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "naming" },
        });
        /** @type {__VLS_StyleScopedClasses['naming']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "label" },
        });
        /** @type {__VLS_StyleScopedClasses['label']} */ ;
        (card.label);
        if (card.gives) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "gives" },
            });
            /** @type {__VLS_StyleScopedClasses['gives']} */ ;
            (card.gives);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "chips" },
        });
        /** @type {__VLS_StyleScopedClasses['chips']} */ ;
        const __VLS_9 = __VLS_tryAsConstant((card.chips));
        for (const [chip] of __VLS_vFor(__VLS_nonNull(__VLS_9))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                key: (chip.text),
                ...{ class: (['chip', `chip--${chip.kind}`]) },
            });
            /** @type {__VLS_StyleScopedClasses['chip']} */ ;
            (chip.text);
            // @ts-ignore
            [CARD_W, CARD_H,];
        }
        // @ts-ignore
        [];
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
