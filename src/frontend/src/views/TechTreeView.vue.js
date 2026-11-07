/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import AtlasSprite from '../components/AtlasSprite.vue';
import AnimatedBuildingSprite from '../components/AnimatedBuildingSprite.vue';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import TechTreeGraph from '../components/docs/TechTreeGraph.vue';
import { buildingArt, buildingArtByFamily, buildingLayersForType, buildingLayers, terrainArt, } from '../lib/map/buildingArt';
import { HIDDEN_FROM_DOCS } from '../lib/techtree/layout';
import { prerequisitesOf } from '../lib/techtree/nodes';
import { GRAPH_CATEGORY_ORDER, graphCategoryOf } from '../lib/techtree/buildingPresentation';
const catalogue = useBuildingCatalogueStore();
const { t, te, n, d } = useI18n({ useScope: 'global' });
const route = useRoute();
/**
 * Brings the section named by the URL hash (`/docs/tech-tree#reindeerherder`, the
 * links BuildingLink.vue makes) into view. The router does no scrolling of its
 * own and the sections only exist once the catalogue has rendered, so this
 * waits for them; without it a link into the page would open at the top.
 */
async function scrollToHash() {
    const id = decodeURIComponent(route.hash.slice(1));
    if (!id)
        return;
    await nextTick();
    document.getElementById(id)?.scrollIntoView({ block: 'start' });
}
onMounted(async () => {
    await catalogue.load();
    await scrollToHash();
});
watch([() => route.hash, () => catalogue.types.length], scrollToHash, { flush: 'post' });
function lore(type) {
    const key = `docs.techTree.lore.${type}`;
    return te(key) ? t(key) : '';
}
function typeLabel(type) {
    const key = `docs.buildingTypes.${type}`;
    return te(key) ? t(key) : type.charAt(0).toUpperCase() + type.slice(1);
}
// The same categorisation the dependency graph above draws its legend
// from (buildingPresentation.ts's GRAPH_CATEGORY_ORDER/graphCategoryOf) —
// this page used to keep its own separate, coarser copy that never
// listed the shrine types at all, so they silently fell into the generic
// "production" section here while the graph correctly grouped them under
// "Shrines". One shared table now, so this page and the graph can't drift.
const CATEGORY_LABELS = {
    anchor: t('docs.techTree.categories.anchor'),
    production: t('docs.techTree.categories.production'),
    military: t('docs.techTree.categories.military'),
    defense: t('docs.techTree.categories.defense'),
    logistics: t('docs.techTree.categories.logistics'),
    religion: t('docs.techTree.categories.religion'),
    water: t('docs.techTree.categories.water'),
};
// Buildings on their way out of the game are left off the page entirely —
// graph and tables both — so the docs stop advertising something a player
// shouldn't invest in. They stay in the catalogue; this is a docs-only
// omission (see HIDDEN_FROM_DOCS).
const documented = computed(() => catalogue.types.filter((t) => !HIDDEN_FROM_DOCS.includes(t)));
const categories = computed(() => GRAPH_CATEGORY_ORDER.map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    types: documented.value.filter((t) => graphCategoryOf(t) === id),
})).filter((c) => c.types.length > 0));
/**
 * A building's thumbnail follows the level row the pointer is over, so the
 * picture actually changes as the table below it is read — undefined means
 * "no row hovered", which shows the richest (max) level rather than one
 * hardcoded rung. Keyed by type so hovering one building's table never
 * moves another's thumbnail.
 */
const hoveredLevel = ref({});
/**
 * Whether every building's thumbnail is shown large (roughly double the
 * long-standing 96x144 size, for a closer look at the art) — one shared
 * setting for the whole page, same as the old Normal/Large buttons, just
 * toggled by clicking any thumbnail instead of a separate control.
 */
const thumbsLarge = ref(false);
/**
 * Toggling resizes every thumbnail on the page at once, which reflows
 * everything below (and, for a thumbnail partway down the page, above) the
 * one that was clicked — left alone, the browser keeps the scroll position
 * in pixels, so the clicked thumbnail visibly jumps out from under the
 * pointer. Recording its viewport position before the resize and scrolling
 * by exactly how far it moved after Vue re-renders keeps it (and whatever
 * the reader was looking at) exactly where it was.
 */
