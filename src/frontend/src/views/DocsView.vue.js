/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, nextTick, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import AnimatedCamp from '../components/docs/AnimatedCamp.vue';
import AnimatedBuildingSprite from '../components/AnimatedBuildingSprite.vue';
import AtlasSprite from '../components/AtlasSprite.vue';
import { findAtlasFrame } from '../lib/map/atlas';
import { buildingLayers } from '../lib/map/buildingArt';
import { useAnimationClock } from '../composables/useAnimationClock';
import { DOCS_GROUPS } from '../lib/docs/docsPages';
const { t } = useI18n({ useScope: 'global' });
const GROUPS = DOCS_GROUPS;
// The page scrolls inside its own container, where the browser's hash scrolling does not reach: `/docs#group-island`
// (the breadcrumb's group menu) scrolls to that group's section here, on arrival and when the hash changes.
const route = useRoute();
async function scrollToHash() {
    await nextTick();
    const id = route.hash.slice(1);
    if (id)
        document.getElementById(id)?.scrollIntoView({ block: 'start' });
}
onMounted(scrollToHash);
watch(() => route.hash, scrollToHash);
const utgard = computed(() => findAtlasFrame('showcase', 'giantutgard_SE_level000'));
// AtlasSprite keeps the frame's aspect ratio, so a width of min(100%, box
// height x ratio) contain-fits it into a box of the given size.
function fit(frame, boxHeight) {
    return { width: `min(100%, ${(boxHeight * frame.frame.w) / frame.frame.h}px)` };
}
function frameOf(art) {
    return art.startsWith('camp:') || art.startsWith('anim:') ? undefined : findAtlasFrame('showcase', art);
}
// A building card plays its `buildings-anim` clip on the docs clock, which holds
// still under reduced motion, Save-Data or "animations off" (useAnimationClock.ts).
const now = useAnimationClock();
/** The card art's box, in px: a static tile fits its height, an animated one its width. */
const ART_BOX = 84;
// The clip's canvas is taller than the building: it carries the room for the animated parts (a smoke plume) above it. Fitting
// that whole canvas into the box would shrink the hex, so the canvas is sized by its width, the box width a static tile gets,
// and the part that does not fit extends above the box.
function animatedOf(art) {
    if (!art.startsWith('anim:'))
        return undefined;
    const [, family, level] = art.split(':');
    const layers = buildingLayers(family, Number(level));
    if (!layers.clip || !(layers.base ?? layers.top))
        return undefined;
    return { layers, style: { width: `${ART_BOX}px`, flex: 'none', alignSelf: 'flex-end' } };
}
/** The still showcase frame of an `anim:` card, for as long as its clip is not there. */
function stillOf(art) {
    const [, family, level] = art.split(':');
    return findAtlasFrame('showcase', `${family}_SE_level${String(level).padStart(3, '0')}`);
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(utgard, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['hero']} */ ;
    /** @type {__VLS_StyleScopedClasses['groups']} */ ;
    /** @type {__VLS_StyleScopedClasses['group']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['art']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['art']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['footer']} */ ;
    /** @type {__VLS_StyleScopedClasses['hero']} */ ;
    /** @type {__VLS_StyleScopedClasses['hero-art']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['art']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['art']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['art']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "docs" }, title: (__VLS_ctx.$t('docs.hub.title')), caption: "DOCS", breadcrumb: (false), hero: true,
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "docs" },
        title: (__VLS_ctx.$t('docs.hub.title')),
        caption: "DOCS",
        breadcrumb: (false),
        hero: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['docs']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "hero" },
    });
    /** @type {__VLS_StyleScopedClasses['hero']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "hero-text" },
    });
    /** @type {__VLS_StyleScopedClasses['hero-text']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_unwrap(t, {})('docs.hub.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "lede" },
    });
    /** @type {__VLS_StyleScopedClasses['lede']} */ ;
    (__VLS_unwrap(t, {})('docs.hub.intro'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "hero-art" },
        'data-testid': "docs-hero-art",
    });
    /** @type {__VLS_StyleScopedClasses['hero-art']} */ ;
    if (utgard.value) {
        const __VLS_6 = AtlasSprite;
        // @ts-ignore
        const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
            // @ts-ignore
            frame: (utgard.value), 'aria-label': (__VLS_unwrap(t, {})('docs.hub.artAlt')), ...{ style: (fit(utgard.value, 250)) }, ...{ class: "utgard" },
        }));
        const __VLS_8 = __VLS_7({
            frame: (utgard.value),
            'aria-label': (__VLS_unwrap(t, {})('docs.hub.artAlt')),
            ...{ style: (fit(utgard.value, 250)) },
            ...{ class: "utgard" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_7));
        /** @type {__VLS_StyleScopedClasses['utgard']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "groups" },
    });
    /** @type {__VLS_StyleScopedClasses['groups']} */ ;
    const __VLS_11 = __VLS_tryAsConstant((__VLS_unwrap(GROUPS, {})));
    for (const [group] of __VLS_vFor(__VLS_nonNull(__VLS_11))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: (`group-${group.id}`),
            key: (group.id),
            ...{ class: "group" },
            'data-group': (group.id),
        });
        /** @type {__VLS_StyleScopedClasses['group']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_unwrap(t, {})(group.titleKey));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "group-desc" },
        });
        /** @type {__VLS_StyleScopedClasses['group-desc']} */ ;
        (__VLS_unwrap(t, {})(group.descriptionKey));
        const __VLS_12 = __VLS_tryAsConstant((group.pages));
        for (const [page] of __VLS_vFor(__VLS_nonNull(__VLS_12))) {
            let __VLS_13;
            /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
            RouterLink;
            // @ts-ignore
            const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
                // @ts-ignore
                key: (page.id), to: (page.to), ...{ class: "card" }, dataPage: (page.id),
            }));
            const __VLS_15 = __VLS_14({
                key: (page.id),
                to: (page.to),
                ...{ class: "card" },
                dataPage: (page.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_14));
            /** @type {__VLS_StyleScopedClasses['card']} */ ;
            var __VLS_16;
            const { default: __VLS_18 } = __VLS_nonNull(__VLS_16.slots);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "art" },
                'data-testid': "docs-card-art",
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['art']} */ ;
            if (page.art.startsWith('camp:')) {
                const __VLS_19 = AnimatedCamp;
                // @ts-ignore
                const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
                    // @ts-ignore
                    family: (page.art.slice(5)), orientation: "SE",
                }));
                const __VLS_21 = __VLS_20({
                    family: (page.art.slice(5)),
                    orientation: "SE",
                }, ...__VLS_functionalComponentArgsRest(__VLS_20));
            }
            else if (animatedOf(page.art)) {
                const __VLS_24 = AnimatedBuildingSprite;
                // @ts-ignore
                const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
                    // @ts-ignore
                    layers: (animatedOf(page.art).layers), elapsedMs: (__VLS_unwrap(now, {})), ...{ style: (animatedOf(page.art).style) },
                }));
                const __VLS_26 = __VLS_25({
                    layers: (animatedOf(page.art).layers),
                    elapsedMs: (__VLS_unwrap(now, {})),
                    ...{ style: (animatedOf(page.art).style) },
                }, ...__VLS_functionalComponentArgsRest(__VLS_25));
            }
            else if (page.art.startsWith('anim:') && stillOf(page.art)) {
                const __VLS_29 = AtlasSprite;
                // @ts-ignore
                const __VLS_30 = __VLS_asFunctionalComponent1(__VLS_29, new __VLS_29({
                    // @ts-ignore
                    frame: (stillOf(page.art)), ...{ style: (fit(stillOf(page.art), __VLS_unwrap(ART_BOX, {}))) },
                }));
                const __VLS_31 = __VLS_30({
                    frame: (stillOf(page.art)),
                    ...{ style: (fit(stillOf(page.art), __VLS_unwrap(ART_BOX, {}))) },
                }, ...__VLS_functionalComponentArgsRest(__VLS_30));
            }
            else if (frameOf(page.art)) {
                const __VLS_34 = AtlasSprite;
                // @ts-ignore
                const __VLS_35 = __VLS_asFunctionalComponent1(__VLS_34, new __VLS_34({
                    // @ts-ignore
                    frame: (frameOf(page.art)), ...{ style: (fit(frameOf(page.art), __VLS_unwrap(ART_BOX, {}))) },
                }));
                const __VLS_36 = __VLS_35({
                    frame: (frameOf(page.art)),
                    ...{ style: (fit(frameOf(page.art), __VLS_unwrap(ART_BOX, {}))) },
                }, ...__VLS_functionalComponentArgsRest(__VLS_35));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "text" },
            });
            /** @type {__VLS_StyleScopedClasses['text']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "title" },
            });
            /** @type {__VLS_StyleScopedClasses['title']} */ ;
            (__VLS_unwrap(t, {})(page.titleKey));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "desc" },
            });
            /** @type {__VLS_StyleScopedClasses['desc']} */ ;
            (__VLS_unwrap(t, {})(page.descriptionKey));
            // @ts-ignore
            [$t, t, t, t, t, t, t, t, utgard, utgard, utgard, GROUPS, now, ART_BOX, ART_BOX,];
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "footer" },
    });
    /** @type {__VLS_StyleScopedClasses['footer']} */ ;
    (__VLS_unwrap(t, {})('docs.hub.footer.lead'));
    let __VLS_39;
    /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
    RouterLink;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent1(__VLS_39, new __VLS_39({
        // @ts-ignore
        to: "/showcase",
    }));
    const __VLS_41 = __VLS_40({
        to: "/showcase",
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    var __VLS_42;
    const { default: __VLS_44 } = __VLS_nonNull(__VLS_42.slots);
    (__VLS_unwrap(t, {})('docs.hub.footer.link'));
    // @ts-ignore
    [t, t,];
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
