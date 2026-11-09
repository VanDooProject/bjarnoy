/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { resourceName, unitName } from '../i18n/catalogueNames';
import { prerequisitesOf } from '../lib/techtree/nodes';
import { favourAt } from '../lib/docs/shrineDocs';
import { formatMinutes } from '../lib/docs/landMovementDocs';
import { TOWER_DEFENCE_PERCENT_PER_LEVEL, minutesPerSeaHex } from '../lib/docs/shipDocs';
import { SETTLERS_PER_FOUNDING } from '../lib/founding';
// The ships page: the dockyard, a table of the two ships and the rules for fleets at sea. Ship figures come from the
// unit catalogue, the dockyard's from the building catalogue; the sea rules are mirrored in shipDocs.ts.
const { n, locale } = useI18n({ useScope: 'global' });
const buildings = useBuildingCatalogueStore();
const units = useUnitCatalogueStore();
onMounted(() => {
    void buildings.load();
    void units.load();
});
const RESOURCES = ['wood', 'stone', 'food', 'iron'];
const ships = computed(() => units.definitions.filter((u) => u.class === 'ship'));
// What land units take aboard, smallest first.
const passengers = computed(() => units.definitions.filter((u) => u.cargoSlots > 0).sort((a, b) => a.cargoSlots - b.cargoSlots));
const dockyard = computed(() => ({
    longhouse: buildings.byType.dockyard?.[0]?.requiredLonghouseLevel ?? 0,
    needs: prerequisitesOf(buildings.byType, 'dockyard'),
}));
const fishingHutLevel = computed(() => dockyard.value.needs.find((p) => p.type === 'fishinghut')?.level ?? 0);
const njord = computed(() => {
    const low = favourAt('shrineofnjord', 1);
    const high = favourAt('shrineofnjord', 5);
    return low?.kind === 'percent' && high?.kind === 'percent' ? { low: low.percent, high: high.percent } : null;
});
const loaded = computed(() => ships.value.length > 0 && dockyard.value.longhouse > 0);
const loc = computed(() => String(locale.value));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(loaded, {});
    __VLS_withDotValue(dockyard, {});
    __VLS_withDotValue(units, {});
    __VLS_withDotValue(ships, {});
    __VLS_withDotValue(RESOURCES, {});
    __VLS_withDotValue(resourceName, {});
    __VLS_withDotValue(passengers, {});
    __VLS_withDotValue(njord, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "ships" }, title: (__VLS_ctx.$t('docs.ships.title')), caption: "DOCS · SHIPS", intro: (__VLS_ctx.$t('docs.ships.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "ships" },
        title: (__VLS_ctx.$t('docs.ships.title')),
        caption: "DOCS · SHIPS",
        intro: (__VLS_ctx.$t('docs.ships.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['ships']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    if (loaded.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "dockyard",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.ships.dockyard.heading'));
        if (dockyard.value.longhouse) {
            let __VLS_6;
            /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
            i18nT;
            // @ts-ignore
            const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
                // @ts-ignore
                keypath: "docs.ships.dockyard.body", tag: "p", ...{ class: "text" }, scope: "global",
            }));
            const __VLS_8 = __VLS_7({
                keypath: "docs.ships.dockyard.body",
                tag: "p",
                ...{ class: "text" },
                scope: "global",
            }, ...__VLS_functionalComponentArgsRest(__VLS_7));
            /** @type {__VLS_StyleScopedClasses['text']} */ ;
            var __VLS_9;
            const { default: __VLS_11 } = __VLS_nonNull(__VLS_9.slots);
            {
                const { dockyard: __VLS_12 } = __VLS_nonNull(__VLS_9.slots);
                const __VLS_13 = BuildingLink;
                // @ts-ignore
                const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
                    // @ts-ignore
                    type: "dockyard",
                }));
                const __VLS_15 = __VLS_14({
                    type: "dockyard",
                }, ...__VLS_functionalComponentArgsRest(__VLS_14));
                // @ts-ignore
                [$t, $t, $t, loaded, dockyard,];
            }
            {
                const { longhouse: __VLS_18 } = __VLS_nonNull(__VLS_9.slots);
                const __VLS_19 = BuildingLink;
                // @ts-ignore
                const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
                    // @ts-ignore
                    type: "longhouse",
                }));
                const __VLS_21 = __VLS_20({
                    type: "longhouse",
                }, ...__VLS_functionalComponentArgsRest(__VLS_20));
                // @ts-ignore
                [];
            }
            {
                const { level: __VLS_24 } = __VLS_nonNull(__VLS_9.slots);
                (dockyard.value.longhouse);
                // @ts-ignore
                [dockyard,];
            }
            {
                const { hut: __VLS_25 } = __VLS_nonNull(__VLS_9.slots);
                const __VLS_26 = BuildingLink;
                // @ts-ignore
                const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
                    // @ts-ignore
                    type: "fishinghut",
                }));
                const __VLS_28 = __VLS_27({
                    type: "fishinghut",
                }, ...__VLS_functionalComponentArgsRest(__VLS_27));
                // @ts-ignore
                [];
            }
            {
                const { hutLevel: __VLS_31 } = __VLS_nonNull(__VLS_9.slots);
                (__VLS_unwrap(fishingHutLevel, {}));
                // @ts-ignore
                [fishingHutLevel,];
            }
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.ships.dockyard.shore'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "ships",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.ships.table.heading'));
        if (units.value.loading) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (__VLS_ctx.$t('docs.status.loading'));
        }
        if (ships.value.length > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                'data-testid': "ships-table",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th)({});
            const __VLS_32 = __VLS_tryAsConstant((ships.value));
            for (const [ship] of __VLS_vFor(__VLS_nonNull(__VLS_32))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    key: (ship.type),
                    'data-ship': (ship.type),
                });
                (__VLS_unwrap(unitName, {})(ship.type));
                // @ts-ignore
                [$t, $t, $t, units, ships, ships, unitName,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                'data-row': "attack",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_ctx.$t('docs.ships.table.rows.attack'));
            const __VLS_33 = __VLS_tryAsConstant((ships.value));
            for (const [ship] of __VLS_vFor(__VLS_nonNull(__VLS_33))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (ship.type),
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (ship.attack);
                // @ts-ignore
                [$t, ships,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                'data-row': "defense",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_ctx.$t('docs.ships.table.rows.defense'));
            const __VLS_34 = __VLS_tryAsConstant((ships.value));
            for (const [ship] of __VLS_vFor(__VLS_nonNull(__VLS_34))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (ship.type),
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (ship.defense);
                // @ts-ignore
                [$t, ships,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                'data-row': "speed",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_ctx.$t('docs.ships.table.rows.speed'));
            const __VLS_35 = __VLS_tryAsConstant((ships.value));
            for (const [ship] of __VLS_vFor(__VLS_nonNull(__VLS_35))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (ship.type),
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (__VLS_unwrap(n, {})(ship.speed));
                // @ts-ignore
                [$t, ships, n,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                'data-row': "perHex",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_ctx.$t('docs.ships.table.rows.perHex'));
            const __VLS_36 = __VLS_tryAsConstant((ships.value));
            for (const [ship] of __VLS_vFor(__VLS_nonNull(__VLS_36))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (ship.type),
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (__VLS_unwrap(formatMinutes, {})(__VLS_unwrap(minutesPerSeaHex, {})(ship.speed), __VLS_unwrap(loc, {})));
                // @ts-ignore
                [$t, ships, formatMinutes, minutesPerSeaHex, loc,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                'data-row': "loot",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_ctx.$t('docs.ships.table.rows.loot'));
            const __VLS_37 = __VLS_tryAsConstant((ships.value));
            for (const [ship] of __VLS_vFor(__VLS_nonNull(__VLS_37))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (ship.type),
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (__VLS_unwrap(n, {})(ship.carryCapacity));
                // @ts-ignore
                [$t, ships, n,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                'data-row': "slots",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_ctx.$t('docs.ships.table.rows.slots'));
            const __VLS_38 = __VLS_tryAsConstant((ships.value));
            for (const [ship] of __VLS_vFor(__VLS_nonNull(__VLS_38))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (ship.type),
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (__VLS_unwrap(n, {})(ship.shipSlots));
                // @ts-ignore
                [$t, ships, n,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                'data-row': "food",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_ctx.$t('docs.ships.table.rows.food'));
            const __VLS_39 = __VLS_tryAsConstant((ships.value));
            for (const [ship] of __VLS_vFor(__VLS_nonNull(__VLS_39))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (ship.type),
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (__VLS_unwrap(n, {})(ship.foodCarryCapacity));
                // @ts-ignore
                [$t, ships, n,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                'data-row': "upkeep",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_ctx.$t('docs.ships.table.rows.upkeep'));
            const __VLS_40 = __VLS_tryAsConstant((ships.value));
            for (const [ship] of __VLS_vFor(__VLS_nonNull(__VLS_40))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (ship.type),
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (ship.upkeepPerHour);
                // @ts-ignore
                [$t, ships,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                'data-row': "cost",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_ctx.$t('docs.ships.table.rows.cost', { resources: RESOURCES.value.map(resourceName.value).join(' / ') }));
            const __VLS_41 = __VLS_tryAsConstant((ships.value));
            for (const [ship] of __VLS_vFor(__VLS_nonNull(__VLS_41))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (ship.type),
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (RESOURCES.value.map((r) => __VLS_unwrap(n, {})(ship.trainingCost[r])).join(' / '));
                // @ts-ignore
                [$t, ships, n, RESOURCES, RESOURCES, resourceName,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                'data-row': "time",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_ctx.$t('docs.ships.table.rows.time'));
            const __VLS_42 = __VLS_tryAsConstant((ships.value));
            for (const [ship] of __VLS_vFor(__VLS_nonNull(__VLS_42))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (ship.type),
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (__VLS_ctx.$t('docs.ships.table.minutes', { n: Math.round(ship.trainingSeconds / 60) }));
                // @ts-ignore
                [$t, $t, ships,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                'data-row': "needs",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_ctx.$t('docs.ships.table.rows.needs'));
            const __VLS_43 = __VLS_tryAsConstant((ships.value));
            for (const [ship] of __VLS_vFor(__VLS_nonNull(__VLS_43))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (ship.type),
                });
                const __VLS_44 = BuildingLink;
                // @ts-ignore
                const __VLS_45 = __VLS_asFunctionalComponent1(__VLS_44, new __VLS_44({
                    // @ts-ignore
                    type: "longhouse",
                }));
                const __VLS_46 = __VLS_45({
                    type: "longhouse",
                }, ...__VLS_functionalComponentArgsRest(__VLS_45));
                (ship.requiredLonghouseLevel);
                if (ship.requiredUnitType) {
                    (__VLS_unwrap(unitName, {})(ship.requiredUnitType));
                }
                // @ts-ignore
                [$t, ships, unitName,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "sailing",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.ships.sailing.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "rules" },
        });
        /** @type {__VLS_StyleScopedClasses['rules']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.ships.sailing.sea'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.ships.sailing.targets'));
        let __VLS_49;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_50 = __VLS_asFunctionalComponent1(__VLS_49, new __VLS_49({
            // @ts-ignore
            keypath: "docs.ships.sailing.walls", tag: "li", scope: "global",
        }));
        const __VLS_51 = __VLS_50({
            keypath: "docs.ships.sailing.walls",
            tag: "li",
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_50));
        var __VLS_52;
        const { default: __VLS_54 } = __VLS_nonNull(__VLS_52.slots);
        {
            const { walls: __VLS_55 } = __VLS_nonNull(__VLS_52.slots);
            const __VLS_56 = DocsPageLink || DocsPageLink;
            // @ts-ignore
            const __VLS_57 = __VLS_asFunctionalComponent1(__VLS_56, new __VLS_56({
                // @ts-ignore
                to: "/docs/walls",
            }));
            const __VLS_58 = __VLS_57({
                to: "/docs/walls",
            }, ...__VLS_functionalComponentArgsRest(__VLS_57));
            var __VLS_59;
            const { default: __VLS_61 } = __VLS_nonNull(__VLS_59.slots);
            (__VLS_ctx.$t('docs.ships.sailing.wallsLink'));
            // @ts-ignore
            [$t, $t, $t, $t,];
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
        let __VLS_62;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_63 = __VLS_asFunctionalComponent1(__VLS_62, new __VLS_62({
            // @ts-ignore
            keypath: "docs.ships.sailing.camps", tag: "li", scope: "global",
        }));
        const __VLS_64 = __VLS_63({
            keypath: "docs.ships.sailing.camps",
            tag: "li",
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_63));
        var __VLS_65;
        const { default: __VLS_67 } = __VLS_nonNull(__VLS_65.slots);
        {
            const { camps: __VLS_68 } = __VLS_nonNull(__VLS_65.slots);
            const __VLS_69 = DocsPageLink || DocsPageLink;
            // @ts-ignore
            const __VLS_70 = __VLS_asFunctionalComponent1(__VLS_69, new __VLS_69({
                // @ts-ignore
                to: "/docs/wildlife-camps",
            }));
            const __VLS_71 = __VLS_70({
                to: "/docs/wildlife-camps",
            }, ...__VLS_functionalComponentArgsRest(__VLS_70));
            var __VLS_72;
            const { default: __VLS_74 } = __VLS_nonNull(__VLS_72.slots);
            (__VLS_ctx.$t('docs.ships.sailing.campsLink'));
            // @ts-ignore
            [$t,];
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "troops",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.ships.troops.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.ships.troops.slots'));
        if (passengers.value.length > 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                'data-testid': "slots-table",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "col",
            });
            (__VLS_ctx.$t('docs.ships.troops.unit'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "col",
            });
            (__VLS_ctx.$t('docs.ships.troops.unitSlots'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            const __VLS_75 = __VLS_tryAsConstant((passengers.value));
            for (const [unit] of __VLS_vFor(__VLS_nonNull(__VLS_75))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (unit.type),
                    'data-unit': (unit.type),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    scope: "row",
                    ...{ class: "name" },
                });
                /** @type {__VLS_StyleScopedClasses['name']} */ ;
                (__VLS_unwrap(unitName, {})(unit.type));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (__VLS_unwrap(n, {})(unit.cargoSlots));
                // @ts-ignore
                [$t, $t, $t, $t, unitName, n, passengers, passengers,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "rules" },
        });
        /** @type {__VLS_StyleScopedClasses['rules']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.ships.troops.anyTrip'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.ships.troops.speed'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.ships.troops.fight'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.ships.troops.drown'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "battles",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.ships.battles.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "rules" },
        });
        /** @type {__VLS_StyleScopedClasses['rules']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.ships.battles.same'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.ships.battles.shipsOnly'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.ships.battles.shore'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.ships.battles.damage'));
        let __VLS_76;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent1(__VLS_76, new __VLS_76({
            // @ts-ignore
            keypath: "docs.ships.battles.tower", tag: "li", scope: "global",
        }));
        const __VLS_78 = __VLS_77({
            keypath: "docs.ships.battles.tower",
            tag: "li",
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        var __VLS_79;
        const { default: __VLS_81 } = __VLS_nonNull(__VLS_79.slots);
        {
            const { tower: __VLS_82 } = __VLS_nonNull(__VLS_79.slots);
            const __VLS_83 = BuildingLink;
            // @ts-ignore
            const __VLS_84 = __VLS_asFunctionalComponent1(__VLS_83, new __VLS_83({
                // @ts-ignore
                type: "tower",
            }));
            const __VLS_85 = __VLS_84({
                type: "tower",
            }, ...__VLS_functionalComponentArgsRest(__VLS_84));
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, $t, $t, $t,];
        }
        {
            const { percent: __VLS_88 } = __VLS_nonNull(__VLS_79.slots);
            (__VLS_unwrap(TOWER_DEFENCE_PERCENT_PER_LEVEL, {}));
            // @ts-ignore
            [TOWER_DEFENCE_PERCENT_PER_LEVEL,];
        }
        // @ts-ignore
        [];
        if (njord.value) {
            let __VLS_89;
            /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
            i18nT;
            // @ts-ignore
            const __VLS_90 = __VLS_asFunctionalComponent1(__VLS_89, new __VLS_89({
                // @ts-ignore
                keypath: "docs.ships.battles.njord", tag: "li", scope: "global",
            }));
            const __VLS_91 = __VLS_90({
                keypath: "docs.ships.battles.njord",
                tag: "li",
                scope: "global",
            }, ...__VLS_functionalComponentArgsRest(__VLS_90));
            var __VLS_92;
            const { default: __VLS_94 } = __VLS_nonNull(__VLS_92.slots);
            {
                const { shrine: __VLS_95 } = __VLS_nonNull(__VLS_92.slots);
                const __VLS_96 = BuildingLink;
                // @ts-ignore
                const __VLS_97 = __VLS_asFunctionalComponent1(__VLS_96, new __VLS_96({
                    // @ts-ignore
                    type: "shrineofnjord",
                }));
                const __VLS_98 = __VLS_97({
                    type: "shrineofnjord",
                }, ...__VLS_functionalComponentArgsRest(__VLS_97));
                // @ts-ignore
                [njord,];
            }
            {
                const { low: __VLS_101 } = __VLS_nonNull(__VLS_92.slots);
                (njord.value.low);
                // @ts-ignore
                [njord,];
            }
            {
                const { high: __VLS_102 } = __VLS_nonNull(__VLS_92.slots);
                (njord.value.high);
                // @ts-ignore
                [njord,];
            }
            {
                const { shrines: __VLS_103 } = __VLS_nonNull(__VLS_92.slots);
                const __VLS_104 = DocsPageLink || DocsPageLink;
                // @ts-ignore
                const __VLS_105 = __VLS_asFunctionalComponent1(__VLS_104, new __VLS_104({
                    // @ts-ignore
                    to: "/docs/shrines",
                }));
                const __VLS_106 = __VLS_105({
                    to: "/docs/shrines",
                }, ...__VLS_functionalComponentArgsRest(__VLS_105));
                var __VLS_107;
                const { default: __VLS_109 } = __VLS_nonNull(__VLS_107.slots);
                (__VLS_ctx.$t('docs.ships.battles.shrinesLink'));
                // @ts-ignore
                [$t,];
                // @ts-ignore
                [];
            }
            // @ts-ignore
            [];
        }
    }
    const __VLS_110 = DocsAdminNote || DocsAdminNote;
    // @ts-ignore
    const __VLS_111 = __VLS_asFunctionalComponent1(__VLS_110, new __VLS_110({
        // @ts-ignore
        ...{ class: "block" },
    }));
    const __VLS_112 = __VLS_111({
        ...{ class: "block" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_111));
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    var __VLS_113;
    const { default: __VLS_115 } = __VLS_nonNull(__VLS_113.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t('docs.ships.adminNote.sea', { settlers: __VLS_unwrap(SETTLERS_PER_FOUNDING, {}) }));
    // @ts-ignore
    [$t, SETTLERS_PER_FOUNDING,];
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
