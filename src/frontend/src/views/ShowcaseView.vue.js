/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Public marketing/portfolio page (issue: "showcase page"). Deliberately a
// route inside the game app rather than a static page of screenshots: the
// hero and "one view" sections mount the *real* WorldMapCanvas/
// SettlementCanvas components against a standalone, backend-free WorldModel
// (same trick stores/world.ts's own DEMO_MODE model uses), so this page can
// never go stale relative to what the live renderer actually looks like.
import { computed, markRaw, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import MobileHudDrawer from '../components/hud/MobileHudDrawer.vue';
import WorldMapCanvas from '../components/map/WorldMapCanvas.vue';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import AtlasSprite from '../components/AtlasSprite.vue';
import { hexDistance } from '../lib/hex/coords';
import { WorldModel } from '../lib/map/WorldModel';
import { buildShowcaseVillage, SHOWCASE_PREVIEW_RADIUS, SHOWCASE_RENDER_RADIUS, showcaseWorldFrame, } from '../lib/showcase/showcaseVillage';
import { DEFAULT_GENERATION, enumerateIslands } from '../lib/map/worldGenerator';
import { buildingArt, terrainArt } from '../lib/map/buildingArt';
const router = useRouter();
const { t } = useI18n({ useScope: 'global' });
// A fixed, known-good archipelago rather than a fresh roll on every page load.
// Picked by scoring 3000 seeds (20260000..20262999) on the "one view" frame, then
// moved one seed on by hand when the river generator started meandering: its
// island frames a big bog lake and moss land, a village between the rivers and
// the coast (with a dockyard), a giant mountain and a sand coast.
const DEFAULT_SEED = 20261824;
// The whole default world: islands are ~150 hexes across and ~100+ apart, so a
// small disc around the origin is usually open sea. Listing the labels costs
// nothing like DEMO_MASK_RADIUS's fog mask (this page never fogs — see
// `buildShowcase` below, the village belongs to its own owner id, never the "showcase" player id).
const SHOWCASE_RADIUS = DEFAULT_GENERATION.worldRadius;
const PLAYER_ID = 'showcase';
const seed = ref(DEFAULT_SEED);
/**
 * One model per seed, shared by both map frames: the whole archipelago (its
 * labels cost nothing like DEMO_MASK_RADIUS's fog mask) plus a built-up village
 * on the island nearest the origin (where the world-mode camera starts), so the
 * hero map and the "one view" frame show the same place at two zooms. Building
 * the world once also halves the (whole-world) island enumeration.
 */
function buildShowcase(worldSeed) {
    const model = new WorldModel(worldSeed);
    const islands = enumerateIslands({ seed: worldSeed, generation: DEFAULT_GENERATION }, SHOWCASE_RADIUS);
    model.setIslands(islands);
    const nearest = islands.reduce((best, island) => !best || hexDistance({ q: 0, r: 0 }, island) < hexDistance({ q: 0, r: 0 }, best) ? island : best, undefined);
    const { frameCenter: center } = buildShowcaseVillage(model, nearest ?? { q: 0, r: 0 }, worldSeed);
    // `markRaw`: same reasoning as stores/world.ts's own model — a plain class
    // meant to be read directly by the renderer, not walked by Vue's reactivity
    // proxy on every tile access.
    return { model: markRaw(model), center };
}
const showcase = ref(buildShowcase(seed.value));
const heroModel = computed(() => showcase.value.model);
// The village site on the generated island: the "one view" frame previews it.
const islandCenter = computed(() => showcase.value.center);
// The hero map is capped to the village island and a margin of sea (see showcaseWorldFrame): the camera starts
// fitted to that disc and can neither leave nor zoom out of it.
const worldFrame = computed(() => showcaseWorldFrame(heroModel.value, islandCenter.value));
// useHexMapRenderer captures its options once at mount (see
// SettlementCanvas.vue's own comment on `mode`) — a `:key="seed"` on the
// canvas is what forces a real remount when the re-roll button below swaps
// the model out from under it.
function reroll() {
    seed.value = Math.floor(Math.random() * 2 ** 31);
    showcase.value = buildShowcase(seed.value);
}
// e2e (showcase.spec.ts): a read-only accessor for the hero renderer's camera math and the cap it was given,
// the same kind of hook LandingView/MapView install as `__settlementRenderer`.
const heroCanvas = ref(null);
onMounted(() => {
    window.__showcaseHero = () => ({ renderer: heroCanvas.value?.renderer, frame: worldFrame.value });
});
onUnmounted(() => {
    delete window.__showcaseHero;
});
// Both map frames are interactive from the start and confined to their area (`confine-camera`), so the
// visitor can pan and zoom freely without leaving it. The hero map sits in the scrolling page and passes
// `allow-page-scroll`: a plain wheel or a vertical swipe over it scrolls the page, a drag pans.
function goPlay() {
    router.push('/');
}
function goDocs() {
    router.push('/docs');
}
// Player-pitch feature grid — one small tile-art thumbnail per card, picked
// to match the feature's own copy (prototypes/MECHANICS.md is the source for
// all of these). Thumbnails render exactly as TileDocsView.vue does: an
// AtlasSprite for a 'atlas' ArtRef, a plain <img> for the 'png' fallback.
// A computed so the art fills in once the atlas manifests arrive (they are
// fetched lazily — see lib/map/atlasManifests.ts).
const FEATURES = computed(() => [
    { key: 'sharedIslands', art: featureArt('hut', 3) },
    { key: 'borders', art: featureArt('longhouse', 5) },
    { key: 'realTime', art: featureArt('sawmill', 3) },
    { key: 'fogOfWar', art: featureArt('tower', 3) },
    { key: 'expansion', art: featureArt('dockyard', 3) },
    { key: 'trade', art: featureArt('storagehouse', 3) },
    { key: 'guilds', art: featureArt('shrineofthor', 3) },
    { key: 'battles', art: featureArt('barracks', 3) },
]);
/** A building's in-game art, or a plain grass hex should the pack ever drop that family. */
function featureArt(type, level) {
    return buildingArt(type, level) ?? terrainArt('grass');
}
function thumbFrame(art) {
    return art.kind === 'atlas' ? art.frame : null;
}
function thumbUrl(art) {
    return art.kind === 'png' ? art.url : null;
}
const ENGINEERING = [
    { key: 'renderer' },
    { key: 'generation' },
    { key: 'backend' },
    { key: 'e2e' },
    { key: 'deploy' },
    { key: 'i18n' },
];
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(worldFrame, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['hero']} */ ;
    /** @type {__VLS_StyleScopedClasses['cta']} */ ;
    /** @type {__VLS_StyleScopedClasses['cta']} */ ;
    /** @type {__VLS_StyleScopedClasses['cta']} */ ;
    /** @type {__VLS_StyleScopedClasses['reroll']} */ ;
    /** @type {__VLS_StyleScopedClasses['one-view']} */ ;
    /** @type {__VLS_StyleScopedClasses['one-view-copy']} */ ;
    /** @type {__VLS_StyleScopedClasses['features']} */ ;
    /** @type {__VLS_StyleScopedClasses['engineering']} */ ;
    /** @type {__VLS_StyleScopedClasses['card-text']} */ ;
    /** @type {__VLS_StyleScopedClasses['engineering-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['doc-link']} */ ;
    /** @type {__VLS_StyleScopedClasses['footer-link']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "showcase" },
    });
    /** @type {__VLS_StyleScopedClasses['showcase']} */ ;
    const __VLS_0 = TopBar || TopBar;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        docked: true, title: (__VLS_unwrap(t, {})('showcase.brand')), caption: "SHOWCASE",
    }));
    const __VLS_2 = __VLS_1({
        docked: true,
        title: (__VLS_unwrap(t, {})('showcase.brand')),
        caption: "SHOWCASE",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    const __VLS_6 = HudNav;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    // @ts-ignore
    }));
    const __VLS_8 = __VLS_7({}, ...__VLS_functionalComponentArgsRest(__VLS_7));
    {
        const { drawer: __VLS_11 } = __VLS_nonNull(__VLS_3.slots);
        const [{ close }] = __VLS_vSlot(__VLS_nonNull(__VLS_11));
        const __VLS_12 = MobileHudDrawer;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
            // @ts-ignore
            ...{ 'onClose': {} },
        }));
        const __VLS_14 = __VLS_13({
            ...{ 'onClose': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        let __VLS_17;
        const __VLS_18 = {
            /** @type {typeof __VLS_17.close} */
            onClose: (close),
        };
        void __VLS_18;
        var __VLS_15;
        var __VLS_16;
        // @ts-ignore
        [t,];
    }
    // @ts-ignore
    [];
    __VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
        ...{ class: "body" },
    });
    /** @type {__VLS_StyleScopedClasses['body']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "hero",
        ...{ class: "hero" },
    });
    /** @type {__VLS_StyleScopedClasses['hero']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "hero-copy" },
    });
    /** @type {__VLS_StyleScopedClasses['hero-copy']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    (__VLS_unwrap(t, {})('showcase.hero.eyebrow'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    (__VLS_unwrap(t, {})('showcase.hero.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "pitch" },
    });
    /** @type {__VLS_StyleScopedClasses['pitch']} */ ;
    (__VLS_unwrap(t, {})('showcase.hero.pitch'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "cta-row" },
    });
    /** @type {__VLS_StyleScopedClasses['cta-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (goPlay) },
        type: "button",
        ...{ class: "cta primary" },
    });
    /** @type {__VLS_StyleScopedClasses['cta']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    (__VLS_unwrap(t, {})('showcase.hero.playCta'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (goDocs) },
        type: "button",
        ...{ class: "cta secondary" },
    });
    /** @type {__VLS_StyleScopedClasses['cta']} */ ;
    /** @type {__VLS_StyleScopedClasses['secondary']} */ ;
    (__VLS_unwrap(t, {})('showcase.hero.docsCta'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "hero-map" },
    });
    /** @type {__VLS_StyleScopedClasses['hero-map']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "map-frame frame" },
    });
    /** @type {__VLS_StyleScopedClasses['map-frame']} */ ;
    /** @type {__VLS_StyleScopedClasses['frame']} */ ;
    const __VLS_19 = WorldMapCanvas;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
        // @ts-ignore
        ref: "heroCanvas", key: (__VLS_unwrap(seed, {})), worldModel: (__VLS_unwrap(heroModel, {})), playerId: (__VLS_unwrap(PLAYER_ID, {})), previewCenter: (worldFrame.value.center), previewRadius: (worldFrame.value.radius), confineCamera: true, allowPageScroll: true,
    }));
    const __VLS_21 = __VLS_20({
        ref: "heroCanvas",
        key: (__VLS_unwrap(seed, {})),
        worldModel: (__VLS_unwrap(heroModel, {})),
        playerId: (__VLS_unwrap(PLAYER_ID, {})),
        previewCenter: (worldFrame.value.center),
        previewRadius: (worldFrame.value.radius),
        confineCamera: true,
        allowPageScroll: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "map-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['map-meta']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "seed" },
    });
    /** @type {__VLS_StyleScopedClasses['seed']} */ ;
    (__VLS_unwrap(t, {})('showcase.hero.seed', { seed: __VLS_unwrap(seed, {}) }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (reroll) },
        type: "button",
        ...{ class: "reroll" },
    });
    /** @type {__VLS_StyleScopedClasses['reroll']} */ ;
    (__VLS_unwrap(t, {})('showcase.hero.reroll'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "one-view",
        ...{ class: "one-view" },
    });
    /** @type {__VLS_StyleScopedClasses['one-view']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "one-view-frame frame" },
    });
    /** @type {__VLS_StyleScopedClasses['one-view-frame']} */ ;
    /** @type {__VLS_StyleScopedClasses['frame']} */ ;
    const __VLS_24 = SettlementCanvas;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
        // @ts-ignore
        key: (__VLS_unwrap(seed, {})), worldModel: (__VLS_unwrap(heroModel, {})), playerId: (__VLS_unwrap(PLAYER_ID, {})), previewCenter: (__VLS_unwrap(islandCenter, {})), previewRadius: (__VLS_unwrap(SHOWCASE_PREVIEW_RADIUS, {})), previewRenderRadius: (__VLS_unwrap(SHOWCASE_RENDER_RADIUS, {})), previewSea: true, confineCamera: true, hideSettlementBadge: true, background: "radial-gradient(120% 100% at 68% 42%, #16414f 0%, #0d2530 55%, #0b1116 100%)",
    }));
    const __VLS_26 = __VLS_25({
        key: (__VLS_unwrap(seed, {})),
        worldModel: (__VLS_unwrap(heroModel, {})),
        playerId: (__VLS_unwrap(PLAYER_ID, {})),
        previewCenter: (__VLS_unwrap(islandCenter, {})),
        previewRadius: (__VLS_unwrap(SHOWCASE_PREVIEW_RADIUS, {})),
        previewRenderRadius: (__VLS_unwrap(SHOWCASE_RENDER_RADIUS, {})),
        previewSea: true,
        confineCamera: true,
        hideSettlementBadge: true,
        background: "radial-gradient(120% 100% at 68% 42%, #16414f 0%, #0d2530 55%, #0b1116 100%)",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "one-view-copy" },
    });
    /** @type {__VLS_StyleScopedClasses['one-view-copy']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_unwrap(t, {})('showcase.oneView.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_unwrap(t, {})('showcase.oneView.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "features",
        ...{ class: "features" },
    });
    /** @type {__VLS_StyleScopedClasses['features']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_unwrap(t, {})('showcase.features.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "section-intro" },
    });
    /** @type {__VLS_StyleScopedClasses['section-intro']} */ ;
    (__VLS_unwrap(t, {})('showcase.features.intro'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "grid" },
    });
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    const __VLS_29 = __VLS_tryAsConstant((__VLS_unwrap(FEATURES, {})));
    for (const [feature] of __VLS_vFor(__VLS_nonNull(__VLS_29))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (feature.key),
            ...{ class: "card feature-card" },
        });
        /** @type {__VLS_StyleScopedClasses['card']} */ ;
        /** @type {__VLS_StyleScopedClasses['feature-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "thumb" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
        if (thumbFrame(feature.art)) {
            const __VLS_30 = AtlasSprite;
            // @ts-ignore
            const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
                // @ts-ignore
                frame: (thumbFrame(feature.art)),
            }));
            const __VLS_32 = __VLS_31({
                frame: (thumbFrame(feature.art)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_31));
        }
        else if (thumbUrl(feature.art)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                ...{ class: "thumb-img" },
                src: (thumbUrl(feature.art)),
                alt: "",
            });
            /** @type {__VLS_StyleScopedClasses['thumb-img']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "card-text" },
        });
        /** @type {__VLS_StyleScopedClasses['card-text']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
        (__VLS_unwrap(t, {})(`showcase.features.items.${feature.key}.title`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_unwrap(t, {})(`showcase.features.items.${feature.key}.body`));
        // @ts-ignore
        [t, t, t, t, t, t, t, t, t, t, t, t, t, seed, seed, seed, heroModel, heroModel, PLAYER_ID, PLAYER_ID, worldFrame, worldFrame, islandCenter, SHOWCASE_PREVIEW_RADIUS, SHOWCASE_RENDER_RADIUS, FEATURES,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "engineering",
        ...{ class: "engineering" },
    });
    /** @type {__VLS_StyleScopedClasses['engineering']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_unwrap(t, {})('showcase.engineering.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "section-intro" },
    });
    /** @type {__VLS_StyleScopedClasses['section-intro']} */ ;
    (__VLS_unwrap(t, {})('showcase.engineering.intro'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "grid" },
    });
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    const __VLS_35 = __VLS_tryAsConstant((__VLS_unwrap(ENGINEERING, {})));
    for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_35))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (item.key),
            ...{ class: "card engineering-card" },
        });
        /** @type {__VLS_StyleScopedClasses['card']} */ ;
        /** @type {__VLS_StyleScopedClasses['engineering-card']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
        (__VLS_unwrap(t, {})(`showcase.engineering.items.${item.key}.title`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_unwrap(t, {})(`showcase.engineering.items.${item.key}.body`));
        // @ts-ignore
        [t, t, t, t, ENGINEERING,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "doc-links" },
    });
    /** @type {__VLS_StyleScopedClasses['doc-links']} */ ;
    let __VLS_36;
    /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
    RouterLink;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
        // @ts-ignore
        to: "/docs/tech-tree", ...{ class: "doc-link" },
    }));
    const __VLS_38 = __VLS_37({
        to: "/docs/tech-tree",
        ...{ class: "doc-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    /** @type {__VLS_StyleScopedClasses['doc-link']} */ ;
    var __VLS_39;
    const { default: __VLS_41 } = __VLS_nonNull(__VLS_39.slots);
    (__VLS_unwrap(t, {})('showcase.engineering.techTreeLink'));
    // @ts-ignore
    [t,];
    let __VLS_42;
    /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
    RouterLink;
    // @ts-ignore
    const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({
        // @ts-ignore
        to: "/docs/tiles", ...{ class: "doc-link" },
    }));
    const __VLS_44 = __VLS_43({
        to: "/docs/tiles",
        ...{ class: "doc-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_43));
    /** @type {__VLS_StyleScopedClasses['doc-link']} */ ;
    var __VLS_45;
    const { default: __VLS_47 } = __VLS_nonNull(__VLS_45.slots);
    (__VLS_unwrap(t, {})('showcase.engineering.tileDocsLink'));
    // @ts-ignore
    [t,];
    __VLS_asFunctionalElement1(__VLS_intrinsics.footer, __VLS_intrinsics.footer)({
        ...{ class: "footer" },
    });
    /** @type {__VLS_StyleScopedClasses['footer']} */ ;
    let __VLS_48;
    /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
    RouterLink;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
        // @ts-ignore
        to: "/docs", ...{ class: "footer-link" },
    }));
    const __VLS_50 = __VLS_49({
        to: "/docs",
        ...{ class: "footer-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    /** @type {__VLS_StyleScopedClasses['footer-link']} */ ;
    var __VLS_51;
    const { default: __VLS_53 } = __VLS_nonNull(__VLS_51.slots);
    (__VLS_unwrap(t, {})('showcase.footer.docs'));
    // @ts-ignore
    [t,];
    let __VLS_54;
    /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
    RouterLink;
    // @ts-ignore
    const __VLS_55 = __VLS_asFunctionalComponent1(__VLS_54, new __VLS_54({
        // @ts-ignore
        to: "/impressum", ...{ class: "footer-link" },
    }));
    const __VLS_56 = __VLS_55({
        to: "/impressum",
        ...{ class: "footer-link" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_55));
    /** @type {__VLS_StyleScopedClasses['footer-link']} */ ;
    var __VLS_57;
    const { default: __VLS_59 } = __VLS_nonNull(__VLS_57.slots);
    (__VLS_unwrap(t, {})('showcase.footer.impressum'));
    // @ts-ignore
    [t,];
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (goPlay) },
        type: "button",
        ...{ class: "footer-link footer-play" },
    });
    /** @type {__VLS_StyleScopedClasses['footer-link']} */ ;
    /** @type {__VLS_StyleScopedClasses['footer-play']} */ ;
    (__VLS_unwrap(t, {})('showcase.footer.play'));
    // @ts-ignore
    [t,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