async function toggleThumbSize(event) {
    const el = event.currentTarget;
    const before = el.getBoundingClientRect().top;
    thumbsLarge.value = !thumbsLarge.value;
    await nextTick();
    window.scrollBy(0, el.getBoundingClientRect().top - before);
}
function maxLevelOf(type) {
    const levels = catalogue.byType[type];
    return levels && levels.length > 0 ? levels[levels.length - 1].level : 1;
}
/** Hovering the picture itself previews level 0 — the art pack's own starting rung, one below the level-1 a building's first table row is (buildingArt/terrainArt fall back to the bare plot for the handful of types with no level-0 art at all). */
function hoverThumb(type) {
    hoveredLevel.value[type] = 0;
}
function hoverRow(type, level) {
    hoveredLevel.value[type] = level;
}
function resetThumb(type) {
    delete hoveredLevel.value[type];
}
/**
 * Building types with more than one art family — e.g. the Sawmill looks
 * different on a straight river tile vs. a gentle bend vs. a tight 60° bend
 * (see this page's `docs.techTree.lore.sawmill` string and `textures.ts`'s
 * `TextureKey`). A Sawmill is never on plain ground — placing one requires
 * a river shape (`BuildingCatalogue.SawmillRiverShapes`) — so there is
 * deliberately no `sawmill`/inland entry here; see `buildingArt.ts`'s
 * `BUILDING_ART_FAMILIES.sawmill` for why its default preview (with no
 * variant picked) is `sawmillriver`, not the grass family. Only types
 * listed here get a variant picker; everything else keeps the single
 * family `buildingArt` already resolves from the wire type.
 */
const ART_VARIANTS = {
    sawmill: [
        { id: 'river', family: 'sawmillriver', labelKey: 'docs.techTree.sawmillVariants.river' },
        { id: 'bend', family: 'sawmillbend', labelKey: 'docs.techTree.sawmillVariants.bend' },
        { id: 'bend60', family: 'sawmillbend60', labelKey: 'docs.techTree.sawmillVariants.bend60' },
    ],
    // The two mountain landforms the pack carves a quarry into.
    quarry: [
        { id: 'corrie', family: 'quarry_corrie', labelKey: 'docs.techTree.quarryVariants.corrie' },
        { id: 'saddleback', family: 'quarry_saddleback', labelKey: 'docs.techTree.quarryVariants.saddleback' },
    ],
};
const selectedVariant = ref({});
function variantsOf(type) {
    return ART_VARIANTS[type] ?? [];
}
function selectedVariantId(type) {
    return selectedVariant.value[type] ?? variantsOf(type)[0]?.id ?? '';
}
function thumbArt(type) {
    const level = hoveredLevel.value[type] ?? maxLevelOf(type);
    const variants = variantsOf(type);
    if (variants.length > 0) {
        const variant = variants.find((v) => v.id === selectedVariantId(type)) ?? variants[0];
        return buildingArtByFamily(variant.family, level) ?? terrainArt('grass');
    }
    return buildingArt(type, level) ?? terrainArt('grass');
}
// Split into two lookups (rather than exposing one ArtRef-keyed function) so
// the template doesn't need to narrow a discriminated union through a call.
function thumbFrame(type) {
    const a = thumbArt(type);
    return a.kind === 'atlas' ? a.frame : null;
}
function thumbUrl(type) {
    const a = thumbArt(type);
    return a.kind === 'png' ? a.url : null;
}
/**
 * A moving part (waterwheel, walk cycle, smoke) beats the flattened
 * `showcase` picture `thumbArt` otherwise shows — only set when this exact
 * type/level (and, for a type with a variant picker, the currently
 * selected variant's own family) has a `buildings-anim` clip; everything
 * else keeps the static picture, `AnimatedBuildingSprite` isn't rendered
 * at all for those.
 */
