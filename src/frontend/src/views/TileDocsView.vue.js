/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import AtlasSprite from '../components/AtlasSprite.vue';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsPicker from '../components/docs/DocsPicker.vue';
import DocsTileEntry from '../components/docs/DocsTileEntry.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import { coastalWaterArt, riverArt, terrainArt, terrainArtByFamily, terrainVariantArt, } from '../lib/map/buildingArt';
const catalogue = useBuildingCatalogueStore();
const { t, te, d } = useI18n({ useScope: 'global' });
onMounted(() => catalogue.load());
// A river shape has no `Terrain`/`AllowedTerrain` entry of its own — its art
// fully replaces whatever land it flows over (see WorldModel's `river`
// rendering branch) — so it gets one entry with a shape picker below rather
// than being folded into the terrain list.
const RIVER_SHAPES = ['spring', 'straight', 'bend', 'bend60', 'confluence'];
const riverShape = ref('straight');
// The pack shipped alternate art for four of the five shapes above — not a
// different connectivity, just a different picture for the same crossing
// (VanDooProject/3d_assets' asset-inventory.md: "the number in these names
// is the family's turn-through angle... not the shape of its own channel").
// `Confluence` is the one exception: `ywide` is a genuinely different
// junction (three arms 120° apart each) rather than a reskin of `y_narrow`'s
// asymmetric one — still offered as a "look" here for a consistent picker,
// but see routing.ts's `confluenceOrientationOf` for where that distinction
// actually matters (which real in-game confluences each family can render).
const RIVER_LOOKS = {
    straight: [
        { id: 'plain', family: 'rivertile', labelKey: 'docs.tiles.riverLooks.plain' },
        { id: 'island', family: 'rivertile_bend180_island', labelKey: 'docs.tiles.riverLooks.island' },
        { id: 'meander', family: 'rivertile_bend180_meander', labelKey: 'docs.tiles.riverLooks.meander' },
    ],
    bend: [
        { id: 'plain', family: 'rivertile_bend', labelKey: 'docs.tiles.riverLooks.plain' },
        { id: 'island', family: 'rivertile_bend120_island', labelKey: 'docs.tiles.riverLooks.island' },
        { id: 'meander', family: 'rivertile_bend120_meander', labelKey: 'docs.tiles.riverLooks.meander' },
    ],
    bend60: [
        { id: 'plain', family: 'rivertile_bend60', labelKey: 'docs.tiles.riverLooks.plain' },
        { id: 'loop', family: 'rivertile_bend60_loop', labelKey: 'docs.tiles.riverLooks.loop' },
    ],
    confluence: [
        { id: 'narrow', family: 'rivertile_y_narrow', labelKey: 'docs.tiles.riverLooks.narrow' },
        { id: 'wide', family: 'rivertile_ywide', labelKey: 'docs.tiles.riverLooks.wide' },
    ],
};
const riverLook = ref('');
function riverLooksFor(shape) {
    return RIVER_LOOKS[shape] ?? [];
}
function selectedRiverLookId(shape) {
    return riverLook.value || riverLooksFor(shape)[0]?.id || '';
}
const riverShapeArt = computed(() => {
    const looks = riverLooksFor(riverShape.value);
    if (looks.length > 0) {
        const look = looks.find((l) => l.id === selectedRiverLookId(riverShape.value)) ?? looks[0];
        return terrainArtByFamily(look.family);
    }
    return riverArt(riverShape.value);
});
// The pack carves a mountain hex into one of three landforms (plus the
// plain, undecorated look `terrainArt('mountain')` otherwise shows) — same
// idea as the river shape picker above, and the same landform names the
// Quarry building's own variant picker offers (TechTreeView.vue), since a
// Quarry's art sits on top of one of these.
const MOUNTAIN_VARIANTS = ['plain', 'corrie', 'saddleback', 'table'];
const MOUNTAIN_FAMILY = {
    plain: 'mountaintile',
    corrie: 'mountaintile_corrie',
    saddleback: 'mountaintile_saddleback',
    table: 'mountaintile_table',
};
const mountainVariant = ref('plain');
const mountainVariantArt = computed(() => terrainArtByFamily(MOUNTAIN_FAMILY[mountainVariant.value]));
// The sand tile's decorated looks (VanDooProject/3d_assets'
// scripts/build_sandtile.py, variant000-007), picked the same way as
// Mountain's landforms.
const SAND_LOOKS = [
    { id: 'plain', variant: null },
    { id: 'dunes', variant: 0 },
    { id: 'driftwood', variant: 1 },
    { id: 'driftwoodPile', variant: 7 },
    { id: 'boulders', variant: 2 },
    { id: 'wreck', variant: 3 },
    { id: 'whaleBones', variant: 4 },
    { id: 'boat', variant: 5 },
    { id: 'sandCastle', variant: 6 },
];
const sandLook = ref('plain');
const sandLookArt = computed(() => {
    const look = SAND_LOOKS.find((l) => l.id === sandLook.value);
    return look.variant === null ? terrainArt('sand') : terrainVariantArt('sandtile', look.variant);
});
// Generation rules mirror WorldGenerationOptions' documented defaults
// (BeachThreshold, MountainThreshold, ForestRockiness, MountainRockiness) —
// see that file for the exact fractions if a world overrides them.
// A computed so the art fills in once the atlas manifests arrive (fetched lazily).
const TILES = computed(() => [
    { id: 'sea', art: terrainArt('sea'), terrain: 'sea' },
    { id: 'coastal-water', art: coastalWaterArt(), terrain: null, coastal: true },
    { id: 'sand', art: terrainArt('sand'), terrain: 'sand', sand: true },
    { id: 'grass', art: terrainArt('grass'), terrain: 'grass' },
    { id: 'forest', art: terrainArt('forest'), terrain: 'forest' },
    { id: 'mountain', art: terrainArt('mountain'), terrain: 'mountain', mountain: true },
    { id: 'river', art: riverArt('straight'), terrain: null, river: true },
]);
/** The picture a tile's card shows — the river/mountain/sand entries swap in whichever shape/landform/look is picked, everything else is static. */
function thumbArt(tile) {
    if (tile.river)
        return riverShapeArt.value;
    if (tile.mountain)
        return mountainVariantArt.value;
    if (tile.sand)
        return sandLookArt.value;
    return tile.art;
}
function thumbFrame(tile) {
    const art = thumbArt(tile);
    return art.kind === 'atlas' ? art.frame : null;
}
function thumbUrl(tile) {
    const art = thumbArt(tile);
    return art.kind === 'png' ? art.url : null;
}
// `docs.tiles.entries.*` keys are camelCase (existing JSON convention),
// while tile ids stay kebab-case for URL anchors — e.g. 'coastal-water'.
function tileEntryKey(id) {
    return id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
function typeLabel(type) {
    const key = `docs.buildingTypes.${type}`;
    return te(key) ? t(key) : type.charAt(0).toUpperCase() + type.slice(1);
}
const buildingsByTile = computed(() => {
    const result = {};
    for (const tile of TILES.value) {
        result[tile.id] = catalogue.types
            .filter((type) => {
            const def = catalogue.byType[type]?.[0];
            // A building that can no longer be placed (the Quarry) is no longer something to build on this ground.
            if (!def || def.newPlacementDisabled)
                return false;
            if (tile.coastal)
                return def.requiresCoastalWater;
            if (def.requiresCoastalWater || tile.terrain === null)
                return false;
            return def.allowedTerrain.length === 0 || def.allowedTerrain.includes(tile.terrain);
        })
            .map(typeLabel);
    }
    return result;
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(catalogue, {});
    __VLS_withDotValue(TILES, {});
    __VLS_withDotValue(buildingsByTile, {});
    __VLS_withDotValue(RIVER_SHAPES, {});
    __VLS_withDotValue(riverShape, {});
    __VLS_withDotValue(riverLook, {});
    __VLS_withDotValue(MOUNTAIN_VARIANTS, {});
    __VLS_withDotValue(mountainVariant, {});
    __VLS_withDotValue(SAND_LOOKS, {});
    __VLS_withDotValue(sandLook, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['tile-docs']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "tile-docs" }, title: (__VLS_ctx.$t('docs.tiles.title')), caption: "DOCS · TILES", intro: (__VLS_ctx.$t('docs.tiles.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "tile-docs" },
        title: (__VLS_ctx.$t('docs.tiles.title')),
        caption: "DOCS · TILES",
        intro: (__VLS_ctx.$t('docs.tiles.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['tile-docs']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
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
    const __VLS_6 = DocsToc;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        links: (TILES.value.map((tile) => ({ href: `#${tile.id}`, label: __VLS_unwrap(t, {})(`docs.tiles.entries.${tileEntryKey(tile.id)}.title`) }))),
    }));
    const __VLS_8 = __VLS_7({
        links: (TILES.value.map((tile) => ({ href: `#${tile.id}`, label: __VLS_unwrap(t, {})(`docs.tiles.entries.${tileEntryKey(tile.id)}.title`) }))),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    const __VLS_11 = __VLS_tryAsConstant((TILES.value));
    for (const [tile] of __VLS_vFor(__VLS_nonNull(__VLS_11))) {
        const __VLS_12 = DocsTileEntry || DocsTileEntry;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
            // @ts-ignore
            id: (tile.id), key: (tile.id), title: (__VLS_unwrap(t, {})(`docs.tiles.entries.${tileEntryKey(tile.id)}.title`)),
        }));
        const __VLS_14 = __VLS_13({
            id: (tile.id),
            key: (tile.id),
            title: (__VLS_unwrap(t, {})(`docs.tiles.entries.${tileEntryKey(tile.id)}.title`)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        var __VLS_15;
        const { default: __VLS_17 } = __VLS_nonNull(__VLS_15.slots);
        {
            const { thumb: __VLS_18 } = __VLS_nonNull(__VLS_15.slots);
            if (thumbFrame(tile)) {
                const __VLS_19 = AtlasSprite;
                // @ts-ignore
                const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
                    // @ts-ignore
                    frame: (thumbFrame(tile)),
                }));
                const __VLS_21 = __VLS_20({
                    frame: (thumbFrame(tile)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_20));
            }
            else if (thumbUrl(tile)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.img)({
                    ...{ class: "thumb-img" },
                    src: (thumbUrl(tile)),
                    alt: "",
                });
                /** @type {__VLS_StyleScopedClasses['thumb-img']} */ ;
            }
            // @ts-ignore
            [$t, $t, $t, $t, $t, catalogue, catalogue, catalogue, catalogue, catalogue, catalogue, d, TILES, TILES, t, t,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "lore" },
        });
        /** @type {__VLS_StyleScopedClasses['lore']} */ ;
        (__VLS_unwrap(t, {})(`docs.tiles.entries.${tileEntryKey(tile.id)}.lore`));
        const __VLS_24 = DocsAdminNote || DocsAdminNote;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
        // @ts-ignore
        }));
        const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
        var __VLS_27;
        const { default: __VLS_29 } = __VLS_nonNull(__VLS_27.slots);
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "generation" },
        });
        /** @type {__VLS_StyleScopedClasses['generation']} */ ;
        (__VLS_ctx.$t('docs.tiles.generation'));
        (__VLS_unwrap(t, {})(`docs.tiles.entries.${tileEntryKey(tile.id)}.generation`));
        // @ts-ignore
        [$t, t, t,];
        if (tile.river) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "buildings" },
            });
            /** @type {__VLS_StyleScopedClasses['buildings']} */ ;
            (__VLS_ctx.$t('docs.tiles.riverSawmillNote'));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "buildings" },
            });
            /** @type {__VLS_StyleScopedClasses['buildings']} */ ;
            (__VLS_ctx.$t('docs.tiles.buildings'));
            if (buildingsByTile.value[tile.id]?.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (buildingsByTile.value[tile.id].join(', '));
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (__VLS_ctx.$t('docs.tiles.none'));
            }
        }
        {
            const { pickers: __VLS_30 } = __VLS_nonNull(__VLS_15.slots);
            if (tile.river) {
                const __VLS_31 = DocsPicker;
                // @ts-ignore
                const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
                    // @ts-ignore
                    ...{ 'onUpdate:modelValue': {} }, label: (__VLS_ctx.$t('docs.tiles.riverVariants')), options: (RIVER_SHAPES.value.map((shape) => ({ value: shape, label: __VLS_unwrap(t, {})(`docs.tiles.riverShapes.${shape}`) }))), modelValue: (riverShape.value),
                }));
                const __VLS_33 = __VLS_32({
                    ...{ 'onUpdate:modelValue': {} },
                    label: (__VLS_ctx.$t('docs.tiles.riverVariants')),
                    options: (RIVER_SHAPES.value.map((shape) => ({ value: shape, label: __VLS_unwrap(t, {})(`docs.tiles.riverShapes.${shape}`) }))),
                    modelValue: (riverShape.value),
                }, ...__VLS_functionalComponentArgsRest(__VLS_32));
                let __VLS_36;
                const __VLS_37 = {
                    /** @type {typeof __VLS_36.'update:modelValue'} */
                    'onUpdate:modelValue': (...[$event]) => {
                        void $event;
                        if (!(tile.river))
                            throw 0;
                        riverShape.value = $event;
                        riverLook.value = '';
                        ;
                        // @ts-ignore
                        [$t, $t, $t, $t, t, buildingsByTile, buildingsByTile, RIVER_SHAPES, riverShape, riverShape, riverLook,];
                    },
                };
                void __VLS_37;
                var __VLS_34;
                var __VLS_35;
            }
            if (tile.river && riverLooksFor(riverShape.value).length > 0) {
                const __VLS_38 = DocsPicker;
                // @ts-ignore
                const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
                    // @ts-ignore
                    ...{ 'onUpdate:modelValue': {} }, label: (__VLS_ctx.$t('docs.tiles.riverLookLabel')), options: (riverLooksFor(riverShape.value).map((look) => ({ value: look.id, label: __VLS_unwrap(t, {})(look.labelKey) }))), modelValue: (selectedRiverLookId(riverShape.value)),
                }));
                const __VLS_40 = __VLS_39({
                    ...{ 'onUpdate:modelValue': {} },
                    label: (__VLS_ctx.$t('docs.tiles.riverLookLabel')),
                    options: (riverLooksFor(riverShape.value).map((look) => ({ value: look.id, label: __VLS_unwrap(t, {})(look.labelKey) }))),
                    modelValue: (selectedRiverLookId(riverShape.value)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_39));
                let __VLS_43;
                const __VLS_44 = {
                    /** @type {typeof __VLS_43.'update:modelValue'} */
                    'onUpdate:modelValue': (...[$event]) => {
                        void $event;
                        if (!(tile.river && riverLooksFor(riverShape.value).length > 0))
                            throw 0;
                        return (riverLook.value = $event);
                        // @ts-ignore
                        [$t, t, riverShape, riverShape, riverShape, riverLook,];
                    },
                };
                void __VLS_44;
                var __VLS_41;
                var __VLS_42;
            }
            if (tile.mountain) {
                const __VLS_45 = DocsPicker;
                // @ts-ignore
                const __VLS_46 = __VLS_asFunctionalComponent1(__VLS_45, new __VLS_45({
                    // @ts-ignore
                    ...{ 'onUpdate:modelValue': {} }, label: (__VLS_ctx.$t('docs.tiles.mountainVariants')), options: (MOUNTAIN_VARIANTS.value.map((variant) => ({ value: variant, label: __VLS_unwrap(t, {})(`docs.tiles.mountainLandforms.${variant}`), }))), modelValue: (mountainVariant.value),
                }));
                const __VLS_47 = __VLS_46({
                    ...{ 'onUpdate:modelValue': {} },
                    label: (__VLS_ctx.$t('docs.tiles.mountainVariants')),
                    options: (MOUNTAIN_VARIANTS.value.map((variant) => ({
                        value: variant,
                        label: __VLS_unwrap(t, {})(`docs.tiles.mountainLandforms.${variant}`),
                    }))),
                    modelValue: (mountainVariant.value),
                }, ...__VLS_functionalComponentArgsRest(__VLS_46));
                let __VLS_50;
                const __VLS_51 = {
                    /** @type {typeof __VLS_50.'update:modelValue'} */
                    'onUpdate:modelValue': (...[$event]) => {
                        void $event;
                        if (!(tile.mountain))
                            throw 0;
                        return (mountainVariant.value = $event);
                        // @ts-ignore
                        [$t, t, MOUNTAIN_VARIANTS, mountainVariant, mountainVariant,];
                    },
                };
                void __VLS_51;
                var __VLS_48;
                var __VLS_49;
            }
            if (tile.sand) {
                const __VLS_52 = DocsPicker;
                // @ts-ignore
                const __VLS_53 = __VLS_asFunctionalComponent1(__VLS_52, new __VLS_52({
                    // @ts-ignore
                    ...{ 'onUpdate:modelValue': {} }, label: (__VLS_ctx.$t('docs.tiles.sandLookLabel')), options: (SAND_LOOKS.value.map((look) => ({ value: look.id, label: __VLS_unwrap(t, {})(`docs.tiles.sandLooks.${look.id}`) }))), modelValue: (sandLook.value),
                }));
                const __VLS_54 = __VLS_53({
                    ...{ 'onUpdate:modelValue': {} },
                    label: (__VLS_ctx.$t('docs.tiles.sandLookLabel')),
                    options: (SAND_LOOKS.value.map((look) => ({ value: look.id, label: __VLS_unwrap(t, {})(`docs.tiles.sandLooks.${look.id}`) }))),
                    modelValue: (sandLook.value),
                }, ...__VLS_functionalComponentArgsRest(__VLS_53));
                let __VLS_57;
                const __VLS_58 = {
                    /** @type {typeof __VLS_57.'update:modelValue'} */
                    'onUpdate:modelValue': (...[$event]) => {
                        void $event;
                        if (!(tile.sand))
                            throw 0;
                        return (sandLook.value = $event);
                        // @ts-ignore
                        [$t, t, SAND_LOOKS, sandLook, sandLook,];
                    },
                };
                void __VLS_58;
                var __VLS_55;
                var __VLS_56;
            }
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
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
