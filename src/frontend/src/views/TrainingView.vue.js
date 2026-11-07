/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted } from 'vue';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { unitName } from '../i18n/catalogueNames';
import { maxLevelFor } from '../lib/map/buildingEconomy';
import { MAX_TRAINING_ORDERS_PER_BUILDING, TRAINING_TIME_REDUCTION_PER_LEVEL } from '../lib/units/trainingEconomy';
// The training page: which building trains which units, the queue every training building has, how the building's
// level speeds training up, and how an order is spread over several buildings. The unit-to-building table is read from
// the unit catalogue (`requiredBuildingType`); the queue size and the speed-up come from lib/units/trainingEconomy.ts,
// the same numbers the training window uses.
const units = useUnitCatalogueStore();
onMounted(() => void units.load());
/** The training buildings in catalogue order, each with the units it trains. */
const rows = computed(() => {
    const byBuilding = new Map();
    for (const unit of units.definitions) {
        const list = byBuilding.get(unit.requiredBuildingType) ?? [];
        list.push(unit.type);
        byBuilding.set(unit.requiredBuildingType, list);
    }
    return [...byBuilding].map(([building, types]) => ({ building, units: types.map(unitName).join(', ') }));
});
const percentPerLevel = Math.round(TRAINING_TIME_REDUCTION_PER_LEVEL * 100);
const maxLevel = maxLevelFor('barracks');
const maxPercent = percentPerLevel * maxLevel;
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(rows, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "training" }, title: (__VLS_ctx.$t('docs.training.title')), caption: "DOCS · TRAINING", intro: (__VLS_ctx.$t('docs.training.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "training" },
        title: (__VLS_ctx.$t('docs.training.title')),
        caption: "DOCS · TRAINING",
        intro: (__VLS_ctx.$t('docs.training.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['training']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    if (rows.value.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "buildings",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.training.buildings.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.training.buildings.body'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-scroll" },
        });
        /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            'data-testid': "training-table",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.training.buildings.building'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.training.buildings.units'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_6 = __VLS_tryAsConstant((rows.value));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (row.building),
                'data-building': (row.building),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            const __VLS_7 = BuildingLink;
            // @ts-ignore
            const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
                // @ts-ignore
                type: (row.building), always: true,
            }));
            const __VLS_9 = __VLS_8({
                type: (row.building),
                always: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_8));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.units);
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, rows, rows,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "queue",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.training.queue.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "rules" },
        });
        /** @type {__VLS_StyleScopedClasses['rules']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.training.queue.own', { max: __VLS_unwrap(MAX_TRAINING_ORDERS_PER_BUILDING, {}) }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.training.queue.parallel'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.training.queue.speed', { percent: __VLS_unwrap(percentPerLevel, {}), max: __VLS_unwrap(maxPercent, {}), level: __VLS_unwrap(maxLevel, {}) }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.training.queue.pay'));
        let __VLS_12;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
            // @ts-ignore
            keypath: "docs.training.queue.cancel", tag: "li", scope: "global",
        }));
        const __VLS_14 = __VLS_13({
            keypath: "docs.training.queue.cancel",
            tag: "li",
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        var __VLS_15;
        const { default: __VLS_17 } = __VLS_nonNull(__VLS_15.slots);
        {
            const { realm: __VLS_18 } = __VLS_nonNull(__VLS_15.slots);
            const __VLS_19 = DocsPageLink || DocsPageLink;
            // @ts-ignore
            const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
                // @ts-ignore
                to: "/docs/realm",
            }));
            const __VLS_21 = __VLS_20({
                to: "/docs/realm",
            }, ...__VLS_functionalComponentArgsRest(__VLS_20));
            var __VLS_22;
            const { default: __VLS_24 } = __VLS_nonNull(__VLS_22.slots);
            (__VLS_ctx.$t('docs.training.queue.realmLink'));
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, MAX_TRAINING_ORDERS_PER_BUILDING, percentPerLevel, maxPercent, maxLevel,];
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "distribute",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.training.distribute.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.training.distribute.body'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "rules" },
        });
        /** @type {__VLS_StyleScopedClasses['rules']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.training.distribute.evenly'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.training.distribute.fastest'));
    }
    const __VLS_25 = DocsAdminNote || DocsAdminNote;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
        // @ts-ignore
        ...{ class: "block" },
    }));
    const __VLS_27 = __VLS_26({
        ...{ class: "block" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    var __VLS_28;
    const { default: __VLS_30 } = __VLS_nonNull(__VLS_28.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t('docs.training.adminNote.time', { percent: __VLS_unwrap(percentPerLevel, {}) / 100 }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t('docs.training.adminNote.refund'));
    // @ts-ignore
    [$t, $t, $t, $t, $t, $t, percentPerLevel,];
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