function thumbAnimatedLayers(type) {
    const level = hoveredLevel.value[type] ?? maxLevelOf(type);
    const variants = variantsOf(type);
    const layers = variants.length > 0
        ? buildingLayers((variants.find((v) => v.id === selectedVariantId(type)) ?? variants[0]).family, level)
        : buildingLayersForType(type, level);
    return layers?.clip ? layers : undefined;
}
/**
 * The buildings that must already stand before this one can go up — the same
 * rule the graph above draws, spelled out for the building's own section.
 */
function prerequisiteLabel(type) {
    const prerequisites = prerequisitesOf(catalogue.byType, type);
    if (prerequisites.length === 0)
        return null;
    return prerequisites.map((p) => `${typeLabel(p.type)} level ${p.level}`).join(' and ');
}
function terrainLabel(requiresCoastalWater, terrain) {
    if (requiresCoastalWater)
        return t('docs.techTree.terrainCoastal');
    return terrain.length === 0 ? t('docs.techTree.terrainAny') : terrain.join(', ');
}
function humanizeSeconds(seconds) {
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0)
        return `${minutes}m`;
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
function formatAmount(value) {
    return value === 0 ? '—' : n(Math.round(value), 'integer');
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(catalogue, {});
    __VLS_withDotValue(categories, {});
    __VLS_withDotValue(selectedVariant, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['toc-link']} */ ;
    /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['floating-art-shadow']} */ ;
    /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "tech-tree" }, wide: true, title: (__VLS_ctx.$t('docs.techTree.title')), caption: "DOCS · DEPENDENCIES", intro: (__VLS_ctx.$t('docs.techTree.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "tech-tree" },
        wide: true,
        title: (__VLS_ctx.$t('docs.techTree.title')),
        caption: "DOCS · DEPENDENCIES",
        intro: (__VLS_ctx.$t('docs.techTree.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['tech-tree']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    {
        const { wide: __VLS_6 } = __VLS_nonNull(__VLS_3.slots);
        if (catalogue.value.types.length > 0) {
            const __VLS_7 = TechTreeGraph;
            // @ts-ignore
            const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
                // @ts-ignore
                byType: (catalogue.value.byType),
            }));
            const __VLS_9 = __VLS_8({
                byType: (catalogue.value.byType),
            }, ...__VLS_functionalComponentArgsRest(__VLS_8));
        }
        // @ts-ignore
        [$t, $t, catalogue, catalogue,];
    }
    if (catalogue.value.loading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status" },
        });
        /** @type {__VLS_StyleScopedClasses['status']} */ ;
        (__VLS_ctx.$t('docs.status.loading'));
    }
    else if (catalogue.value.error) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status error" },
        });
        /** @type {__VLS_StyleScopedClasses['status']} */ ;
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (catalogue.value.error);
    }
    else if (catalogue.value.source === 'fallback') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status" },
        });
        /** @type {__VLS_StyleScopedClasses['status']} */ ;
        (__VLS_ctx.$t('docs.status.fallback', {
            snapshot: catalogue.value.generatedAt
                ? __VLS_ctx.$t('docs.status.fallbackSnapshot', { date: __VLS_unwrap(d, {})(new Date(catalogue.value.generatedAt), 'short') })
                : '',
        }));
    }
    if (categories.value.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
            ...{ class: "toc" },
            'aria-label': (__VLS_ctx.$t('docs.status.toc')),
        });
        /** @type {__VLS_StyleScopedClasses['toc']} */ ;
        const __VLS_12 = __VLS_tryAsConstant((categories.value));
        for (const [cat] of __VLS_vFor(__VLS_nonNull(__VLS_12))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (cat.id),
                ...{ class: "toc-group" },
            });
            /** @type {__VLS_StyleScopedClasses['toc-group']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "toc-category" },
            });
            /** @type {__VLS_StyleScopedClasses['toc-category']} */ ;
            (cat.label);
            const __VLS_13 = __VLS_tryAsConstant((cat.types));
            for (const [type] of __VLS_vFor(__VLS_nonNull(__VLS_13))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
                    key: (type),
                    ...{ class: "toc-link" },
                    href: (`#${type}`),
                });
                /** @type {__VLS_StyleScopedClasses['toc-link']} */ ;
                (typeLabel(type));
                // @ts-ignore
                [$t, $t, $t, $t, catalogue, catalogue, catalogue, catalogue, catalogue, catalogue, d, categories, categories,];
            }
            // @ts-ignore
            [];
        }
    }
    const __VLS_14 = __VLS_tryAsConstant((categories.value));
    for (const [cat] of __VLS_vFor(__VLS_nonNull(__VLS_14))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (cat.id),
            ...{ class: "category" },
        });
        /** @type {__VLS_StyleScopedClasses['category']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
            id: (cat.id),
            ...{ class: "category-title" },
        });
        /** @type {__VLS_StyleScopedClasses['category-title']} */ ;
        (cat.label);
        const __VLS_15 = __VLS_tryAsConstant((cat.types));
        for (const [type] of __VLS_vFor(__VLS_nonNull(__VLS_15))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
                key: (type),
                id: (type),
                ...{ class: "building" },
            });
            /** @type {__VLS_StyleScopedClasses['building']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "building-header" },
            });
            /** @type {__VLS_StyleScopedClasses['building-header']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ onMouseenter: (...[$event]) => {
                        void $event;
                        return (hoverThumb(type));
                        // @ts-ignore
                        [categories,];
                    } },
                ...{ onMouseleave: (...[$event]) => {
                        void $event;
                        return (resetThumb(type));
                        // @ts-ignore
                        [];
                    } },
                ...{ onClick: (...[$event]) => {
                        void $event;
                        return (toggleThumbSize($event));
                        // @ts-ignore
                        [];
                    } },
                ...{ onKeydown: (...[$event]) => {
                        void $event;
                        return (toggleThumbSize($event));
                        // @ts-ignore
                        [];
                    } },
                ...{ onKeydown: (...[$event]) => {
                        void $event;
                        return (toggleThumbSize($event));
                        // @ts-ignore
                        [];
                    } },
                ...{ class: "thumb floating-art" },
                ...{ class: ({ large: __VLS_unwrap(thumbsLarge, {}) }) },
                role: "button",
                tabindex: "0",
                'aria-label': (__VLS_ctx.$t('docs.techTree.imageSize.toggle')),
            });
            /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
            /** @type {__VLS_StyleScopedClasses['floating-art']} */ ;
            /** @type {__VLS_StyleScopedClasses['large']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "floating-art-shadow" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['floating-art-shadow']} */ ;
            if (thumbAnimatedLayers(type)) {
                const __VLS_16 = AnimatedBuildingSprite;
                // @ts-ignore
                const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
                    // @ts-ignore
                    layers: (thumbAnimatedLayers(type)),
                }));
                const __VLS_18 = __VLS_17({
                    layers: (thumbAnimatedLayers(type)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_17));
            }
            else if (thumbFrame(type)) {
                const __VLS_21 = AtlasSprite;
                // @ts-ignore
                const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
                    // @ts-ignore
                    frame: (thumbFrame(type)),
                }));
                const __VLS_23 = __VLS_22({
                    frame: (thumbFrame(type)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_22));
            }
            else if (thumbUrl(type)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                    ...{ class: "thumb-img" },
                    src: (thumbUrl(type)),
                    alt: "",
                });
                /** @type {__VLS_StyleScopedClasses['thumb-img']} */ ;
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "building-intro" },
            });
            /** @type {__VLS_StyleScopedClasses['building-intro']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
            (typeLabel(type));
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "lore" },
            });
            /** @type {__VLS_StyleScopedClasses['lore']} */ ;
            (lore(type));
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "terrain" },
            });
            /** @type {__VLS_StyleScopedClasses['terrain']} */ ;
            (__VLS_ctx.$t('docs.techTree.terrain'));
            (terrainLabel(catalogue.value.byType[type][0].requiresCoastalWater, catalogue.value.byType[type][0].allowedTerrain));
            if (prerequisiteLabel(type)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "terrain" },
                });
                /** @type {__VLS_StyleScopedClasses['terrain']} */ ;
                (__VLS_ctx.$t('docs.techTree.needsFirst', { prerequisites: prerequisiteLabel(type) }));
            }
            if (variantsOf(type).length > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "variants" },
                });
                /** @type {__VLS_StyleScopedClasses['variants']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "variants-label" },
                });
                /** @type {__VLS_StyleScopedClasses['variants-label']} */ ;
                (__VLS_ctx.$t('docs.techTree.artVariant'));
                const __VLS_26 = __VLS_tryAsConstant((variantsOf(type)));
                for (const [variant] of __VLS_vFor(__VLS_nonNull(__VLS_26))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!(variantsOf(type).length > 0))
                                    throw 0;
                                return (selectedVariant.value[type] = variant.id);
                                // @ts-ignore
                                [$t, $t, $t, $t, catalogue, catalogue, thumbsLarge, selectedVariant,];
                            } },
                        key: (variant.id),
                        type: "button",
                        ...{ class: "variant-button" },
                        ...{ class: ({ active: selectedVariantId(type) === variant.id }) },
                    });
                    /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
                    /** @type {__VLS_StyleScopedClasses['active']} */ ;
                    (__VLS_ctx.$t(variant.labelKey));
                    // @ts-ignore
                    [$t,];
                }
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ onMouseleave: (...[$event]) => {
                        void $event;
                        return (resetThumb(type));
                        // @ts-ignore
                        [];
                    } },
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.techTree.table.level'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.techTree.table.wood'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.techTree.table.stone'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.techTree.table.food'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.techTree.table.iron'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.techTree.table.buildTime'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.techTree.table.productionPerHour'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.techTree.table.storage'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.techTree.table.requiresLonghouse'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            const __VLS_27 = __VLS_tryAsConstant((catalogue.value.byType[type]));
            for (const [def] of __VLS_vFor(__VLS_nonNull(__VLS_27))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    ...{ onMouseenter: (...[$event]) => {
                            void $event;
                            return (hoverRow(type, def.level));
                            // @ts-ignore
                            [$t, $t, $t, $t, $t, $t, $t, $t, $t, catalogue,];
                        } },
                    key: (def.level),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (def.level);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (formatAmount(def.cost.wood));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (formatAmount(def.cost.stone));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (formatAmount(def.cost.food));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (formatAmount(def.cost.iron));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (humanizeSeconds(def.buildSeconds));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                if (Object.values(def.productionPerHour).some((v) => v > 0)) {
                    if (def.productionPerHour.wood > 0) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                        (formatAmount(def.productionPerHour.wood));
                        (__VLS_ctx.$t('docs.techTree.table.unitWood'));
                    }
                    if (def.productionPerHour.stone > 0) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                        (formatAmount(def.productionPerHour.stone));
                        (__VLS_ctx.$t('docs.techTree.table.unitStone'));
                    }
                    if (def.productionPerHour.food > 0) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                        (formatAmount(def.productionPerHour.food));
                        (__VLS_ctx.$t('docs.techTree.table.unitFood'));
                    }
                    if (def.productionPerHour.iron > 0) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                        (formatAmount(def.productionPerHour.iron));
                        (__VLS_ctx.$t('docs.techTree.table.unitIron'));
                    }
                }
                else {
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                if (Object.values(def.storageCapacity).some((v) => v > 0)) {
                    if (def.storageCapacity.wood > 0) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                        (__VLS_ctx.$t('docs.techTree.table.storagePrefix'));
                        (formatAmount(def.storageCapacity.wood));
                        (__VLS_ctx.$t('docs.techTree.table.unitWood'));
                    }
                    if (def.storageCapacity.stone > 0) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                        (__VLS_ctx.$t('docs.techTree.table.storagePrefix'));
                        (formatAmount(def.storageCapacity.stone));
                        (__VLS_ctx.$t('docs.techTree.table.unitStone'));
                    }
                    if (def.storageCapacity.food > 0) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                        (__VLS_ctx.$t('docs.techTree.table.storagePrefix'));
                        (formatAmount(def.storageCapacity.food));
                        (__VLS_ctx.$t('docs.techTree.table.unitFood'));
                    }
                    if (def.storageCapacity.iron > 0) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                        (__VLS_ctx.$t('docs.techTree.table.storagePrefix'));
                        (formatAmount(def.storageCapacity.iron));
                        (__VLS_ctx.$t('docs.techTree.table.unitIron'));
                    }
                }
                else {
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (def.requiredLonghouseLevel);
                // @ts-ignore
                [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t,];
            }
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
    }
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
