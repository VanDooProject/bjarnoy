/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import DocsPageLayout from "../components/docs/DocsPageLayout.vue";
import AtlasSprite from "../components/AtlasSprite.vue";
import WastedIsland from "../components/docs/WastedIsland.vue";
import UtgardExample from "../components/docs/UtgardExample.vue";
import DocsAdminNote from "../components/docs/DocsAdminNote.vue";
import AnimatedGiant from "../components/docs/AnimatedGiant.vue";
import AnimationPausedNote from "../components/docs/AnimationPausedNote.vue";
import { findAtlasFrame } from "../lib/map/atlas";
import { giantFamilyHasClip } from "../lib/docs/wastedIsland";
import { TILE_ORIENTATIONS } from "../lib/map/types";
const { t, locale } = useI18n({
    useScope: "global",
});
function showcase(name) {
    return findAtlasFrame("showcase", name);
}
// AtlasSprite fills its box's width and keeps its aspect ratio only until
// `max-height` clamps it: in a fixed-height box a frame taller than the box
// is then squeezed vertically but keeps the full width, and reads as
// stretched. Capping the width at what the box height allows keeps it
// contained. `boxHeight` is the box's inner height in px.
const GIANT_BOX_H = 318;
const DEFENCE_BOX_H = 238;
const THUMB_BOX_H = 148;
function fit(frame, boxHeight) {
    if (!frame)
        return undefined;
    return {
        width: `min(100%, ${(boxHeight * frame.frame.w) / frame.frame.h}px)`,
    };
}
// --- Giants -------------------------------------------------------------
const utgardCamera = ref("SE");
const volcanoCamera = ref("SE");
const utgardFrame = computed(() => showcase(`giantutgard_${utgardCamera.value}_level000`));
const volcanoFrame = computed(() => showcase(`giantvolcano_wasted_${volcanoCamera.value}_level000`));
// A card's animated composite only replaces the static showcase frame when
// its wasted top-part family actually has `buildings-anim` clips for the
// selected camera — today just the volcano (`giantvolcano_wasted`); the
// wasted Utgard ruin (`giantutgard`) has none, so its card stays a plain
// frame. Derived from the atlas itself rather than hardcoded per card, so a
// future art drop picks this up automatically. Loops continuously, the way
// the same clips play on the in-game map.
const utgardHasAnim = computed(() => giantFamilyHasClip("giantutgard", utgardCamera.value));
const volcanoHasAnim = computed(() => giantFamilyHasClip("giantvolcano_wasted", volcanoCamera.value));
const PAIRS = [
    {
        kind: "grass",
        livingFamily: "grasstile",
        livingSuffixes: ["", "_variant000", "_variant001", "_variant002"],
        wastedFamily: "wasteland",
        wastedSuffixes: [
            "",
            "_variant001",
            "_variant002",
            "_variant003",
            "_variant004",
            "_variant005",
        ],
    },
    {
        kind: "forest",
        livingFamily: "foresttile",
        livingSuffixes: ["", "_variant000", "_variant001"],
        wastedFamily: "deadforest",
        wastedSuffixes: ["", "_variant001"],
    },
    {
        kind: "sand",
        livingFamily: "sandtile",
        wastedFamily: "blacksand",
        wastedSuffixes: ["", "_variant001"],
    },
    {
        kind: "mountain",
        livingFamily: "mountaintile",
        wastedFamily: "mountaintile_jagged",
        wastedSuffixes: [""],
        level000: true,
    },
    {
        kind: "coast",
        livingFamily: "coastalwatertile",
        livingSuffixes: ["", "_variant000", "_variant001"],
        wastedFamily: "blacksandcoast",
        wastedSuffixes: ["", "_variant000", "_variant001", "_variant002"],
    },
    {
        kind: "sea",
        livingFamily: "watertile",
        wastedFamily: "taintedwater",
        wastedSuffixes: [""],
    },
];
const variantIndex = reactive({
    grass: 0,
    forest: 0,
    sand: 0,
    mountain: 0,
    coast: 0,
    sea: 0,
});
function pairLivingFrame(pair) {
    const looks = pair.livingSuffixes ?? [""];
    const suffix = looks[variantIndex[pair.kind] % looks.length] ?? "";
    return showcase(`${pair.livingFamily}_SE${pair.level000 ? "_level000" : ""}${suffix}`);
}
function pairWastedFrame(pair) {
    const suffix = pair.wastedSuffixes[variantIndex[pair.kind]] ?? "";
    return showcase(`${pair.wastedFamily}_SE${pair.level000 ? "_level000" : ""}${suffix}`);
}
const RIVER_SHAPE_FRAMES = {
    straight: { living: "rivertile_SE", wasted: "lavastream_SE" },
    bend: { living: "rivertile_bend_SE", wasted: "lavastream_bend_SE" },
    bend60: { living: "rivertile_bend60_SE", wasted: "lavastream_bend60_SE" },
    spring: {
        living: "mountaintile_corrie_spring_SE",
        wasted: "mountaintile_volcano_lavaspring_flows_SE_level000",
    },
};
const riverShape = ref("straight");
const riverLivingFrame = computed(() => showcase(RIVER_SHAPE_FRAMES[riverShape.value].living));
const riverWastedFrame = computed(() => showcase(RIVER_SHAPE_FRAMES[riverShape.value].wasted));
// --- Defences ------------------------------------------------------------
const DEFENCE_LEVELS = [0, 1, 2];
const WALL_PIECES = [
    { id: "straight", family: "utgardwall_straight180" },
    { id: "gate", family: "utgardwall_gate180" },
    { id: "bend120", family: "utgardwall_bend120" },
    { id: "bend60", family: "utgardwall_bend60" },
    { id: "end", family: "utgardwall_end" },
    { id: "endCoast", family: "utgardwall_end_coast" },
];
const towerLevel = ref(2);
const wallLevel = ref(2);
const wallPiece = ref("straight");
const towerFrame = computed(() => showcase(`jotunwatchtower_SE_level00${towerLevel.value}`));
const wallFrame = computed(() => {
    const family = WALL_PIECES.find((p) => p.id === wallPiece.value).family;
    return showcase(`${family}_SE_level00${wallLevel.value}`);
});
// --- Endgame (docs/design/endgame.md) -------------------------------------
const ENDGAME_RULES = [
    "fullBattles",
    "towers",
    "assault",
    "grace",
    "holding",
    "loot",
    "aggression",
    "walls",
    "breaching",
    "wallPace",
    "ram",
    "gateRule",
    "winning",
    "ageEnd",
];
const JOTUNN_TIERS = [
    { id: "thrall", attack: 20, defense: 40 },
    { id: "warrior", attack: 120, defense: 150 },
    { id: "chieftain", attack: 300, defense: 400 },
];
/** Garrison counts in `JOTUNN_TIERS` order. */
const JOTUNN_SITES = [
    { id: "watchtower", garrison: [40, 15, 2], guardRange: 5, regrowthHours: 24 },
    { id: "utgard", garrison: [300, 120, 20], guardRange: 8, regrowthHours: 48 },
];
function defensePower(garrison) {
    return garrison.reduce((sum, count, i) => sum + count * JOTUNN_TIERS[i].defense, 0);
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(utgardHasAnim, {});
    __VLS_withDotValue(utgardFrame, {});
    __VLS_withDotValue(utgardCamera, {});
    __VLS_withDotValue(volcanoHasAnim, {});
    __VLS_withDotValue(volcanoFrame, {});
    __VLS_withDotValue(volcanoCamera, {});
    __VLS_withDotValue(towerFrame, {});
    __VLS_withDotValue(towerLevel, {});
    __VLS_withDotValue(wallFrame, {});
    __VLS_withDotValue(wallPiece, {});
    __VLS_withDotValue(wallLevel, {});
    __VLS_withDotValue(PAIRS, {});
    __VLS_withDotValue(variantIndex, {});
    __VLS_withDotValue(riverLivingFrame, {});
    __VLS_withDotValue(riverWastedFrame, {});
    __VLS_withDotValue(riverShape, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['giant-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['endgame-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['endgame-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['endgame-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['endgame-table']} */ ;
    /** @type {__VLS_StyleScopedClasses['defences-section']} */ ;
    /** @type {__VLS_StyleScopedClasses['giants-section']} */ ;
    /** @type {__VLS_StyleScopedClasses['giant-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['pair-row']} */ ;
    /** @type {__VLS_StyleScopedClasses['variants']} */ ;
    /** @type {__VLS_StyleScopedClasses['variants-label']} */ ;
    /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
    /** @type {__VLS_StyleScopedClasses['breadcrumb']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "wasted-lands" }, title: (__VLS_ctx.$t('docs.wastedLands.title')), caption: "DOCS · WASTED LANDS", intro: (__VLS_ctx.$t('docs.wastedLands.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "wasted-lands" },
        title: (__VLS_ctx.$t('docs.wastedLands.title')),
        caption: "DOCS · WASTED LANDS",
        intro: (__VLS_ctx.$t('docs.wastedLands.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['wasted-lands']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "lore",
        ...{ class: "lore-section" },
    });
    /** @type {__VLS_StyleScopedClasses['lore-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t("docs.wastedLands.lore.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "saga" },
    });
    /** @type {__VLS_StyleScopedClasses['saga']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.lore.p1"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "saga" },
    });
    /** @type {__VLS_StyleScopedClasses['saga']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.lore.p2"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "saga" },
    });
    /** @type {__VLS_StyleScopedClasses['saga']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.lore.p3"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "saga" },
    });
    /** @type {__VLS_StyleScopedClasses['saga']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.lore.p4"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "caption-note" },
    });
    /** @type {__VLS_StyleScopedClasses['caption-note']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.lore.caption"));
    const __VLS_6 = AnimationPausedNote;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    // @ts-ignore
    }));
    const __VLS_8 = __VLS_7({}, ...__VLS_functionalComponentArgsRest(__VLS_7));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "giants",
        ...{ class: "giants-section" },
    });
    /** @type {__VLS_StyleScopedClasses['giants-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "giant-card" },
    });
    /** @type {__VLS_StyleScopedClasses['giant-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t("docs.wastedLands.utgard.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t("docs.wastedLands.utgard.body"));
    const __VLS_11 = DocsAdminNote || DocsAdminNote;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
    // @ts-ignore
    }));
    const __VLS_13 = __VLS_12({}, ...__VLS_functionalComponentArgsRest(__VLS_12));
    var __VLS_14;
    const { default: __VLS_16 } = __VLS_nonNull(__VLS_14.slots);
    (__VLS_ctx.$t("docs.wastedLands.utgard.techNote"));
    // @ts-ignore
    [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t,];
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "giant-box" },
    });
    /** @type {__VLS_StyleScopedClasses['giant-box']} */ ;
    if (utgardHasAnim.value) {
        const __VLS_17 = AnimatedGiant;
        // @ts-ignore
        const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
            // @ts-ignore
            family: "giantutgard", topCategory: "buildings-static", plateFamily: "wasteland", orientation: (utgardCamera.value),
        }));
        const __VLS_19 = __VLS_18({
            family: "giantutgard",
            topCategory: "buildings-static",
            plateFamily: "wasteland",
            orientation: (utgardCamera.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    }
    else if (utgardFrame.value) {
        const __VLS_22 = AtlasSprite;
        // @ts-ignore
        const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
            // @ts-ignore
            frame: (utgardFrame.value), ...{ style: (fit(utgardFrame.value, __VLS_unwrap(GIANT_BOX_H, {}))) },
        }));
        const __VLS_24 = __VLS_23({
            frame: (utgardFrame.value),
            ...{ style: (fit(utgardFrame.value, __VLS_unwrap(GIANT_BOX_H, {}))) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "camera-pills" },
    });
    /** @type {__VLS_StyleScopedClasses['camera-pills']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "variants-label" },
    });
    /** @type {__VLS_StyleScopedClasses['variants-label']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.utgard.camera"));
    const __VLS_27 = __VLS_tryAsConstant((__VLS_unwrap(TILE_ORIENTATIONS, {})));
    for (const [cam] of __VLS_vFor(__VLS_nonNull(__VLS_27))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (utgardCamera.value = cam);
                    // @ts-ignore
                    [$t, utgardHasAnim, utgardCamera, utgardCamera, utgardFrame, utgardFrame, utgardFrame, GIANT_BOX_H, TILE_ORIENTATIONS,];
                } },
            key: (cam),
            type: "button",
            ...{ class: "variant-button" },
            ...{ class: ({ active: utgardCamera.value === cam }) },
        });
        /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (cam);
        // @ts-ignore
        [utgardCamera,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "giant-card" },
    });
    /** @type {__VLS_StyleScopedClasses['giant-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t("docs.wastedLands.volcano.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t("docs.wastedLands.volcano.body"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "giant-box" },
    });
    /** @type {__VLS_StyleScopedClasses['giant-box']} */ ;
    if (volcanoHasAnim.value) {
        const __VLS_28 = AnimatedGiant;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({
            // @ts-ignore
            family: "giantvolcano_wasted", topCategory: "terrain", plateFamily: "wasteland", orientation: (volcanoCamera.value),
        }));
        const __VLS_30 = __VLS_29({
            family: "giantvolcano_wasted",
            topCategory: "terrain",
            plateFamily: "wasteland",
            orientation: (volcanoCamera.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    }
    else if (volcanoFrame.value) {
        const __VLS_33 = AtlasSprite;
        // @ts-ignore
        const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
            // @ts-ignore
            frame: (volcanoFrame.value), ...{ style: (fit(volcanoFrame.value, __VLS_unwrap(GIANT_BOX_H, {}))) },
        }));
        const __VLS_35 = __VLS_34({
            frame: (volcanoFrame.value),
            ...{ style: (fit(volcanoFrame.value, __VLS_unwrap(GIANT_BOX_H, {}))) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "camera-pills" },
    });
    /** @type {__VLS_StyleScopedClasses['camera-pills']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "variants-label" },
    });
    /** @type {__VLS_StyleScopedClasses['variants-label']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.utgard.camera"));
    const __VLS_38 = __VLS_tryAsConstant((__VLS_unwrap(TILE_ORIENTATIONS, {})));
    for (const [cam] of __VLS_vFor(__VLS_nonNull(__VLS_38))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (volcanoCamera.value = cam);
                    // @ts-ignore
                    [$t, $t, $t, GIANT_BOX_H, TILE_ORIENTATIONS, volcanoHasAnim, volcanoCamera, volcanoCamera, volcanoFrame, volcanoFrame, volcanoFrame,];
                } },
            key: (cam),
            type: "button",
            ...{ class: "variant-button" },
            ...{ class: ({ active: volcanoCamera.value === cam }) },
        });
        /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (cam);
        // @ts-ignore
        [volcanoCamera,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "defences",
        ...{ class: "defences-section" },
    });
    /** @type {__VLS_StyleScopedClasses['defences-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t("docs.wastedLands.defences.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t("docs.wastedLands.defences.body"));
    const __VLS_39 = UtgardExample;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent1(__VLS_39, new __VLS_39({
    // @ts-ignore
    }));
    const __VLS_41 = __VLS_40({}, ...__VLS_functionalComponentArgsRest(__VLS_40));
    const __VLS_44 = DocsAdminNote || DocsAdminNote;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent1(__VLS_44, new __VLS_44({
    // @ts-ignore
    }));
    const __VLS_46 = __VLS_45({}, ...__VLS_functionalComponentArgsRest(__VLS_45));
    var __VLS_47;
    const { default: __VLS_49 } = __VLS_nonNull(__VLS_47.slots);
    (__VLS_ctx.$t("docs.wastedLands.defences.wallsTechNote"));
    // @ts-ignore
    [$t, $t, $t,];
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "giants-section" },
    });
    /** @type {__VLS_StyleScopedClasses['giants-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "giant-card" },
    });
    /** @type {__VLS_StyleScopedClasses['giant-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.$t("docs.wastedLands.defences.watchtower.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t("docs.wastedLands.defences.watchtower.body"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "giant-box defence-box" },
    });
    /** @type {__VLS_StyleScopedClasses['giant-box']} */ ;
    /** @type {__VLS_StyleScopedClasses['defence-box']} */ ;
    if (towerFrame.value) {
        const __VLS_50 = AtlasSprite;
        // @ts-ignore
        const __VLS_51 = __VLS_asFunctionalComponent1(__VLS_50, new __VLS_50({
            // @ts-ignore
            frame: (towerFrame.value), ...{ style: (fit(towerFrame.value, __VLS_unwrap(DEFENCE_BOX_H, {}))) },
        }));
        const __VLS_52 = __VLS_51({
            frame: (towerFrame.value),
            ...{ style: (fit(towerFrame.value, __VLS_unwrap(DEFENCE_BOX_H, {}))) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_51));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "camera-pills" },
    });
    /** @type {__VLS_StyleScopedClasses['camera-pills']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "variants-label" },
    });
    /** @type {__VLS_StyleScopedClasses['variants-label']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.defences.level"));
    const __VLS_55 = __VLS_tryAsConstant((__VLS_unwrap(DEFENCE_LEVELS, {})));
    for (const [level] of __VLS_vFor(__VLS_nonNull(__VLS_55))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (towerLevel.value = level);
                    // @ts-ignore
                    [$t, $t, $t, towerFrame, towerFrame, towerFrame, DEFENCE_BOX_H, DEFENCE_LEVELS, towerLevel,];
                } },
            key: (level),
            type: "button",
            ...{ class: "variant-button" },
            ...{ class: ({ active: towerLevel.value === level }) },
        });
        /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (level + 1);
        // @ts-ignore
        [towerLevel,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "giant-card" },
    });
    /** @type {__VLS_StyleScopedClasses['giant-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.$t("docs.wastedLands.defences.walls.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t("docs.wastedLands.defences.walls.body"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "giant-box defence-box" },
    });
    /** @type {__VLS_StyleScopedClasses['giant-box']} */ ;
    /** @type {__VLS_StyleScopedClasses['defence-box']} */ ;
    if (wallFrame.value) {
        const __VLS_56 = AtlasSprite;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent1(__VLS_56, new __VLS_56({
            // @ts-ignore
            frame: (wallFrame.value), ...{ style: (fit(wallFrame.value, __VLS_unwrap(DEFENCE_BOX_H, {}))) },
        }));
        const __VLS_58 = __VLS_57({
            frame: (wallFrame.value),
            ...{ style: (fit(wallFrame.value, __VLS_unwrap(DEFENCE_BOX_H, {}))) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "camera-pills" },
    });
    /** @type {__VLS_StyleScopedClasses['camera-pills']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "variants-label" },
    });
    /** @type {__VLS_StyleScopedClasses['variants-label']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.defences.walls.piece"));
    const __VLS_61 = __VLS_tryAsConstant((__VLS_unwrap(WALL_PIECES, {})));
    for (const [piece] of __VLS_vFor(__VLS_nonNull(__VLS_61))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (wallPiece.value = piece.id);
                    // @ts-ignore
                    [$t, $t, $t, DEFENCE_BOX_H, wallFrame, wallFrame, wallFrame, WALL_PIECES, wallPiece,];
                } },
            key: (piece.id),
            type: "button",
            ...{ class: "variant-button" },
            ...{ class: ({ active: wallPiece.value === piece.id }) },
        });
        /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (__VLS_unwrap(t, {})(`docs.wastedLands.defences.pieces.${piece.id}`));
        // @ts-ignore
        [wallPiece, t,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "camera-pills level-pills" },
    });
    /** @type {__VLS_StyleScopedClasses['camera-pills']} */ ;
    /** @type {__VLS_StyleScopedClasses['level-pills']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "variants-label" },
    });
    /** @type {__VLS_StyleScopedClasses['variants-label']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.defences.level"));
    const __VLS_62 = __VLS_tryAsConstant((__VLS_unwrap(DEFENCE_LEVELS, {})));
    for (const [level] of __VLS_vFor(__VLS_nonNull(__VLS_62))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (wallLevel.value = level);
                    // @ts-ignore
                    [$t, DEFENCE_LEVELS, wallLevel,];
                } },
            key: (level),
            type: "button",
            ...{ class: "variant-button" },
            ...{ class: ({ active: wallLevel.value === level }) },
        });
        /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (level + 1);
        // @ts-ignore
        [wallLevel,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "endgame",
        ...{ class: "endgame-section" },
    });
    /** @type {__VLS_StyleScopedClasses['endgame-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t("docs.wastedLands.endgame.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "caption-note" },
    });
    /** @type {__VLS_StyleScopedClasses['caption-note']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.endgame.status"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t("docs.wastedLands.endgame.body"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "endgame-rules" },
    });
    /** @type {__VLS_StyleScopedClasses['endgame-rules']} */ ;
    const __VLS_63 = __VLS_tryAsConstant((__VLS_unwrap(ENDGAME_RULES, {})));
    for (const [rule] of __VLS_vFor(__VLS_nonNull(__VLS_63))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            key: (rule),
        });
        (__VLS_ctx.$t(`docs.wastedLands.endgame.rules.${rule}`));
        // @ts-ignore
        [$t, $t, $t, $t, ENDGAME_RULES,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.$t("docs.wastedLands.endgame.tiers.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "endgame-table" },
    });
    /** @type {__VLS_StyleScopedClasses['endgame-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t("docs.wastedLands.endgame.tiers.tier"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t("docs.wastedLands.endgame.tiers.attack"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t("docs.wastedLands.endgame.tiers.defense"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_64 = __VLS_tryAsConstant((__VLS_unwrap(JOTUNN_TIERS, {})));
    for (const [tier] of __VLS_vFor(__VLS_nonNull(__VLS_64))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (tier.id),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.$t(`docs.wastedLands.endgame.tiers.${tier.id}`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (tier.attack);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (tier.defense);
        // @ts-ignore
        [$t, $t, $t, $t, $t, JOTUNN_TIERS,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_ctx.$t("docs.wastedLands.endgame.sites.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "endgame-table" },
    });
    /** @type {__VLS_StyleScopedClasses['endgame-table']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t("docs.wastedLands.endgame.sites.site"));
    const __VLS_65 = __VLS_tryAsConstant((__VLS_unwrap(JOTUNN_TIERS, {})));
    for (const [tier] of __VLS_vFor(__VLS_nonNull(__VLS_65))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            key: (tier.id),
        });
        (__VLS_ctx.$t(`docs.wastedLands.endgame.tiers.${tier.id}`));
        // @ts-ignore
        [$t, $t, $t, JOTUNN_TIERS,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t("docs.wastedLands.endgame.sites.defensePower"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t("docs.wastedLands.endgame.sites.guardRange"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t("docs.wastedLands.endgame.sites.regrowth"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_66 = __VLS_tryAsConstant((__VLS_unwrap(JOTUNN_SITES, {})));
    for (const [site] of __VLS_vFor(__VLS_nonNull(__VLS_66))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (site.id),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.$t(`docs.wastedLands.endgame.sites.${site.id}`));
        const __VLS_67 = __VLS_tryAsConstant((site.garrison));
        for (const [count, i] of __VLS_vFor(__VLS_nonNull(__VLS_67))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                key: (i),
            });
            (count);
            // @ts-ignore
            [$t, $t, $t, $t, JOTUNN_SITES,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (defensePower(site.garrison).toLocaleString(__VLS_unwrap(locale, {})));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (site.guardRange);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.$t("docs.wastedLands.endgame.sites.hours", {
            n: site.regrowthHours,
        }));
        // @ts-ignore
        [$t, locale,];
    }
    const __VLS_68 = DocsAdminNote || DocsAdminNote;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent1(__VLS_68, new __VLS_68({
        // @ts-ignore
        id: "island", as: "section", ...{ class: "island-section" },
    }));
    const __VLS_70 = __VLS_69({
        id: "island",
        as: "section",
        ...{ class: "island-section" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    /** @type {__VLS_StyleScopedClasses['island-section']} */ ;
    var __VLS_71;
    const { default: __VLS_73 } = __VLS_nonNull(__VLS_71.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t("docs.wastedLands.island.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t("docs.wastedLands.island.body"));
    const __VLS_74 = WastedIsland;
    // @ts-ignore
    const __VLS_75 = __VLS_asFunctionalComponent1(__VLS_74, new __VLS_74({
    // @ts-ignore
    }));
    const __VLS_76 = __VLS_75({}, ...__VLS_functionalComponentArgsRest(__VLS_75));
    // @ts-ignore
    [$t, $t,];
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "pairs",
        ...{ class: "pairs-section" },
    });
    /** @type {__VLS_StyleScopedClasses['pairs-section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t("docs.wastedLands.pairs.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t("docs.wastedLands.pairs.body"));
    const __VLS_79 = __VLS_tryAsConstant((PAIRS.value.slice(0, 3)));
    for (const [pair] of __VLS_vFor(__VLS_nonNull(__VLS_79))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (pair.kind),
            id: (`pair-${pair.kind}`),
            ...{ class: "pair-row" },
        });
        /** @type {__VLS_StyleScopedClasses['pair-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pair-thumbs" },
        });
        /** @type {__VLS_StyleScopedClasses['pair-thumbs']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "thumb-col" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb-col']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "thumb-caption" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb-caption']} */ ;
        (__VLS_ctx.$t("docs.wastedLands.pairs.living"));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "thumb floating-art" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
        /** @type {__VLS_StyleScopedClasses['floating-art']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "floating-art-shadow" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['floating-art-shadow']} */ ;
        if (pairLivingFrame(pair)) {
            const __VLS_80 = AtlasSprite;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent1(__VLS_80, new __VLS_80({
                // @ts-ignore
                frame: (pairLivingFrame(pair)), ...{ style: (fit(pairLivingFrame(pair), __VLS_unwrap(THUMB_BOX_H, {}))) },
            }));
            const __VLS_82 = __VLS_81({
                frame: (pairLivingFrame(pair)),
                ...{ style: (fit(pairLivingFrame(pair), __VLS_unwrap(THUMB_BOX_H, {}))) },
            }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "thumb-name" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb-name']} */ ;
        (__VLS_unwrap(t, {})(`docs.wastedLands.tiles.${pair.kind}.living`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "pair-arrow" },
        });
        /** @type {__VLS_StyleScopedClasses['pair-arrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "thumb-col" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb-col']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "thumb-caption" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb-caption']} */ ;
        (__VLS_ctx.$t("docs.wastedLands.pairs.wasted"));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "thumb floating-art" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
        /** @type {__VLS_StyleScopedClasses['floating-art']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "floating-art-shadow" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['floating-art-shadow']} */ ;
        if (pairWastedFrame(pair)) {
            const __VLS_85 = AtlasSprite;
            // @ts-ignore
            const __VLS_86 = __VLS_asFunctionalComponent1(__VLS_85, new __VLS_85({
                // @ts-ignore
                frame: (pairWastedFrame(pair)), ...{ style: (fit(pairWastedFrame(pair), __VLS_unwrap(THUMB_BOX_H, {}))) },
            }));
            const __VLS_87 = __VLS_86({
                frame: (pairWastedFrame(pair)),
                ...{ style: (fit(pairWastedFrame(pair), __VLS_unwrap(THUMB_BOX_H, {}))) },
            }, ...__VLS_functionalComponentArgsRest(__VLS_86));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "thumb-name" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb-name']} */ ;
        (__VLS_unwrap(t, {})(`docs.wastedLands.tiles.${pair.kind}.wasted`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "pair-lore" },
        });
        /** @type {__VLS_StyleScopedClasses['pair-lore']} */ ;
        (__VLS_unwrap(t, {})(`docs.wastedLands.tiles.${pair.kind}.lore`));
        if (pair.wastedSuffixes.length > 1) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "variants" },
            });
            /** @type {__VLS_StyleScopedClasses['variants']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "variants-label" },
            });
            /** @type {__VLS_StyleScopedClasses['variants-label']} */ ;
            (__VLS_ctx.$t("docs.wastedLands.pairs.looks"));
            const __VLS_90 = __VLS_tryAsConstant((pair.wastedSuffixes));
            for (const [suffix, i] of __VLS_vFor(__VLS_nonNull(__VLS_90))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(pair.wastedSuffixes.length > 1))
                                throw 0;
                            return (variantIndex.value[pair.kind] = i);
                            // @ts-ignore
                            [$t, $t, $t, $t, $t, t, t, t, PAIRS, THUMB_BOX_H, THUMB_BOX_H, variantIndex,];
                        } },
                    key: (suffix),
                    type: "button",
                    ...{ class: "variant-button" },
                    ...{ class: ({ active: variantIndex.value[pair.kind] === i }) },
                });
                /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
                /** @type {__VLS_StyleScopedClasses['active']} */ ;
                (i + 1);
                // @ts-ignore
                [variantIndex,];
            }
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        id: "pair-mountain",
        ...{ class: "pair-row" },
    });
    /** @type {__VLS_StyleScopedClasses['pair-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pair-thumbs" },
    });
    /** @type {__VLS_StyleScopedClasses['pair-thumbs']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "thumb-col" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "thumb-caption" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb-caption']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.pairs.living"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "thumb floating-art" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['floating-art']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "floating-art-shadow" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['floating-art-shadow']} */ ;
    if (pairLivingFrame(PAIRS.value[3])) {
        const __VLS_91 = AtlasSprite;
        // @ts-ignore
        const __VLS_92 = __VLS_asFunctionalComponent1(__VLS_91, new __VLS_91({
            // @ts-ignore
            frame: (pairLivingFrame(PAIRS.value[3])), ...{ style: (fit(pairLivingFrame(PAIRS.value[3]), __VLS_unwrap(THUMB_BOX_H, {}))) },
        }));
        const __VLS_93 = __VLS_92({
            frame: (pairLivingFrame(PAIRS.value[3])),
            ...{ style: (fit(pairLivingFrame(PAIRS.value[3]), __VLS_unwrap(THUMB_BOX_H, {}))) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_92));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "thumb-name" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb-name']} */ ;
    (__VLS_unwrap(t, {})("docs.wastedLands.tiles.mountain.living"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "pair-arrow" },
    });
    /** @type {__VLS_StyleScopedClasses['pair-arrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "thumb-col" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "thumb-caption" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb-caption']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.pairs.wasted"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "thumb floating-art" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['floating-art']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "floating-art-shadow" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['floating-art-shadow']} */ ;
    if (pairWastedFrame(PAIRS.value[3])) {
        const __VLS_96 = AtlasSprite;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent1(__VLS_96, new __VLS_96({
            // @ts-ignore
            frame: (pairWastedFrame(PAIRS.value[3])), ...{ style: (fit(pairWastedFrame(PAIRS.value[3]), __VLS_unwrap(THUMB_BOX_H, {}))) },
        }));
        const __VLS_98 = __VLS_97({
            frame: (pairWastedFrame(PAIRS.value[3])),
            ...{ style: (fit(pairWastedFrame(PAIRS.value[3]), __VLS_unwrap(THUMB_BOX_H, {}))) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "thumb-name" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb-name']} */ ;
    (__VLS_unwrap(t, {})("docs.wastedLands.tiles.mountain.wasted"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "pair-lore" },
    });
    /** @type {__VLS_StyleScopedClasses['pair-lore']} */ ;
    (__VLS_unwrap(t, {})("docs.wastedLands.tiles.mountain.lore"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        id: "pair-river",
        ...{ class: "pair-row" },
    });
    /** @type {__VLS_StyleScopedClasses['pair-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "pair-thumbs" },
    });
    /** @type {__VLS_StyleScopedClasses['pair-thumbs']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "thumb-col" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "thumb-caption" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb-caption']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.pairs.living"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "thumb floating-art" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['floating-art']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "floating-art-shadow" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['floating-art-shadow']} */ ;
    if (riverLivingFrame.value) {
        const __VLS_101 = AtlasSprite;
        // @ts-ignore
        const __VLS_102 = __VLS_asFunctionalComponent1(__VLS_101, new __VLS_101({
            // @ts-ignore
            frame: (riverLivingFrame.value), ...{ style: (fit(riverLivingFrame.value, __VLS_unwrap(THUMB_BOX_H, {}))) },
        }));
        const __VLS_103 = __VLS_102({
            frame: (riverLivingFrame.value),
            ...{ style: (fit(riverLivingFrame.value, __VLS_unwrap(THUMB_BOX_H, {}))) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_102));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "thumb-name" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb-name']} */ ;
    (__VLS_unwrap(t, {})("docs.wastedLands.tiles.river.living"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "pair-arrow" },
    });
    /** @type {__VLS_StyleScopedClasses['pair-arrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "thumb-col" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb-col']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "thumb-caption" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb-caption']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.pairs.wasted"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "thumb floating-art" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
    /** @type {__VLS_StyleScopedClasses['floating-art']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "floating-art-shadow" },
        'aria-hidden': "true",
    });
    /** @type {__VLS_StyleScopedClasses['floating-art-shadow']} */ ;
    if (riverWastedFrame.value) {
        const __VLS_106 = AtlasSprite;
        // @ts-ignore
        const __VLS_107 = __VLS_asFunctionalComponent1(__VLS_106, new __VLS_106({
            // @ts-ignore
            frame: (riverWastedFrame.value), ...{ style: (fit(riverWastedFrame.value, __VLS_unwrap(THUMB_BOX_H, {}))) },
        }));
        const __VLS_108 = __VLS_107({
            frame: (riverWastedFrame.value),
            ...{ style: (fit(riverWastedFrame.value, __VLS_unwrap(THUMB_BOX_H, {}))) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_107));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "thumb-name" },
    });
    /** @type {__VLS_StyleScopedClasses['thumb-name']} */ ;
    (__VLS_unwrap(t, {})("docs.wastedLands.tiles.river.wasted"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "pair-lore" },
    });
    /** @type {__VLS_StyleScopedClasses['pair-lore']} */ ;
    (__VLS_unwrap(t, {})("docs.wastedLands.tiles.river.lore"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "variants" },
    });
    /** @type {__VLS_StyleScopedClasses['variants']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "variants-label" },
    });
    /** @type {__VLS_StyleScopedClasses['variants-label']} */ ;
    (__VLS_ctx.$t("docs.wastedLands.pairs.looks"));
    const __VLS_111 = __VLS_tryAsConstant(['straight', 'bend', 'bend60', 'spring']);
    for (const [shape] of __VLS_vFor(__VLS_nonNull(__VLS_111))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (riverShape.value = shape);
                    // @ts-ignore
                    [$t, $t, $t, $t, $t, t, t, t, t, t, t, PAIRS, PAIRS, PAIRS, PAIRS, PAIRS, PAIRS, THUMB_BOX_H, THUMB_BOX_H, THUMB_BOX_H, THUMB_BOX_H, riverLivingFrame, riverLivingFrame, riverLivingFrame, riverWastedFrame, riverWastedFrame, riverWastedFrame, riverShape,];
                } },
            key: (shape),
            type: "button",
            ...{ class: "variant-button" },
            ...{ class: ({ active: riverShape.value === shape }) },
        });
        /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (__VLS_unwrap(t, {})(`docs.wastedLands.lavaShapes.${shape}`));
        // @ts-ignore
        [t, riverShape,];
    }
    const __VLS_112 = __VLS_tryAsConstant((PAIRS.value.slice(4)));
    for (const [pair] of __VLS_vFor(__VLS_nonNull(__VLS_112))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (pair.kind),
            id: (`pair-${pair.kind}`),
            ...{ class: "pair-row" },
        });
        /** @type {__VLS_StyleScopedClasses['pair-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "pair-thumbs" },
        });
        /** @type {__VLS_StyleScopedClasses['pair-thumbs']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "thumb-col" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb-col']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "thumb-caption" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb-caption']} */ ;
        (__VLS_ctx.$t("docs.wastedLands.pairs.living"));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "thumb floating-art" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
        /** @type {__VLS_StyleScopedClasses['floating-art']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "floating-art-shadow" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['floating-art-shadow']} */ ;
        if (pairLivingFrame(pair)) {
            const __VLS_113 = AtlasSprite;
            // @ts-ignore
            const __VLS_114 = __VLS_asFunctionalComponent1(__VLS_113, new __VLS_113({
                // @ts-ignore
                frame: (pairLivingFrame(pair)), ...{ style: (fit(pairLivingFrame(pair), __VLS_unwrap(THUMB_BOX_H, {}))) },
            }));
            const __VLS_115 = __VLS_114({
                frame: (pairLivingFrame(pair)),
                ...{ style: (fit(pairLivingFrame(pair), __VLS_unwrap(THUMB_BOX_H, {}))) },
            }, ...__VLS_functionalComponentArgsRest(__VLS_114));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "thumb-name" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb-name']} */ ;
        (__VLS_unwrap(t, {})(`docs.wastedLands.tiles.${pair.kind}.living`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "pair-arrow" },
        });
        /** @type {__VLS_StyleScopedClasses['pair-arrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "thumb-col" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb-col']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "thumb-caption" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb-caption']} */ ;
        (__VLS_ctx.$t("docs.wastedLands.pairs.wasted"));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "thumb floating-art" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb']} */ ;
        /** @type {__VLS_StyleScopedClasses['floating-art']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "floating-art-shadow" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['floating-art-shadow']} */ ;
        if (pairWastedFrame(pair)) {
            const __VLS_118 = AtlasSprite;
            // @ts-ignore
            const __VLS_119 = __VLS_asFunctionalComponent1(__VLS_118, new __VLS_118({
                // @ts-ignore
                frame: (pairWastedFrame(pair)), ...{ style: (fit(pairWastedFrame(pair), __VLS_unwrap(THUMB_BOX_H, {}))) },
            }));
            const __VLS_120 = __VLS_119({
                frame: (pairWastedFrame(pair)),
                ...{ style: (fit(pairWastedFrame(pair), __VLS_unwrap(THUMB_BOX_H, {}))) },
            }, ...__VLS_functionalComponentArgsRest(__VLS_119));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "thumb-name" },
        });
        /** @type {__VLS_StyleScopedClasses['thumb-name']} */ ;
        (__VLS_unwrap(t, {})(`docs.wastedLands.tiles.${pair.kind}.wasted`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "pair-lore" },
        });
        /** @type {__VLS_StyleScopedClasses['pair-lore']} */ ;
        (__VLS_unwrap(t, {})(`docs.wastedLands.tiles.${pair.kind}.lore`));
        if (pair.wastedSuffixes.length > 1) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "variants" },
            });
            /** @type {__VLS_StyleScopedClasses['variants']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "variants-label" },
            });
            /** @type {__VLS_StyleScopedClasses['variants-label']} */ ;
            (__VLS_ctx.$t("docs.wastedLands.pairs.looks"));
            const __VLS_123 = __VLS_tryAsConstant((pair.wastedSuffixes));
            for (const [suffix, i] of __VLS_vFor(__VLS_nonNull(__VLS_123))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(pair.wastedSuffixes.length > 1))
                                throw 0;
                            return (variantIndex.value[pair.kind] = i);
                            // @ts-ignore
                            [$t, $t, $t, t, t, t, PAIRS, THUMB_BOX_H, THUMB_BOX_H, variantIndex,];
                        } },
                    key: (suffix),
                    type: "button",
                    ...{ class: "variant-button" },
                    ...{ class: ({ active: variantIndex.value[pair.kind] === i }) },
                });
                /** @type {__VLS_StyleScopedClasses['variant-button']} */ ;
                /** @type {__VLS_StyleScopedClasses['active']} */ ;
                (i + 1);
                // @ts-ignore
                [variantIndex,];
            }
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
