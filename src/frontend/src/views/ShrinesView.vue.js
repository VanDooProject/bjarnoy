/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { runeRarityName, runeTypeName, terrainName } from '../i18n/catalogueNames';
import { maxLevelFor } from '../lib/map/buildingEconomy';
import { prerequisitesOf } from '../lib/techtree/nodes';
import { FAVOUR_LEVELS, MAX_EFFECT_BONUS_PERCENT, RUNES, RUNE_RARITIES, SHRINE_GODS, favourAt, runeSlots, } from '../lib/docs/shrineDocs';
// The shrines page: the one-shrine rule, what each god gives, and (admin note,
// unfinished) the runes. Every number comes from the building catalogue or the
// mirrors of the backend formulas (shrineDocs.ts), not from the text.
const { t } = useI18n({ useScope: 'global' });
const catalogue = useBuildingCatalogueStore();
onMounted(() => catalogue.load());
const loaded = computed(() => SHRINE_GODS.every((g) => catalogue.byType[g.type]?.length));
const maxLevel = computed(() => maxLevelFor('shrineofthor'));
/** The Longhouse level every shrine asks for (the catalogue gives the same one for each). */
const longhouseLevel = computed(() => catalogue.byType.shrineofthor?.[0]?.requiredLonghouseLevel ?? 0);
const rows = computed(() => SHRINE_GODS.map((god) => {
    const first = catalogue.byType[god.type]?.[0];
    return {
        ...god,
        cells: FAVOUR_LEVELS.map((level) => ({ level, favour: favourAt(god.type, level) })),
        needs: prerequisitesOf(catalogue.byType, god.type),
        standsOn: first
            ? first.requiresCoastalWater
                ? t('docs.techTree.terrainCoastal')
                : first.allowedTerrain.length === 0
                    ? t('docs.techTree.terrainAny')
                    : first.allowedTerrain.map(terrainName).join(', ')
            : '',
    };
}));
const slotRows = [
    { levels: '1–2', slots: runeSlots(1) },
    { levels: '3–4', slots: runeSlots(3) },
    { levels: '5', slots: runeSlots(5) },
];
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(loaded, {});
    __VLS_withDotValue(catalogue, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "shrines" }, title: (__VLS_ctx.$t('docs.shrines.title')), caption: "DOCS · SHRINES", intro: (__VLS_ctx.$t('docs.shrines.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "shrines" },
        title: (__VLS_ctx.$t('docs.shrines.title')),
        caption: "DOCS · SHRINES",
        intro: (__VLS_ctx.$t('docs.shrines.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['shrines']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "rules",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.shrines.rules.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "rules" },
    });
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.shrines.rules.oneShrine'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.shrines.rules.oneGod'));
    if (loaded.value) {
        let __VLS_6;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
            // @ts-ignore
            keypath: "docs.shrines.rules.needs", tag: "li", scope: "global",
        }));
        const __VLS_8 = __VLS_7({
            keypath: "docs.shrines.rules.needs",
            tag: "li",
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_7));
        var __VLS_9;
        const { default: __VLS_11 } = __VLS_nonNull(__VLS_9.slots);
        {
            const { longhouse: __VLS_12 } = __VLS_nonNull(__VLS_9.slots);
            const __VLS_13 = BuildingLink;
            // @ts-ignore
            const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
                // @ts-ignore
                type: "longhouse",
            }));
            const __VLS_15 = __VLS_14({
                type: "longhouse",
            }, ...__VLS_functionalComponentArgsRest(__VLS_14));
            // @ts-ignore
            [$t, $t, $t, $t, $t, loaded,];
        }
        {
            const { level: __VLS_18 } = __VLS_nonNull(__VLS_9.slots);
            (__VLS_unwrap(longhouseLevel, {}));
            // @ts-ignore
            [longhouseLevel,];
        }
        {
            const { max: __VLS_19 } = __VLS_nonNull(__VLS_9.slots);
            (__VLS_unwrap(maxLevel, {}));
            // @ts-ignore
            [maxLevel,];
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "gods",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.shrines.gods.heading'));
    if (catalogue.value.loading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('docs.status.loading'));
    }
    else if (catalogue.value.error) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (catalogue.value.error);
    }
    if (loaded.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-scroll" },
        });
        /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "gods" },
            'data-testid': "gods-table",
        });
        /** @type {__VLS_StyleScopedClasses['gods']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.shrines.gods.columns.god'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.shrines.gods.columns.favour'));
        const __VLS_20 = __VLS_tryAsConstant((__VLS_unwrap(FAVOUR_LEVELS, {})));
        for (const [level] of __VLS_vFor(__VLS_nonNull(__VLS_20))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                key: (level),
            });
            (__VLS_ctx.$t('docs.shrines.gods.columns.level', { n: level }));
            // @ts-ignore
            [$t, $t, $t, $t, $t, loaded, catalogue, catalogue, catalogue, FAVOUR_LEVELS,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.shrines.gods.columns.needs'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.shrines.gods.columns.standsOn'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_21 = __VLS_tryAsConstant((__VLS_unwrap(rows, {})));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_21))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (row.id),
                'data-god': (row.id),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "god" },
            });
            /** @type {__VLS_StyleScopedClasses['god']} */ ;
            const __VLS_22 = BuildingLink;
            // @ts-ignore
            const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
                // @ts-ignore
                type: (row.type), always: true,
            }));
            const __VLS_24 = __VLS_23({
                type: (row.type),
                always: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_23));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "favour" },
            });
            /** @type {__VLS_StyleScopedClasses['favour']} */ ;
            (__VLS_ctx.$t(`docs.shrines.gods.favour.${row.id}`));
            const __VLS_27 = __VLS_tryAsConstant((row.cells));
            for (const [cell] of __VLS_vFor(__VLS_nonNull(__VLS_27))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (cell.level),
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                if (cell.favour?.kind === 'percent') {
                    (__VLS_ctx.$t('docs.shrines.gods.percent', { percent: cell.favour.percent }));
                }
                else if (cell.favour?.kind === 'odin') {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "line" },
                    });
                    /** @type {__VLS_StyleScopedClasses['line']} */ ;
                    (__VLS_ctx.$t('docs.shrines.gods.odinTime', { percent: cell.favour.buildTimePercent }));
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "line" },
                    });
                    /** @type {__VLS_StyleScopedClasses['line']} */ ;
                    (__VLS_ctx.$t('docs.shrines.gods.odinRings', { rings: cell.favour.visionRings }));
                }
                // @ts-ignore
                [$t, $t, $t, $t, $t, $t, rows,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "needs" },
            });
            /** @type {__VLS_StyleScopedClasses['needs']} */ ;
            const __VLS_28 = __VLS_tryAsConstant((row.needs));
            for (const [need] of __VLS_vFor(__VLS_nonNull(__VLS_28))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                    key: (need.type),
                });
                const __VLS_29 = BuildingLink;
                // @ts-ignore
                const __VLS_30 = __VLS_asFunctionalComponent1(__VLS_29, new __VLS_29({
                    // @ts-ignore
                    type: (need.type),
                }));
                const __VLS_31 = __VLS_30({
                    type: (need.type),
                }, ...__VLS_functionalComponentArgsRest(__VLS_30));
                (need.level);
                // @ts-ignore
                [];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.standsOn);
            // @ts-ignore
            [];
        }
    }
    let __VLS_34;
    /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
    i18nT;
    // @ts-ignore
    const __VLS_35 = __VLS_asFunctionalComponent1(__VLS_34, new __VLS_34({
        // @ts-ignore
        keypath: "docs.shrines.gods.costs", tag: "p", ...{ class: "muted" }, scope: "global",
    }));
    const __VLS_36 = __VLS_35({
        keypath: "docs.shrines.gods.costs",
        tag: "p",
        ...{ class: "muted" },
        scope: "global",
    }, ...__VLS_functionalComponentArgsRest(__VLS_35));
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    var __VLS_37;
    const { default: __VLS_39 } = __VLS_nonNull(__VLS_37.slots);
    {
        const { link: __VLS_40 } = __VLS_nonNull(__VLS_37.slots);
        let __VLS_41;
        /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
        RouterLink;
        // @ts-ignore
        const __VLS_42 = __VLS_asFunctionalComponent1(__VLS_41, new __VLS_41({
            // @ts-ignore
            to: "/docs/tech-tree",
        }));
        const __VLS_43 = __VLS_42({
            to: "/docs/tech-tree",
        }, ...__VLS_functionalComponentArgsRest(__VLS_42));
        var __VLS_44;
        const { default: __VLS_46 } = __VLS_nonNull(__VLS_44.slots);
        (__VLS_ctx.$t('docs.shrines.gods.costsLink'));
        // @ts-ignore
        [$t,];
        // @ts-ignore
        [];
    }
    // @ts-ignore
    [];
    const __VLS_47 = DocsAdminNote || DocsAdminNote;
    // @ts-ignore
    const __VLS_48 = __VLS_asFunctionalComponent1(__VLS_47, new __VLS_47({
        // @ts-ignore
        id: "runes", as: "section", ...{ class: "block" },
    }));
    const __VLS_49 = __VLS_48({
        id: "runes",
        as: "section",
        ...{ class: "block" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_48));
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    var __VLS_50;
    const { default: __VLS_52 } = __VLS_nonNull(__VLS_50.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "wip" },
    });
    /** @type {__VLS_StyleScopedClasses['wip']} */ ;
    (__VLS_ctx.$t('docs.shrines.runes.wip'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.shrines.runes.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t('docs.shrines.runes.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "small" },
    });
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('docs.shrines.runes.slots.level'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('docs.shrines.runes.slots.count'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_53 = __VLS_tryAsConstant((__VLS_unwrap(slotRows, {})));
    for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_53))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (row.levels),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (row.levels);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (row.slots);
        // @ts-ignore
        [$t, $t, $t, $t, $t, slotRows,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "small" },
    });
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('docs.shrines.runes.table.rune'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('docs.shrines.runes.table.gives'));
    const __VLS_54 = __VLS_tryAsConstant((__VLS_unwrap(RUNE_RARITIES, {})));
    for (const [rarity] of __VLS_vFor(__VLS_nonNull(__VLS_54))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            key: (rarity),
        });
        (__VLS_unwrap(runeRarityName, {})(rarity));
        // @ts-ignore
        [$t, $t, RUNE_RARITIES, runeRarityName,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_55 = __VLS_tryAsConstant((__VLS_unwrap(RUNES, {})));
    for (const [rune] of __VLS_vFor(__VLS_nonNull(__VLS_55))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (rune.type),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_unwrap(runeTypeName, {})(rune.type));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.$t(`docs.shrines.runes.effects.${rune.effect}`));
        const __VLS_56 = __VLS_tryAsConstant((rune.percent));
        for (const [percent, i] of __VLS_vFor(__VLS_nonNull(__VLS_56))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                key: (i),
            });
            (__VLS_ctx.$t('docs.shrines.gods.percent', { percent }));
            // @ts-ignore
            [$t, $t, RUNES, runeTypeName,];
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t('docs.shrines.runes.cap', { percent: __VLS_unwrap(MAX_EFFECT_BONUS_PERCENT, {}) }));
    // @ts-ignore
    [$t, MAX_EFFECT_BONUS_PERCENT,];
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
