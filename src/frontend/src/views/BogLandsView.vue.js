/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, reactive } from "vue";
import { useI18n } from "vue-i18n";
import DocsPageLayout from "../components/docs/DocsPageLayout.vue";
import DocsPicker from "../components/docs/DocsPicker.vue";
import DocsTileEntry from "../components/docs/DocsTileEntry.vue";
import DocsToc from "../components/docs/DocsToc.vue";
import DocsAdminNote from "../components/docs/DocsAdminNote.vue";
import { useDocsAdminNotes } from "../composables/useDocsAdminNotes";
import AtlasSprite from "../components/AtlasSprite.vue";
import BogIsland from "../components/docs/BogIsland.vue";
import { findAtlasFrame } from "../lib/map/atlas";
import { RETIRED_BOG_VARIANTS } from "../lib/map/textures";
import { TILE_ORIENTATIONS } from "../lib/map/types";
const { t, te } = useI18n({ useScope: "global" });
// The bog set (3D_assets hextile109-119 plus the Clay Brickworks moved onto
// bog ground; that repo's docs/bog-tiles.md is the source of truth, and
// docs/design/bog.md here is the game side). How many looks and levels each
// family has is read off the showcase atlas, not typed out here, so a new
// variant shows up with the next art drop.
function showcase(name) {
    return findAtlasFrame("showcase", name);
}
/** `''` for the plain look plus every `_variantNNN` the atlas has for this terrain family, minus the retired ones (slot 0 is the plain look). */
function looksOf(family, retired = new Set()) {
    const looks = retired.has(0) ? [] : [""];
    for (let i = 1; i < 20; i++) {
        const suffix = `_variant${String(i).padStart(3, "0")}`;
        if (!retired.has(i) && showcase(`${family}_SE${suffix}`))
            looks.push(suffix);
    }
    return looks;
}
/** Every `levelNNN` the atlas has for this building family. */
function levelsOf(family) {
    const levels = [];
    for (let i = 0; i < 20 && showcase(`${family}_SE_level${String(i).padStart(3, "0")}`); i++)
        levels.push(i);
    return levels;
}
// --- Entries -------------------------------------------------------------
// Every entry is one tile (or one building) with its own picture and pickers, laid out like docs/tiles: a thumbnail
// beside the name and text, the pickers underneath. `family` is the showcase atlas family; ground and water entries
// pick a look, buildings a stage, and each has its own camera.
// Look names follow the variant order in 3D_assets' docs/bog-tiles.md, minus the looks the game no longer shows
// (the plain look of every ground and water-edge family, and the moss's variant006, the peat cuttings: `RETIRED_BOG_VARIANTS`).
const GROUND_LOOKS = [
    "mire1",
    "mire2",
    "mire3",
    "oreSeep",
    "fen",
    "copse",
    "seepChain",
];
const WATER_SHAPES = [
    { id: "creek", family: "bogcreek", key: "bogcreek" },
    { id: "creekBend", family: "bogcreek_bend", key: "bogcreekbend" },
    { id: "spring", family: "bogcreek_spring", key: "bogcreekspring" },
    { id: "lake", family: "boglake", key: "lake" },
    { id: "inlet", family: "boglake_inlet", key: "lakeinlet" },
    { id: "shore", family: "boglake_shore", key: "lakeshore" },
    { id: "half", family: "boglake_half", key: "lakehalf" },
    { id: "mouth", family: "boglake_mouth", key: "lakemouth" },
];
const BUILDINGS = [
    { id: "bogoreworks", family: "bogoreworks" },
    { id: "fisherhut", family: "fisherhut_lake" },
    { id: "hammerschmiede", family: "hammerschmiede" },
    { id: "claybrickworks", family: "claybrickworks" },
];
// The bog-to-grass margins (3D_assets hextile138-142). The game doesn't place them (the map draws the bog's edges
// itself, `bogEdge.ts`), so they are listed in an admin note only.
const MARGINS = ["bay", "shore", "half", "tongue", "spit"];
const ENTRIES = [
    {
        id: "ground",
        group: "ground",
        family: "bog",
        looks: looksOf("bog", RETIRED_BOG_VARIANTS.bog),
        levels: [],
    },
    ...WATER_SHAPES.map((s) => ({
        id: s.id,
        group: "water",
        family: s.family,
        looks: looksOf(s.family, RETIRED_BOG_VARIANTS[s.key]),
        levels: [],
    })),
    ...BUILDINGS.map((b) => ({
        id: b.id,
        group: "buildings",
        family: b.family,
        looks: [],
        levels: levelsOf(b.family),
    })),
    ...MARGINS.map((id) => ({
        id: `margin-${id}`,
        group: "margins",
        family: `bogmargin_${id}`,
        looks: looksOf(`bogmargin_${id}`),
        levels: [],
    })),
];
const GROUPS = ["ground", "water", "buildings", "margins"];
const entriesIn = (group) => ENTRIES.filter((e) => e.group === group);
const view = reactive(Object.fromEntries(ENTRIES.map((e) => [
    e.id,
    {
        // A building opens on its last, finished stage.
        look: 0,
        level: e.levels.at(-1) ?? 0,
        camera: "SE",
    },
])));
function frameOf(entry) {
    const { look, level, camera } = view[entry.id];
    if (entry.group === "buildings")
        return showcase(`${entry.family}_${camera}_level${String(level).padStart(3, "0")}`);
    return showcase(`${entry.family}_${camera}${entry.looks[look] ?? ""}`);
}
function lookName(entry, i) {
    if (entry.group !== "ground")
        return String(i + 1);
    const key = GROUND_LOOKS[i];
    return key ? t(`docs.bogLands.ground.looks.${key}`) : String(i + 1);
}
function keyPrefix(entry) {
    if (entry.group === "margins")
        return `docs.bogLands.margins.tiles.${entry.id.slice("margin-".length)}`;
    return `${entry.group === "water" ? "docs.bogLands.water.shapes" : "docs.bogLands.buildings"}.${entry.id}`;
}
function titleOf(entry) {
    return entry.group === "ground"
        ? t("docs.bogLands.ground.heading")
        : t(`${keyPrefix(entry)}.name`);
}
function textOf(entry) {
    return entry.group === "ground"
        ? t("docs.bogLands.ground.body")
        : t(`${keyPrefix(entry)}.body`);
}
function artNoteOf(entry) {
    const key = `${keyPrefix(entry)}.artNote`;
    return entry.group !== "ground" && te(key) ? t(key) : undefined;
}
const { visible: adminNotes } = useDocsAdminNotes();
const tocLinks = computed(() => [
    { href: "#example-map", label: t("docs.bogLands.example.heading") },
    ...ENTRIES.filter((entry) => entry.group !== "margins").map((entry) => ({
        href: `#${entry.id}`,
        label: titleOf(entry),
    })),
    ...(adminNotes.value
        ? [
            { href: "#margins", label: t("docs.bogLands.margins.heading") },
            { href: "#map-rules", label: t("docs.bogLands.rules.heading") },
        ]
        : []),
]);
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(view, {});
    __VLS_withDotValue(TILE_ORIENTATIONS, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "bog-lands" }, title: (__VLS_ctx.$t('docs.bogLands.title')), caption: "DOCS · BOG LANDS", intro: (__VLS_ctx.$t('docs.bogLands.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "bog-lands" },
        title: (__VLS_ctx.$t('docs.bogLands.title')),
        caption: "DOCS · BOG LANDS",
        intro: (__VLS_ctx.$t('docs.bogLands.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['bog-lands']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    {
        const { status: __VLS_6 } = __VLS_nonNull(__VLS_3.slots);
        const __VLS_7 = DocsAdminNote || DocsAdminNote;
        // @ts-ignore
        const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        // @ts-ignore
        }));
        const __VLS_9 = __VLS_8({}, ...__VLS_functionalComponentArgsRest(__VLS_8));
        var __VLS_10;
        const { default: __VLS_12 } = __VLS_nonNull(__VLS_10.slots);
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "status" },
        });
        /** @type {__VLS_StyleScopedClasses['status']} */ ;
        (__VLS_ctx.$t("docs.bogLands.status"));
        // @ts-ignore
        [$t, $t, $t,];
        // @ts-ignore
        [];
    }
    const __VLS_13 = DocsToc;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
        // @ts-ignore
        links: (__VLS_unwrap(tocLinks, {})),
    }));
    const __VLS_15 = __VLS_14({
        links: (__VLS_unwrap(tocLinks, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "example-map",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t("docs.bogLands.example.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "group-body" },
    });
    /** @type {__VLS_StyleScopedClasses['group-body']} */ ;
    (__VLS_ctx.$t("docs.bogLands.example.body"));
    const __VLS_18 = BogIsland;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
    // @ts-ignore
    }));
    const __VLS_20 = __VLS_19({}, ...__VLS_functionalComponentArgsRest(__VLS_19));
    const __VLS_23 = __VLS_tryAsConstant((__VLS_unwrap(GROUPS, {})));
    for (const [group] of __VLS_vFor(__VLS_nonNull(__VLS_23))) {
        const __VLS_24 = (group === 'margins' ? DocsAdminNote : 'div');
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
            // @ts-ignore
            id: (group === 'margins' ? 'margins' : undefined), key: (group), as: (group === 'margins' ? 'section' : undefined),
        }));
        const __VLS_26 = __VLS_25({
            id: (group === 'margins' ? 'margins' : undefined),
            key: (group),
            as: (group === 'margins' ? 'section' : undefined),
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
        var __VLS_27;
        const { default: __VLS_29 } = __VLS_nonNull(__VLS_27.slots);
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
            ...{ class: "group-heading" },
        });
        /** @type {__VLS_StyleScopedClasses['group-heading']} */ ;
        (__VLS_ctx.$t(`docs.bogLands.${group}.heading`));
        if (group !== 'ground') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "group-body" },
            });
            /** @type {__VLS_StyleScopedClasses['group-body']} */ ;
            (__VLS_ctx.$t(`docs.bogLands.${group}.body`));
        }
        const __VLS_30 = __VLS_tryAsConstant((__VLS_unwrap(entriesIn, {})(group)));
        for (const [entry] of __VLS_vFor(__VLS_nonNull(__VLS_30))) {
            const __VLS_31 = DocsTileEntry || DocsTileEntry;
            // @ts-ignore
            const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
                // @ts-ignore
                id: (entry.id), key: (entry.id), title: (titleOf(entry)), level: (3),
            }));
            const __VLS_33 = __VLS_32({
                id: (entry.id),
                key: (entry.id),
                title: (titleOf(entry)),
                level: (3),
            }, ...__VLS_functionalComponentArgsRest(__VLS_32));
            var __VLS_34;
            const { default: __VLS_36 } = __VLS_nonNull(__VLS_34.slots);
            {
                const { thumb: __VLS_37 } = __VLS_nonNull(__VLS_34.slots);
                if (frameOf(entry)) {
                    const __VLS_38 = AtlasSprite;
                    // @ts-ignore
                    const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
                        // @ts-ignore
                        frame: (frameOf(entry)),
                    }));
                    const __VLS_40 = __VLS_39({
                        frame: (frameOf(entry)),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_39));
                }
                // @ts-ignore
                [$t, $t, $t, $t, tocLinks, GROUPS, entriesIn,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "lore" },
            });
            /** @type {__VLS_StyleScopedClasses['lore']} */ ;
            (textOf(entry));
            if (artNoteOf(entry)) {
                const __VLS_43 = DocsAdminNote || DocsAdminNote;
                // @ts-ignore
                const __VLS_44 = __VLS_asFunctionalComponent1(__VLS_43, new __VLS_43({
                // @ts-ignore
                }));
                const __VLS_45 = __VLS_44({}, ...__VLS_functionalComponentArgsRest(__VLS_44));
                var __VLS_46;
                const { default: __VLS_48 } = __VLS_nonNull(__VLS_46.slots);
                (artNoteOf(entry));
                // @ts-ignore
                [];
            }
            {
                const { pickers: __VLS_49 } = __VLS_nonNull(__VLS_34.slots);
                if (entry.looks.length > 1) {
                    const __VLS_50 = DocsPicker;
                    // @ts-ignore
                    const __VLS_51 = __VLS_asFunctionalComponent1(__VLS_50, new __VLS_50({
                        // @ts-ignore
                        modelValue: (view.value[entry.id].look), label: (__VLS_ctx.$t('docs.bogLands.looks')), options: (entry.looks.map((_, i) => ({ value: i, label: lookName(entry, i), }))),
                    }));
                    const __VLS_52 = __VLS_51({
                        modelValue: (view.value[entry.id].look),
                        label: (__VLS_ctx.$t('docs.bogLands.looks')),
                        options: (entry.looks.map((_, i) => ({
                            value: i,
                            label: lookName(entry, i),
                        }))),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_51));
                }
                if (entry.levels.length > 1) {
                    const __VLS_55 = DocsPicker;
                    // @ts-ignore
                    const __VLS_56 = __VLS_asFunctionalComponent1(__VLS_55, new __VLS_55({
                        // @ts-ignore
                        modelValue: (view.value[entry.id].level), label: (__VLS_ctx.$t('docs.bogLands.stage')), options: (entry.levels.map((level) => ({ value: level, label: String(level + 1), }))),
                    }));
                    const __VLS_57 = __VLS_56({
                        modelValue: (view.value[entry.id].level),
                        label: (__VLS_ctx.$t('docs.bogLands.stage')),
                        options: (entry.levels.map((level) => ({
                            value: level,
                            label: String(level + 1),
                        }))),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_56));
                }
                const __VLS_60 = DocsPicker;
                // @ts-ignore
                const __VLS_61 = __VLS_asFunctionalComponent1(__VLS_60, new __VLS_60({
                    // @ts-ignore
                    modelValue: (view.value[entry.id].camera), label: (__VLS_ctx.$t('docs.bogLands.camera')), options: (TILE_ORIENTATIONS.value.map((cam) => ({ value: cam, label: cam }))),
                }));
                const __VLS_62 = __VLS_61({
                    modelValue: (view.value[entry.id].camera),
                    label: (__VLS_ctx.$t('docs.bogLands.camera')),
                    options: (TILE_ORIENTATIONS.value.map((cam) => ({ value: cam, label: cam }))),
                }, ...__VLS_functionalComponentArgsRest(__VLS_61));
                // @ts-ignore
                [$t, $t, $t, view, view, view, TILE_ORIENTATIONS,];
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
    }
    const __VLS_65 = DocsAdminNote || DocsAdminNote;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent1(__VLS_65, new __VLS_65({
        // @ts-ignore
        id: "map-rules", as: "section", ...{ class: "block" },
    }));
    const __VLS_67 = __VLS_66({
        id: "map-rules",
        as: "section",
        ...{ class: "block" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_66));
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    var __VLS_68;
    const { default: __VLS_70 } = __VLS_nonNull(__VLS_68.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t("docs.bogLands.rules.heading"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "group-body" },
    });
    /** @type {__VLS_StyleScopedClasses['group-body']} */ ;
    (__VLS_ctx.$t("docs.bogLands.rules.body"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.ol, __VLS_intrinsics.ol)({
        ...{ class: "rules" },
    });
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t("docs.bogLands.rules.waterEdges"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t("docs.bogLands.rules.lakesApart"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t("docs.bogLands.rules.creeks"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t("docs.bogLands.rules.mouth"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t("docs.bogLands.rules.weir"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t("docs.bogLands.rules.boats"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t("docs.bogLands.rules.river"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t("docs.bogLands.rules.inland"));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t("docs.bogLands.rules.landing"));
    // @ts-ignore
    [$t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t,];
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
