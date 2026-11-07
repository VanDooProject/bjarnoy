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
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { resourceName } from '../i18n/catalogueNames';
import { prerequisitesOf } from '../lib/techtree/nodes';
import { FEAST_HOURS, MINIMUM_SPACING, settlerCostMultiplier, feastCost, feastRenown, foundingStock, renownRequired, } from '../lib/docs/foundingDocs';
import { SETTLERS_PER_FOUNDING } from '../lib/founding';
// The founding page: your first settlement, the settlers, renown and spacing that gate the next ones, and what a new
// settlement starts with. Unit and building figures come from the catalogues; the settler rules are mirrored in
// foundingDocs.ts.
const { t, n } = useI18n({ useScope: 'global' });
const buildings = useBuildingCatalogueStore();
const units = useUnitCatalogueStore();
onMounted(() => {
    void buildings.load();
    void units.load();
});
const RESOURCES = ['wood', 'stone', 'food', 'iron'];
const settler = computed(() => units.byType.settler);
const loaded = computed(() => !!settler.value && !!buildings.byType.cartworkshop?.length && !!buildings.byType.longhouse?.length);
const workshop = computed(() => ({
    longhouse: buildings.byType.cartworkshop?.[0]?.requiredLonghouseLevel ?? 0,
    needs: prerequisitesOf(buildings.byType, 'cartworkshop'),
}));
const settlerFacts = computed(() => {
    const c = settler.value;
    if (!c)
        return null;
    return {
        defense: c.defense,
        speed: c.speed,
        food: c.foodCarryCapacity,
        upkeep: c.upkeepPerHour,
        minutes: Math.round(c.trainingSeconds / 60),
        longhouse: c.requiredLonghouseLevel,
        cost: RESOURCES.map((r) => n(c.trainingCost[r])).join(' / '),
        carried: SETTLERS_PER_FOUNDING * c.foodCarryCapacity,
    };
});
/** One row per settlement you could found next: what you hold, the renown asked and what the settlers cost. */
const priceRows = computed(() => {
    const c = settler.value;
    if (!c)
        return [];
    return [1, 2, 3, 4].map((held) => {
        const factor = settlerCostMultiplier(held);
        return {
            held,
            number: held + 1,
            factor,
            renown: renownRequired(held + 1),
            perSettler: RESOURCES.map((r) => n(c.trainingCost[r] * factor)).join(' / '),
            total: RESOURCES.map((r) => n(c.trainingCost[r] * factor * SETTLERS_PER_FOUNDING)).join(' / '),
        };
    });
});
const feast = [1, 10, 20].map((level) => ({ level, cost: feastCost(level), renown: feastRenown(level) }));
const start = computed(() => {
    const levels = buildings.byType.longhouse;
    const first = levels?.[0];
    const second = levels?.[1];
    if (!first || !second)
        return null;
    const stock = foundingStock(first.storageCapacity.wood);
    return { claim1: first.claimRadius, claim2: second.claimRadius, stock: n(stock.wood) };
});
const tocLinks = computed(() => ['first', 'more', 'renown', 'where', 'new'].map((id) => ({ href: `#${id}`, label: t(`docs.founding.toc.${id}`) })));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(buildings, {});
    __VLS_withDotValue(units, {});
    __VLS_withDotValue(loaded, {});
    __VLS_withDotValue(workshop, {});
    __VLS_withDotValue(settlerFacts, {});
    __VLS_withDotValue(RESOURCES, {});
    __VLS_withDotValue(resourceName, {});
    __VLS_withDotValue(start, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "founding" }, title: (__VLS_ctx.$t('docs.founding.title')), caption: "DOCS · FOUNDING", intro: (__VLS_ctx.$t('docs.founding.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "founding" },
        title: (__VLS_ctx.$t('docs.founding.title')),
        caption: "DOCS · FOUNDING",
        intro: (__VLS_ctx.$t('docs.founding.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['founding']} */ ;
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
    if (buildings.value.loading || units.value.loading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('docs.status.loading'));
    }
    if (loaded.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "first",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.founding.first.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.founding.first.body'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "more",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.founding.more.heading'));
        if (loaded.value) {
            let __VLS_11;
            /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
            i18nT;
            // @ts-ignore
            const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
                // @ts-ignore
                keypath: "docs.founding.more.body", tag: "p", ...{ class: "text" }, scope: "global",
            }));
            const __VLS_13 = __VLS_12({
                keypath: "docs.founding.more.body",
                tag: "p",
                ...{ class: "text" },
                scope: "global",
            }, ...__VLS_functionalComponentArgsRest(__VLS_12));
            /** @type {__VLS_StyleScopedClasses['text']} */ ;
            var __VLS_14;
            const { default: __VLS_16 } = __VLS_nonNull(__VLS_14.slots);
            {
                const { workshop: __VLS_17 } = __VLS_nonNull(__VLS_14.slots);
                const __VLS_18 = BuildingLink;
                // @ts-ignore
                const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
                    // @ts-ignore
                    type: "cartworkshop",
                }));
                const __VLS_20 = __VLS_19({
                    type: "cartworkshop",
                }, ...__VLS_functionalComponentArgsRest(__VLS_19));
                // @ts-ignore
                [$t, $t, $t, $t, $t, $t, tocLinks, buildings, units, loaded, loaded,];
            }
            {
                const { longhouse: __VLS_23 } = __VLS_nonNull(__VLS_14.slots);
                const __VLS_24 = BuildingLink;
                // @ts-ignore
                const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
                    // @ts-ignore
                    type: "longhouse",
                }));
                const __VLS_26 = __VLS_25({
                    type: "longhouse",
                }, ...__VLS_functionalComponentArgsRest(__VLS_25));
                // @ts-ignore
                [];
            }
            {
                const { level: __VLS_29 } = __VLS_nonNull(__VLS_14.slots);
                (workshop.value.longhouse);
                // @ts-ignore
                [workshop,];
            }
            {
                const { square: __VLS_30 } = __VLS_nonNull(__VLS_14.slots);
                const __VLS_31 = BuildingLink;
                // @ts-ignore
                const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
                    // @ts-ignore
                    type: "townsquare",
                }));
                const __VLS_33 = __VLS_32({
                    type: "townsquare",
                }, ...__VLS_functionalComponentArgsRest(__VLS_32));
                // @ts-ignore
                [];
            }
            {
                const { squareLevel: __VLS_36 } = __VLS_nonNull(__VLS_14.slots);
                (workshop.value.needs.find((p) => p.type === 'townsquare')?.level);
                // @ts-ignore
                [workshop,];
            }
            {
                const { count: __VLS_37 } = __VLS_nonNull(__VLS_14.slots);
                (__VLS_unwrap(SETTLERS_PER_FOUNDING, {}));
                // @ts-ignore
                [SETTLERS_PER_FOUNDING,];
            }
            // @ts-ignore
            [];
        }
        if (settlerFacts.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "small" },
                'data-testid': "settler-table",
            });
            /** @type {__VLS_StyleScopedClasses['small']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.founding.more.settler.defense'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.founding.more.settler.speed'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.founding.more.settler.food'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.founding.more.settler.upkeep'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.founding.more.settler.time'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.founding.more.settler.longhouse'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (settlerFacts.value.defense);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (settlerFacts.value.speed);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (settlerFacts.value.food);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (settlerFacts.value.upkeep);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_ctx.$t('docs.founding.more.settler.minutes', { n: settlerFacts.value.minutes }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (settlerFacts.value.longhouse);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.founding.more.provisions', { food: settlerFacts.value?.food ?? 0, total: settlerFacts.value?.carried ?? 0 }));
        let __VLS_38;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
            // @ts-ignore
            keypath: "docs.founding.more.ambush", tag: "p", ...{ class: "text" }, scope: "global",
        }));
        const __VLS_40 = __VLS_39({
            keypath: "docs.founding.more.ambush",
            tag: "p",
            ...{ class: "text" },
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_39));
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        var __VLS_41;
        const { default: __VLS_43 } = __VLS_nonNull(__VLS_41.slots);
        {
            const { camps: __VLS_44 } = __VLS_nonNull(__VLS_41.slots);
            const __VLS_45 = DocsPageLink || DocsPageLink;
            // @ts-ignore
            const __VLS_46 = __VLS_asFunctionalComponent1(__VLS_45, new __VLS_45({
                // @ts-ignore
                to: "/docs/wildlife-camps",
            }));
            const __VLS_47 = __VLS_46({
                to: "/docs/wildlife-camps",
            }, ...__VLS_functionalComponentArgsRest(__VLS_46));
            var __VLS_48;
            const { default: __VLS_50 } = __VLS_nonNull(__VLS_48.slots);
            (__VLS_ctx.$t('docs.founding.more.campsLink'));
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, $t, $t, $t, settlerFacts, settlerFacts, settlerFacts, settlerFacts, settlerFacts, settlerFacts, settlerFacts, settlerFacts, settlerFacts,];
            // @ts-ignore
            [];
        }
        {
            const { movement: __VLS_51 } = __VLS_nonNull(__VLS_41.slots);
            const __VLS_52 = DocsPageLink || DocsPageLink;
            // @ts-ignore
            const __VLS_53 = __VLS_asFunctionalComponent1(__VLS_52, new __VLS_52({
                // @ts-ignore
                to: "/docs/land-movement",
            }));
            const __VLS_54 = __VLS_53({
                to: "/docs/land-movement",
            }, ...__VLS_functionalComponentArgsRest(__VLS_53));
            var __VLS_55;
            const { default: __VLS_57 } = __VLS_nonNull(__VLS_55.slots);
            (__VLS_ctx.$t('docs.founding.more.movementLink'));
            // @ts-ignore
            [$t,];
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "renown",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.founding.renown.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.founding.renown.body'));
        if (loaded.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "table-scroll" },
            });
            /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                'data-testid': "price-table",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.founding.renown.columns.next'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.founding.renown.columns.renown'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.founding.renown.columns.perSettler'));
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (__VLS_ctx.$t('docs.founding.renown.columns.total', { count: __VLS_unwrap(SETTLERS_PER_FOUNDING, {}) }));
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            const __VLS_58 = __VLS_tryAsConstant((__VLS_unwrap(priceRows, {})));
            for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_58))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (row.held),
                    'data-settlement': (row.number),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    scope: "row",
                    ...{ class: "name" },
                });
                /** @type {__VLS_StyleScopedClasses['name']} */ ;
                (__VLS_ctx.$t('docs.founding.renown.nth', { n: row.number }));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (__VLS_unwrap(n, {})(row.renown));
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (row.perSettler);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    ...{ class: "value" },
                });
                /** @type {__VLS_StyleScopedClasses['value']} */ ;
                (row.total);
                // @ts-ignore
                [$t, $t, $t, $t, $t, $t, $t, loaded, SETTLERS_PER_FOUNDING, priceRows, n,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('docs.founding.renown.order', { resources: RESOURCES.value.map(resourceName.value).join(' / ') }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.founding.renown.when'));
        let __VLS_59;
        /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
        i18nT;
        // @ts-ignore
        const __VLS_60 = __VLS_asFunctionalComponent1(__VLS_59, new __VLS_59({
            // @ts-ignore
            keypath: "docs.founding.renown.feasts", tag: "p", ...{ class: "text" }, scope: "global",
        }));
        const __VLS_61 = __VLS_60({
            keypath: "docs.founding.renown.feasts",
            tag: "p",
            ...{ class: "text" },
            scope: "global",
        }, ...__VLS_functionalComponentArgsRest(__VLS_60));
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        var __VLS_62;
        const { default: __VLS_64 } = __VLS_nonNull(__VLS_62.slots);
        {
            const { square: __VLS_65 } = __VLS_nonNull(__VLS_62.slots);
            const __VLS_66 = BuildingLink;
            // @ts-ignore
            const __VLS_67 = __VLS_asFunctionalComponent1(__VLS_66, new __VLS_66({
                // @ts-ignore
                type: "townsquare",
            }));
            const __VLS_68 = __VLS_67({
                type: "townsquare",
            }, ...__VLS_functionalComponentArgsRest(__VLS_67));
            // @ts-ignore
            [$t, $t, RESOURCES, resourceName,];
        }
        {
            const { hours: __VLS_71 } = __VLS_nonNull(__VLS_62.slots);
            (__VLS_unwrap(FEAST_HOURS, {}));
            // @ts-ignore
            [FEAST_HOURS,];
        }
        // @ts-ignore
        [];
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-scroll" },
        });
        /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "small" },
            'data-testid': "feast-table",
        });
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.founding.renown.feast.level'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.founding.renown.feast.cost'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.founding.renown.feast.renown'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_72 = __VLS_tryAsConstant((__VLS_unwrap(feast, {})));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_72))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (row.level),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (row.level);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "value" },
            });
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            (__VLS_unwrap(n, {})(row.cost));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "value" },
            });
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            (__VLS_unwrap(n, {})(row.renown));
            // @ts-ignore
            [$t, $t, $t, n, n, feast,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "where",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.founding.where.heading'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
            ...{ class: "rules" },
        });
        /** @type {__VLS_StyleScopedClasses['rules']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.founding.where.land'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.founding.where.spacing', { hexes: __VLS_unwrap(MINIMUM_SPACING, {}) }));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.founding.where.twice'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
        (__VLS_ctx.$t('docs.founding.where.taken'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            id: "new",
            ...{ class: "block" },
        });
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.$t('docs.founding.new.heading'));
        if (start.value) {
            let __VLS_73;
            /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
            i18nT;
            // @ts-ignore
            const __VLS_74 = __VLS_asFunctionalComponent1(__VLS_73, new __VLS_73({
                // @ts-ignore
                keypath: "docs.founding.new.body", tag: "p", ...{ class: "text" }, scope: "global",
            }));
            const __VLS_75 = __VLS_74({
                keypath: "docs.founding.new.body",
                tag: "p",
                ...{ class: "text" },
                scope: "global",
            }, ...__VLS_functionalComponentArgsRest(__VLS_74));
            /** @type {__VLS_StyleScopedClasses['text']} */ ;
            var __VLS_76;
            const { default: __VLS_78 } = __VLS_nonNull(__VLS_76.slots);
            {
                const { longhouse: __VLS_79 } = __VLS_nonNull(__VLS_76.slots);
                const __VLS_80 = BuildingLink;
                // @ts-ignore
                const __VLS_81 = __VLS_asFunctionalComponent1(__VLS_80, new __VLS_80({
                    // @ts-ignore
                    type: "longhouse",
                }));
                const __VLS_82 = __VLS_81({
                    type: "longhouse",
                }, ...__VLS_functionalComponentArgsRest(__VLS_81));
                // @ts-ignore
                [$t, $t, $t, $t, $t, $t, MINIMUM_SPACING, start,];
            }
            {
                const { claim1: __VLS_85 } = __VLS_nonNull(__VLS_76.slots);
                (start.value.claim1);
                // @ts-ignore
                [start,];
            }
            {
                const { claim2: __VLS_86 } = __VLS_nonNull(__VLS_76.slots);
                (start.value.claim2);
                // @ts-ignore
                [start,];
            }
            {
                const { stock: __VLS_87 } = __VLS_nonNull(__VLS_76.slots);
                (start.value.stock);
                // @ts-ignore
                [start,];
            }
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.founding.new.garrison'));
    }
    const __VLS_88 = DocsAdminNote || DocsAdminNote;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent1(__VLS_88, new __VLS_88({
        // @ts-ignore
        ...{ class: "block" },
    }));
    const __VLS_90 = __VLS_89({
        ...{ class: "block" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    var __VLS_91;
    const { default: __VLS_93 } = __VLS_nonNull(__VLS_91.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.$t('docs.founding.adminNote.sea'));
    // @ts-ignore
    [$t, $t,];
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
