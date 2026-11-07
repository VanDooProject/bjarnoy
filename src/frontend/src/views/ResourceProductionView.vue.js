/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { resourceName, terrainName } from '../i18n/catalogueNames';
import { buildingStatsFor, maxLevelFor } from '../lib/map/buildingEconomy';
import { prerequisitesOf } from '../lib/techtree/nodes';
import { newPlacementDisabled } from '../lib/map/ringCatalogue';
import { BASE_STORAGE, MILLS, MILL_LEVELS, PRODUCER_LEVELS, BUILDABLE_PRODUCER_TYPES, boostTerrainsOf, millBoostAt, neighbourBoost, storageHouseSteps, } from '../lib/docs/productionDocs';
// The production page: what each producer makes, the neighbour boost, the mills that raise producers, the storage
// that caps everything and the upkeep that eats food. Every number comes from the building catalogue, the economy
// formulas (buildingEconomy.ts) or the few backend mirrors in productionDocs.ts.
const { t, n } = useI18n({ useScope: 'global' });
const catalogue = useBuildingCatalogueStore();
onMounted(() => catalogue.load());
const RESOURCES = ['wood', 'stone', 'food', 'iron'];
const loaded = computed(() => BUILDABLE_PRODUCER_TYPES.every((p) => catalogue.byType[p]?.length) && !!catalogue.byType.longhouse?.length);
// --- helpers -----------------------------------------------------------------------------------------------------
function definitionAt(type, level) {
    return catalogue.byType[type]?.find((d) => d.level === level);
}
/** What `type` stands on, from the catalogue: its terrain, or the coastal water. */
function standsOn(type) {
    const first = catalogue.byType[type]?.[0];
    if (!first)
        return '';
    if (first.requiresCoastalWater)
        return t('docs.techTree.terrainCoastal');
    if (first.allowedTerrain.length === 0)
        return t('docs.techTree.terrainAny');
    return first.allowedTerrain.map(terrainName).join(', ');
}
const NOTED = new Set(['pumpkinfarm', 'fishinghut', 'claybrickworks', 'bogoreworks']);
function unlockOf(type) {
    return {
        longhouse: catalogue.byType[type]?.[0]?.requiredLonghouseLevel ?? 0,
        needs: prerequisitesOf(catalogue.byType, type),
    };
}
// --- producers ---------------------------------------------------------------------------------------------------
const producerRows = computed(() => BUILDABLE_PRODUCER_TYPES.map((type) => {
    const resource = RESOURCES.find((r) => (definitionAt(type, 1)?.productionPerHour[r] ?? 0) > 0);
    return {
        type,
        resource,
        cells: PRODUCER_LEVELS.map((level) => ({
            level,
            amount: Math.round(definitionAt(type, level)?.productionPerHour[resource] ?? 0),
        })),
        standsOn: standsOn(type),
        note: NOTED.has(type),
        unlock: unlockOf(type),
    };
}));
const longhouseRow = computed(() => ({
    cells: PRODUCER_LEVELS.map((level) => ({
        level,
        amounts: RESOURCES.map((r) => Math.round(definitionAt('longhouse', level)?.productionPerHour[r] ?? 0)),
    })),
    perLevel: RESOURCES.map((r) => Math.round(definitionAt('longhouse', 1)?.productionPerHour[r] ?? 0)),
}));
const pumpkinPerHour = computed(() => Math.round(definitionAt('pumpkinfarm', 1)?.productionPerHour.food ?? 0));
const farmPerHour = computed(() => Math.round(definitionAt('farm', 1)?.productionPerHour.food ?? 0));
// --- neighbour boost ---------------------------------------------------------------------------------------------
const boost = neighbourBoost();
const boostRows = ['lumberjack', 'quarry', 'fishinghut', 'bogoreworks']
    .filter((type) => !newPlacementDisabled(type))
    .map((type) => ({
    type,
    terrains: boostTerrainsOf(type).map(terrainName).join(', '),
}));
// --- mills -------------------------------------------------------------------------------------------------------
const millRows = computed(() => MILLS.map((mill) => ({
    ...mill,
    unlock: unlockOf(mill.type),
    cells: MILL_LEVELS.map((level) => ({ level, ...millBoostAt(level) })),
})));
const millMax = maxLevelFor('sawmill');
// --- storage -----------------------------------------------------------------------------------------------------
const STORAGE_ROWS = [
    { type: 'longhouse', levels: [1, 10, maxLevelFor('longhouse')] },
    { type: 'storagehouse', levels: [1, 10, maxLevelFor('storagehouse')] },
    { type: 'greatstorehouse', levels: [1, 5, maxLevelFor('greatstorehouse')] },
];
const storageRows = computed(() => STORAGE_ROWS.map((row) => ({
    type: row.type,
    unlock: unlockOf(row.type),
    cells: row.levels.map((level) => {
        const output = buildingStatsFor(row.type, level).output;
        return { level, capacity: output?.kind === 'storageCapacity' ? output.amount : 0 };
    }),
})));
const steps = storageHouseSteps();
const tocLinks = computed(() => ['producers', 'boost', 'mills', 'storage', 'upkeep'].map((id) => ({ href: `#${id}`, label: t(`docs.production.toc.${id}`) })));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(catalogue, {});
    __VLS_withDotValue(loaded, {});
    __VLS_withDotValue(RESOURCES, {});
    __VLS_withDotValue(resourceName, {});
    __VLS_withDotValue(longhouseRow, {});
    __VLS_withDotValue(boost, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "production" }, title: (__VLS_ctx.$t('docs.production.title')), caption: "DOCS · PRODUCTION", intro: (__VLS_ctx.$t('docs.production.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "production" },
        title: (__VLS_ctx.$t('docs.production.title')),
        caption: "DOCS · PRODUCTION",
        intro: (__VLS_ctx.$t('docs.production.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['production']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    const __VLS_6 = DocsToc;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        links: (__VLS_unwrap(tocLinks, {})),
    }));
    const __VLS_8 = __VLS_7({
        links: (__VLS_unwrap(tocLinks, {})),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
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
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "producers",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.production.producers.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.production.producers.growth'));
        if (loaded.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                'data-testid': "producers-table",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.production.producers.columns.building'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.production.producers.columns.makes'));
            const __VLS_11 = __VLS_tryAsConstant((__VLS_unwrap(PRODUCER_LEVELS, {})));
            for (const [level] of __VLS_vFor(__VLS_nonNull(__VLS_11))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    key: (level),
                });
                (__VLS_ctx.$t('docs.production.producers.columns.level', { n: level }));
                // @ts-ignore
                [$t, $t, $t, $t, $t, $t, $t, $t, tocLinks, catalogue, catalogue, catalogue, loaded, loaded, PRODUCER_LEVELS,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.production.producers.columns.standsOn'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.production.producers.columns.unlock'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            const __VLS_12 = __VLS_tryAsConstant((__VLS_unwrap(producerRows, {})));
            for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_12))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (row.type),
                    'data-producer': (row.type),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    scope: "row",
                    ...{ class: "name" },
                });
                /** @type {__VLS_StyleScopedClasses['name']} */ ;
                const __VLS_13 = BuildingLink;
                // @ts-ignore
                const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
                    // @ts-ignore
                    type: (row.type), always: true,
                }));
                const __VLS_15 = __VLS_14({
                    type: (row.type),
                    always: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_14));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (resourceName.value(row.resource));
                const __VLS_18 = __VLS_tryAsConstant((row.cells));
                for (const [cell] of __VLS_vFor(__VLS_nonNull(__VLS_18))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        key: (cell.level),
                        ...{ class: "value" },
                    });
                    /** @type {__VLS_StyleScopedClasses['value']} */ ;
                    (__VLS_unwrap(n, {})(cell.amount));
                    // @ts-ignore
                    [$t, $t, producerRows, resourceName, n,];
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (row.standsOn);
                if (row.note) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "line muted" },
                    });
                    /** @type {__VLS_StyleScopedClasses['line']} */ ;
                    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
                    (__VLS_ctx.$t(`docs.production.producers.notes.${row.type}`));
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "unlock" },
                });
                /** @type {__VLS_StyleScopedClasses['unlock']} */ ;
                const __VLS_19 = BuildingLink;
                // @ts-ignore
                const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
                    // @ts-ignore
                    type: "longhouse",
                }));
                const __VLS_21 = __VLS_20({
                    type: "longhouse",
                }, ...__VLS_functionalComponentArgsRest(__VLS_20));
                (row.unlock.longhouse);
                const __VLS_24 = __VLS_tryAsConstant((row.unlock.needs));
                for (const [need] of __VLS_vFor(__VLS_nonNull(__VLS_24))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                        key: (need.type),
                    });
                    const __VLS_25 = BuildingLink;
                    // @ts-ignore
                    const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
                        // @ts-ignore
                        type: (need.type),
                    }));
                    const __VLS_27 = __VLS_26({
                        type: (need.type),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
                    (need.level);
                    // @ts-ignore
                    [$t,];
                }
                // @ts-ignore
                [];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                'data-producer': "longhouse",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            const __VLS_30 = BuildingLink;
            // @ts-ignore
            const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
                // @ts-ignore
                type: "longhouse", always: true,
            }));
            const __VLS_32 = __VLS_31({
                type: "longhouse",
                always: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_31));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (RESOURCES.value.map(resourceName.value).join(' / '));
            const __VLS_35 = __VLS_tryAsConstant((longhouseRow.value.cells));
            for (const [cell] of __VLS_vFor(__VLS_nonNull(__VLS_35))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (cell.level),
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (cell.amounts.map((a) => __VLS_unwrap(n, {})(a)).join(' / '));
                // @ts-ignore
                [resourceName, n, RESOURCES, longhouseRow,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (standsOn('longhouse'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.$t('docs.production.producers.longhouseUnlock'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('docs.production.producers.perHour'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.production.producers.longhouse', { amounts: longhouseRow.value.perLevel.map((a) => __VLS_unwrap(n, {})(a)).join(' / ') }));
        let __VLS_36;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({
            // @ts-ignore
            keypath: "docs.production.producers.soil", tag: "p", ...{ class: "text" }, scope: "global",
        }));
        const __VLS_38 = __VLS_37({
            keypath: "docs.production.producers.soil",
            tag: "p",
            ...{ class: "text" },
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        var __VLS_39;
        const { default: __VLS_41 } = __VLS_nonNull(__VLS_39.slots);
        {
            const { pumpkin: __VLS_42 } = __VLS_nonNull(__VLS_39.slots);
            const __VLS_43 = BuildingLink;
            // @ts-ignore
            const __VLS_44 = __VLS_asFunctionalComponent1(__VLS_43, new __VLS_43({
                // @ts-ignore
                type: "pumpkinfarm",
            }));
            const __VLS_45 = __VLS_44({
                type: "pumpkinfarm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_44));
            // @ts-ignore
            [$t, $t, $t, n, longhouseRow,];
        }
        {
            const { farm: __VLS_48 } = __VLS_nonNull(__VLS_39.slots);
            const __VLS_49 = BuildingLink;
            // @ts-ignore
            const __VLS_50 = __VLS_asFunctionalComponent1(__VLS_49, new __VLS_49({
                // @ts-ignore
                type: "farm",
            }));
            const __VLS_51 = __VLS_50({
                type: "farm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_50));
            // @ts-ignore
            [];
        }
        {
            const { pumpkinRate: __VLS_54 } = __VLS_nonNull(__VLS_39.slots);
            (__VLS_unwrap(pumpkinPerHour, {}));
            // @ts-ignore
            [pumpkinPerHour,];
        }
        {
            const { farmRate: __VLS_55 } = __VLS_nonNull(__VLS_39.slots);
            (__VLS_unwrap(farmPerHour, {}));
            // @ts-ignore
            [farmPerHour,];
        }
        // @ts-ignore
        [];
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "boost",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.production.boost.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.production.boost.body', { per: boost.value.perNeighbour, max: boost.value.max }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-scroll" },
        });
        /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "small" },
            'data-testid': "boost-table",
        });
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.production.producers.columns.building'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.production.boost.boostedBy'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_56 = __VLS_tryAsConstant((__VLS_unwrap(boostRows, {})));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_56))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (row.type),
                'data-boost': (row.type),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            const __VLS_57 = BuildingLink;
            // @ts-ignore
            const __VLS_58 = __VLS_asFunctionalComponent1(__VLS_57, new __VLS_57({
                // @ts-ignore
                type: (row.type), always: true,
            }));
            const __VLS_59 = __VLS_58({
                type: (row.type),
                always: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_58));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.terrains);
            // @ts-ignore
            [$t, $t, $t, $t, boost, boost, boostRows,];
        }
        let __VLS_62;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_63 = __VLS_asFunctionalComponent1(__VLS_62, new __VLS_62({
            // @ts-ignore
            keypath: "docs.production.boost.none", tag: "p", ...{ class: "text" }, scope: "global",
        }));
        const __VLS_64 = __VLS_63({
            keypath: "docs.production.boost.none",
            tag: "p",
            ...{ class: "text" },
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_63));
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        var __VLS_65;
        const { default: __VLS_67 } = __VLS_nonNull(__VLS_65.slots);
        {
            const { herder: __VLS_68 } = __VLS_nonNull(__VLS_65.slots);
            const __VLS_69 = BuildingLink;
            // @ts-ignore
            const __VLS_70 = __VLS_asFunctionalComponent1(__VLS_69, new __VLS_69({
                // @ts-ignore
                type: "reindeerherder",
            }));
            const __VLS_71 = __VLS_70({
                type: "reindeerherder",
            }, ...__VLS_functionalComponentArgsRest(__VLS_70));
            // @ts-ignore
            [];
        }
        {
            const { farm: __VLS_74 } = __VLS_nonNull(__VLS_65.slots);
            const __VLS_75 = BuildingLink;
            // @ts-ignore
            const __VLS_76 = __VLS_asFunctionalComponent1(__VLS_75, new __VLS_75({
                // @ts-ignore
                type: "farm",
            }));
            const __VLS_77 = __VLS_76({
                type: "farm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_76));
            // @ts-ignore
            [];
        }
        {
            const { pumpkin: __VLS_80 } = __VLS_nonNull(__VLS_65.slots);
            const __VLS_81 = BuildingLink;
            // @ts-ignore
            const __VLS_82 = __VLS_asFunctionalComponent1(__VLS_81, new __VLS_81({
                // @ts-ignore
                type: "pumpkinfarm",
            }));
            const __VLS_83 = __VLS_82({
                type: "pumpkinfarm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_82));
            // @ts-ignore
            [];
        }
        {
            const { brickworks: __VLS_86 } = __VLS_nonNull(__VLS_65.slots);
            const __VLS_87 = BuildingLink;
            // @ts-ignore
            const __VLS_88 = __VLS_asFunctionalComponent1(__VLS_87, new __VLS_87({
                // @ts-ignore
                type: "claybrickworks",
            }));
            const __VLS_89 = __VLS_88({
                type: "claybrickworks",
            }, ...__VLS_functionalComponentArgsRest(__VLS_88));
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "mills",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.production.mills.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.production.mills.body', { max: __VLS_unwrap(millMax, {}) }));
        if (loaded.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                'data-testid': "mills-table",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.production.mills.columns.mill'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.production.mills.columns.raises'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.production.mills.columns.standsOn'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.production.producers.columns.unlock'));
            const __VLS_92 = __VLS_tryAsConstant((__VLS_unwrap(MILL_LEVELS, {})));
            for (const [level] of __VLS_vFor(__VLS_nonNull(__VLS_92))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    key: (level),
                });
                (__VLS_ctx.$t('docs.production.producers.columns.level', { n: level }));
                // @ts-ignore
                [$t, $t, $t, $t, $t, $t, $t, loaded, millMax, MILL_LEVELS,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            const __VLS_93 = __VLS_tryAsConstant((__VLS_unwrap(millRows, {})));
            for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_93))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (row.type),
                    'data-mill': (row.type),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    scope: "row",
                    ...{ class: "name" },
                });
                /** @type {__VLS_StyleScopedClasses['name']} */ ;
                const __VLS_94 = BuildingLink;
                // @ts-ignore
                const __VLS_95 = __VLS_asFunctionalComponent1(__VLS_94, new __VLS_94({
                    // @ts-ignore
                    type: (row.type), always: true,
                }));
                const __VLS_96 = __VLS_95({
                    type: (row.type),
                    always: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_95));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                const __VLS_99 = __VLS_tryAsConstant((row.boosts));
                for (const [target, i] of __VLS_vFor(__VLS_nonNull(__VLS_99))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                        key: (target),
                    });
                    if (i > 0) {
                    }
                    const __VLS_100 = BuildingLink;
                    // @ts-ignore
                    const __VLS_101 = __VLS_asFunctionalComponent1(__VLS_100, new __VLS_100({
                        // @ts-ignore
                        type: (target),
                    }));
                    const __VLS_102 = __VLS_101({
                        type: (target),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
                    // @ts-ignore
                    [millRows,];
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (__VLS_ctx.$t(`docs.production.mills.stands.${row.stands}`));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "unlock" },
                });
                /** @type {__VLS_StyleScopedClasses['unlock']} */ ;
                const __VLS_105 = BuildingLink;
                // @ts-ignore
                const __VLS_106 = __VLS_asFunctionalComponent1(__VLS_105, new __VLS_105({
                    // @ts-ignore
                    type: "longhouse",
                }));
                const __VLS_107 = __VLS_106({
                    type: "longhouse",
                }, ...__VLS_functionalComponentArgsRest(__VLS_106));
                (row.unlock.longhouse);
                const __VLS_110 = __VLS_tryAsConstant((row.unlock.needs));
                for (const [need] of __VLS_vFor(__VLS_nonNull(__VLS_110))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                        key: (need.type),
                    });
                    const __VLS_111 = BuildingLink;
                    // @ts-ignore
                    const __VLS_112 = __VLS_asFunctionalComponent1(__VLS_111, new __VLS_111({
                        // @ts-ignore
                        type: (need.type),
                    }));
                    const __VLS_113 = __VLS_112({
                        type: (need.type),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_112));
                    (need.level);
                    // @ts-ignore
                    [$t,];
                }
                const __VLS_116 = __VLS_tryAsConstant((row.cells));
                for (const [cell] of __VLS_vFor(__VLS_nonNull(__VLS_116))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        key: (cell.level),
                        ...{ class: "cell" },
                    });
                    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
                    (__VLS_ctx.$t('docs.production.mills.cell', { percent: cell.percent }, cell.rings));
                    // @ts-ignore
                    [$t,];
                }
                // @ts-ignore
                [];
            }
        }
        let __VLS_117;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_118 = __VLS_asFunctionalComponent1(__VLS_117, new __VLS_117({
            // @ts-ignore
            keypath: "docs.production.mills.notPumpkin", tag: "p", ...{ class: "text" }, scope: "global",
        }));
        const __VLS_119 = __VLS_118({
            keypath: "docs.production.mills.notPumpkin",
            tag: "p",
            ...{ class: "text" },
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_118));
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        var __VLS_120;
        const { default: __VLS_122 } = __VLS_nonNull(__VLS_120.slots);
        {
            const { crop: __VLS_123 } = __VLS_nonNull(__VLS_120.slots);
            const __VLS_124 = BuildingLink;
            // @ts-ignore
            const __VLS_125 = __VLS_asFunctionalComponent1(__VLS_124, new __VLS_124({
                // @ts-ignore
                type: "cropmill",
            }));
            const __VLS_126 = __VLS_125({
                type: "cropmill",
            }, ...__VLS_functionalComponentArgsRest(__VLS_125));
            // @ts-ignore
            [];
        }
        {
            const { pumpkin: __VLS_129 } = __VLS_nonNull(__VLS_120.slots);
            const __VLS_130 = BuildingLink;
            // @ts-ignore
            const __VLS_131 = __VLS_asFunctionalComponent1(__VLS_130, new __VLS_130({
                // @ts-ignore
                type: "pumpkinfarm",
            }));
            const __VLS_132 = __VLS_131({
                type: "pumpkinfarm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_131));
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "storage",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.production.storage.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.production.storage.body', { base: __VLS_unwrap(n, {})(__VLS_unwrap(BASE_STORAGE, {})) }));
        if (loaded.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                'data-testid': "storage-table",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.production.producers.columns.building'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.production.storage.capacity'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.production.producers.columns.unlock'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            const __VLS_135 = __VLS_tryAsConstant((__VLS_unwrap(storageRows, {})));
            for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_135))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (row.type),
                    'data-storage': (row.type),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    scope: "row",
                    ...{ class: "name" },
                });
                /** @type {__VLS_StyleScopedClasses['name']} */ ;
                const __VLS_136 = BuildingLink;
                // @ts-ignore
                const __VLS_137 = __VLS_asFunctionalComponent1(__VLS_136, new __VLS_136({
                    // @ts-ignore
                    type: (row.type), always: true,
                }));
                const __VLS_138 = __VLS_137({
                    type: (row.type),
                    always: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_137));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                const __VLS_141 = __VLS_tryAsConstant((row.cells));
                for (const [cell] of __VLS_vFor(__VLS_nonNull(__VLS_141))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        key: (cell.level),
                        ...{ class: "line" },
                    });
                    /** @type {__VLS_StyleScopedClasses['line']} */ ;
                    (__VLS_ctx.$t('docs.production.storage.cell', { level: cell.level, capacity: __VLS_unwrap(n, {})(cell.capacity) }));
                    // @ts-ignore
                    [$t, $t, $t, $t, $t, $t, loaded, n, n, BASE_STORAGE, storageRows,];
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "unlock" },
                });
                /** @type {__VLS_StyleScopedClasses['unlock']} */ ;
                const __VLS_142 = BuildingLink;
                // @ts-ignore
                const __VLS_143 = __VLS_asFunctionalComponent1(__VLS_142, new __VLS_142({
                    // @ts-ignore
                    type: "longhouse",
                }));
                const __VLS_144 = __VLS_143({
                    type: "longhouse",
                }, ...__VLS_functionalComponentArgsRest(__VLS_143));
                (row.unlock.longhouse);
                const __VLS_147 = __VLS_tryAsConstant((row.unlock.needs));
                for (const [need] of __VLS_vFor(__VLS_nonNull(__VLS_147))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                        key: (need.type),
                    });
                    const __VLS_148 = BuildingLink;
                    // @ts-ignore
                    const __VLS_149 = __VLS_asFunctionalComponent1(__VLS_148, new __VLS_148({
                        // @ts-ignore
                        type: (need.type),
                    }));
                    const __VLS_150 = __VLS_149({
                        type: (need.type),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
                    (need.level);
                    // @ts-ignore
                    [];
                }
                // @ts-ignore
                [];
            }
        }
        let __VLS_153;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_154 = __VLS_asFunctionalComponent1(__VLS_153, new __VLS_153({
            // @ts-ignore
            keypath: "docs.production.storage.levelCap", tag: "p", ...{ class: "text" }, scope: "global",
        }));
        const __VLS_155 = __VLS_154({
            keypath: "docs.production.storage.levelCap",
            tag: "p",
            ...{ class: "text" },
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_154));
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        var __VLS_156;
        const { default: __VLS_158 } = __VLS_nonNull(__VLS_156.slots);
        {
            const { storehouse: __VLS_159 } = __VLS_nonNull(__VLS_156.slots);
            const __VLS_160 = BuildingLink;
            // @ts-ignore
            const __VLS_161 = __VLS_asFunctionalComponent1(__VLS_160, new __VLS_160({
                // @ts-ignore
                type: "storagehouse",
            }));
            const __VLS_162 = __VLS_161({
                type: "storagehouse",
            }, ...__VLS_functionalComponentArgsRest(__VLS_161));
            // @ts-ignore
            [];
        }
        {
            const { great: __VLS_165 } = __VLS_nonNull(__VLS_156.slots);
            const __VLS_166 = BuildingLink;
            // @ts-ignore
            const __VLS_167 = __VLS_asFunctionalComponent1(__VLS_166, new __VLS_166({
                // @ts-ignore
                type: "greatstorehouse",
            }));
            const __VLS_168 = __VLS_167({
                type: "greatstorehouse",
            }, ...__VLS_functionalComponentArgsRest(__VLS_167));
            // @ts-ignore
            [];
        }
        {
            const { longhouse: __VLS_171 } = __VLS_nonNull(__VLS_156.slots);
            const __VLS_172 = BuildingLink;
            // @ts-ignore
            const __VLS_173 = __VLS_asFunctionalComponent1(__VLS_172, new __VLS_172({
                // @ts-ignore
                type: "longhouse",
            }));
            const __VLS_174 = __VLS_173({
                type: "longhouse",
            }, ...__VLS_functionalComponentArgsRest(__VLS_173));
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
        (__VLS_ctx.$t('docs.production.storage.moreHeading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.production.storage.moreBody'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-scroll" },
        });
        /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "small" },
            'data-testid': "storehouse-steps",
        });
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.production.storage.step.which'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.production.storage.step.needs'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_177 = __VLS_tryAsConstant((__VLS_unwrap(steps, {})));
        for (const [step] of __VLS_vFor(__VLS_nonNull(__VLS_177))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (step.nth),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.$t(step.later ? 'docs.production.storage.step.later' : 'docs.production.storage.step.nth', { n: step.nth }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.$t('docs.production.storage.step.needsCell', { count: step.count, level: step.level }));
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, steps,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.production.storage.overCap'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "upkeep",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.production.upkeep.heading'));
        let __VLS_178;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_179 = __VLS_asFunctionalComponent1(__VLS_178, new __VLS_178({
            // @ts-ignore
            keypath: "docs.production.upkeep.body", tag: "p", ...{ class: "text" }, scope: "global",
        }));
        const __VLS_180 = __VLS_179({
            keypath: "docs.production.upkeep.body",
            tag: "p",
            ...{ class: "text" },
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_179));
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        var __VLS_181;
        const { default: __VLS_183 } = __VLS_nonNull(__VLS_181.slots);
        {
            const { movement: __VLS_184 } = __VLS_nonNull(__VLS_181.slots);
            const __VLS_185 = DocsPageLink || DocsPageLink;
            // @ts-ignore
            const __VLS_186 = __VLS_asFunctionalComponent1(__VLS_185, new __VLS_185({
                // @ts-ignore
                to: "/docs/land-movement",
            }));
            const __VLS_187 = __VLS_186({
                to: "/docs/land-movement",
            }, ...__VLS_functionalComponentArgsRest(__VLS_186));
            var __VLS_188;
            const { default: __VLS_190 } = __VLS_nonNull(__VLS_188.slots);
            (__VLS_ctx.$t('docs.production.upkeep.movementLink'));
            // @ts-ignore
            [$t, $t, $t,];
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
        let __VLS_191;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_192 = __VLS_asFunctionalComponent1(__VLS_191, new __VLS_191({
            // @ts-ignore
            keypath: "docs.production.upkeep.shrines", tag: "p", ...{ class: "text" }, scope: "global",
        }));
        const __VLS_193 = __VLS_192({
            keypath: "docs.production.upkeep.shrines",
            tag: "p",
            ...{ class: "text" },
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_192));
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        var __VLS_194;
        const { default: __VLS_196 } = __VLS_nonNull(__VLS_194.slots);
        {
            const { freyja: __VLS_197 } = __VLS_nonNull(__VLS_194.slots);
            const __VLS_198 = BuildingLink;
            // @ts-ignore
            const __VLS_199 = __VLS_asFunctionalComponent1(__VLS_198, new __VLS_198({
                // @ts-ignore
                type: "shrineoffreyja",
            }));
            const __VLS_200 = __VLS_199({
                type: "shrineoffreyja",
            }, ...__VLS_functionalComponentArgsRest(__VLS_199));
            // @ts-ignore
            [];
        }
        {
            const { ullr: __VLS_203 } = __VLS_nonNull(__VLS_194.slots);
            const __VLS_204 = BuildingLink;
            // @ts-ignore
            const __VLS_205 = __VLS_asFunctionalComponent1(__VLS_204, new __VLS_204({
                // @ts-ignore
                type: "shrineofullr",
            }));
            const __VLS_206 = __VLS_205({
                type: "shrineofullr",
            }, ...__VLS_functionalComponentArgsRest(__VLS_205));
            // @ts-ignore
            [];
        }
        {
            const { shrines: __VLS_209 } = __VLS_nonNull(__VLS_194.slots);
            const __VLS_210 = DocsPageLink || DocsPageLink;
            // @ts-ignore
            const __VLS_211 = __VLS_asFunctionalComponent1(__VLS_210, new __VLS_210({
                // @ts-ignore
                to: "/docs/shrines",
            }));
            const __VLS_212 = __VLS_211({
                to: "/docs/shrines",
            }, ...__VLS_functionalComponentArgsRest(__VLS_211));
            var __VLS_213;
            const { default: __VLS_215 } = __VLS_nonNull(__VLS_213.slots);
            (__VLS_ctx.$t('docs.production.upkeep.shrinesLink'));
            // @ts-ignore
            [$t,];
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
    }
    const __VLS_216 = DocsAdminNote || DocsAdminNote;
    // @ts-ignore
    const __VLS_217 = __VLS_asFunctionalComponent1(__VLS_216, new __VLS_216({
        // @ts-ignore
        ...{ class: "block" },
    }));
    const __VLS_218 = __VLS_217({
        ...{ class: "block" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_217));
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    var __VLS_219;
    const { default: __VLS_221 } = __VLS_nonNull(__VLS_219.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t('docs.production.adminNote.tooltips'));
    // @ts-ignore
    [$t,];
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
