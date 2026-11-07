/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import LandMovementExample from '../components/docs/LandMovementExample.vue';
import { useDocsAdminNotes } from '../composables/useDocsAdminNotes';
import BuildingLink from '../components/docs/BuildingLink.vue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { terrainName, unitName } from '../i18n/catalogueNames';
import { ravensRings } from '../lib/map/buildingEconomy';
import { ARMY_VISION_RINGS, BRIDGE_GROUND_COST, BRIDGE_LEVELS, BRIDGE_UNLOCK, GROUND_COSTS, STREAM_COST, WALL_END_COST, formatMinutes, minutesPerHex, strongCampGuardRange, } from '../lib/docs/landMovementDocs';
// The land movement page: what one hex costs an army, how fast each unit crosses it, and the rules for food, walls,
// camps and enemies on the road. Speeds come from the unit catalogue; the ground costs are mirrored from the
// pathfinder in landMovementDocs.ts.
const { t, n, locale } = useI18n({ useScope: 'global' });
const units = useUnitCatalogueStore();
onMounted(() => units.load());
// The ground costs are the admin's numbers: players read the rules and the example, and see times, not costs.
const { visible: adminNotes } = useDocsAdminNotes();
/** The columns of the pace table: each ground an army can walk, with its cost. */
const columns = [...GROUND_COSTS.map((g) => ({ id: g.terrain, cost: g.cost })), { id: 'stream', cost: STREAM_COST }];
const landUnits = computed(() => units.definitions.filter((u) => u.class !== 'ship'));
const unitRows = computed(() => landUnits.value.map((u) => ({
    type: u.type,
    speed: u.speed,
    upkeep: u.upkeepPerHour,
    food: u.foodCarryCapacity,
    minutes: columns.map((c) => formatMinutes(minutesPerHex(c.cost, u.speed), String(locale.value))),
})));
const spearman = computed(() => {
    const speed = units.byType.spearman?.speed;
    return speed ? formatMinutes(minutesPerHex(1, speed), String(locale.value)) : '';
});
const slowest = computed(() => {
    const list = landUnits.value;
    if (list.length === 0)
        return null;
    return list.reduce((a, b) => (b.speed < a.speed ? b : a));
});
const tocLinks = computed(() => ['example', 'cost', 'bridges', 'pace', 'food', 'road', 'sight'].map((id) => ({ href: `#${id}`, label: t(`docs.landMovement.toc.${id}`) })));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(BRIDGE_UNLOCK, {});
    __VLS_withDotValue(BRIDGE_GROUND_COST, {});
    __VLS_withDotValue(spearman, {});
    __VLS_withDotValue(units, {});
    __VLS_withDotValue(unitRows, {});
    __VLS_withDotValue(adminNotes, {});
    __VLS_withDotValue(columns, {});
    __VLS_withDotValue(slowest, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    const __VLS_0 = DocsPageLayout || DocsPageLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        ...{ class: "land-movement" }, title: (__VLS_ctx.$t('docs.landMovement.title')), caption: "DOCS · LAND MOVEMENT", intro: (__VLS_ctx.$t('docs.landMovement.intro')),
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "land-movement" },
        title: (__VLS_ctx.$t('docs.landMovement.title')),
        caption: "DOCS · LAND MOVEMENT",
        intro: (__VLS_ctx.$t('docs.landMovement.intro')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['land-movement']} */ ;
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "example",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.landMovement.example.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "text" },
    });
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    (__VLS_ctx.$t('docs.landMovement.example.intro'));
    const __VLS_11 = LandMovementExample;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
    // @ts-ignore
    }));
    const __VLS_13 = __VLS_12({}, ...__VLS_functionalComponentArgsRest(__VLS_12));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "cost",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.landMovement.cost.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "text" },
    });
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    (__VLS_ctx.$t('docs.landMovement.cost.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "text" },
    });
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    (__VLS_ctx.$t('docs.landMovement.cost.summary'));
    const __VLS_16 = DocsAdminNote || DocsAdminNote;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
    // @ts-ignore
    }));
    const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
    var __VLS_19;
    const { default: __VLS_21 } = __VLS_nonNull(__VLS_19.slots);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "table-scroll" },
    });
    /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        'data-testid': "ground-table",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('docs.landMovement.cost.columns.ground'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('docs.landMovement.cost.columns.cost'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_22 = __VLS_tryAsConstant((__VLS_unwrap(GROUND_COSTS, {})));
    for (const [g] of __VLS_vFor(__VLS_nonNull(__VLS_22))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (g.terrain),
            'data-ground': (g.terrain),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            scope: "row",
            ...{ class: "name" },
        });
        /** @type {__VLS_StyleScopedClasses['name']} */ ;
        (__VLS_unwrap(terrainName, {})(g.terrain));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "value" },
        });
        /** @type {__VLS_StyleScopedClasses['value']} */ ;
        (__VLS_unwrap(n, {})(g.cost));
        // @ts-ignore
        [$t, $t, $t, $t, $t, $t, $t, $t, $t, tocLinks, GROUND_COSTS, terrainName, n,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        'data-ground': "stream",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        scope: "row",
        ...{ class: "name" },
    });
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    (__VLS_ctx.$t('docs.landMovement.cost.stream'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_unwrap(n, {})(__VLS_unwrap(STREAM_COST, {})));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "muted" },
    });
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    (__VLS_ctx.$t('docs.landMovement.cost.streamNote'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        'data-ground': "wallEnd",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        scope: "row",
        ...{ class: "name" },
    });
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    (__VLS_ctx.$t('docs.landMovement.cost.wallEnd'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        ...{ class: "value" },
    });
    /** @type {__VLS_StyleScopedClasses['value']} */ ;
    (__VLS_ctx.$t('docs.landMovement.cost.surcharge', { n: __VLS_unwrap(n, {})(__VLS_unwrap(WALL_END_COST, {})) }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "muted" },
    });
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    (__VLS_ctx.$t('docs.landMovement.cost.wallEndNote'));
    const __VLS_23 = __VLS_tryAsConstant(['mountain', 'sea', 'lake']);
    for (const [id] of __VLS_vFor(__VLS_nonNull(__VLS_23))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (id),
            'data-ground': (id),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            scope: "row",
            ...{ class: "name" },
        });
        /** @type {__VLS_StyleScopedClasses['name']} */ ;
        (__VLS_unwrap(terrainName, {})(id));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "blocked" },
        });
        /** @type {__VLS_StyleScopedClasses['blocked']} */ ;
        (__VLS_ctx.$t('docs.landMovement.cost.blocked'));
        // @ts-ignore
        [$t, $t, $t, $t, $t, $t, terrainName, n, n, STREAM_COST, WALL_END_COST,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
        'data-ground': "wideRiver",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
        scope: "row",
        ...{ class: "name" },
    });
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    (__VLS_ctx.$t('docs.landMovement.cost.wideRiver'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
        ...{ class: "blocked" },
    });
    /** @type {__VLS_StyleScopedClasses['blocked']} */ ;
    (__VLS_ctx.$t('docs.landMovement.cost.wideRiverBridge'));
    // @ts-ignore
    [$t, $t,];
    let __VLS_24;
    /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
    i18nT;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
        // @ts-ignore
        keypath: "docs.landMovement.cost.walls", tag: "p", ...{ class: "text" }, scope: "global",
    }));
    const __VLS_26 = __VLS_25({
        keypath: "docs.landMovement.cost.walls",
        tag: "p",
        ...{ class: "text" },
        scope: "global",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    var __VLS_27;
    const { default: __VLS_29 } = __VLS_nonNull(__VLS_27.slots);
    {
        const { walls: __VLS_30 } = __VLS_nonNull(__VLS_27.slots);
        const __VLS_31 = DocsPageLink || DocsPageLink;
        // @ts-ignore
        const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({
            // @ts-ignore
            to: "/docs/walls",
        }));
        const __VLS_33 = __VLS_32({
            to: "/docs/walls",
        }, ...__VLS_functionalComponentArgsRest(__VLS_32));
        var __VLS_34;
        const { default: __VLS_36 } = __VLS_nonNull(__VLS_34.slots);
        (__VLS_ctx.$t('docs.landMovement.cost.wallsLink'));
        // @ts-ignore
        [$t,];
        // @ts-ignore
        [];
    }
    // @ts-ignore
    [];
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "bridges",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.landMovement.bridges.heading'));
    let __VLS_37;
    /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
    i18nT;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
        // @ts-ignore
        keypath: "docs.landMovement.bridges.body", tag: "p", ...{ class: "text" }, scope: "global",
    }));
    const __VLS_39 = __VLS_38({
        keypath: "docs.landMovement.bridges.body",
        tag: "p",
        ...{ class: "text" },
        scope: "global",
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    var __VLS_40;
    const { default: __VLS_42 } = __VLS_nonNull(__VLS_40.slots);
    {
        const { bridge: __VLS_43 } = __VLS_nonNull(__VLS_40.slots);
        const __VLS_44 = BuildingLink;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent1(__VLS_44, new __VLS_44({
            // @ts-ignore
            type: "bridge",
        }));
        const __VLS_46 = __VLS_45({
            type: "bridge",
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        // @ts-ignore
        [$t,];
    }
    {
        const { longhouse: __VLS_49 } = __VLS_nonNull(__VLS_40.slots);
        (BRIDGE_UNLOCK.value.longhouse);
        // @ts-ignore
        [BRIDGE_UNLOCK,];
    }
    {
        const { level: __VLS_50 } = __VLS_nonNull(__VLS_40.slots);
        (BRIDGE_UNLOCK.value.townSquare);
        // @ts-ignore
        [BRIDGE_UNLOCK,];
    }
    {
        const { townsquare: __VLS_51 } = __VLS_nonNull(__VLS_40.slots);
        const __VLS_52 = BuildingLink;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent1(__VLS_52, new __VLS_52({
            // @ts-ignore
            type: "townsquare",
        }));
        const __VLS_54 = __VLS_53({
            type: "townsquare",
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        // @ts-ignore
        [];
    }
    // @ts-ignore
    [];
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "table-scroll" },
    });
    /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        'data-testid': "bridge-table",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('docs.landMovement.bridges.columns.level'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('docs.landMovement.bridges.columns.cost'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_ctx.$t('docs.landMovement.bridges.columns.who'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_57 = __VLS_tryAsConstant((__VLS_unwrap(BRIDGE_LEVELS, {})));
    for (const [b] of __VLS_vFor(__VLS_nonNull(__VLS_57))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (b.level),
            'data-bridge': (b.name),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            scope: "row",
            ...{ class: "name" },
        });
        /** @type {__VLS_StyleScopedClasses['name']} */ ;
        (b.level);
        (__VLS_ctx.$t(`docs.landMovement.bridges.levels.${b.name}`));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "value" },
        });
        /** @type {__VLS_StyleScopedClasses['value']} */ ;
        if (b.cost !== null) {
            (__VLS_unwrap(n, {})(b.cost));
        }
        else {
            (__VLS_unwrap(n, {})(BRIDGE_GROUND_COST.value.min));
            (__VLS_unwrap(n, {})(BRIDGE_GROUND_COST.value.max));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (__VLS_ctx.$t('docs.landMovement.bridges.groundCost'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_ctx.$t(b.everyone ? 'docs.landMovement.bridges.everyone' : 'docs.landMovement.bridges.friends'));
        // @ts-ignore
        [$t, $t, $t, $t, $t, $t, n, n, n, BRIDGE_LEVELS, BRIDGE_GROUND_COST, BRIDGE_GROUND_COST,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "rules" },
    });
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.landMovement.bridges.rules.where'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.landMovement.bridges.rules.site'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.landMovement.bridges.rules.guarded'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.landMovement.bridges.rules.siege'));
    let __VLS_58;
    /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
    i18nT;
    // @ts-ignore
    const __VLS_59 = __VLS_asFunctionalComponent1(__VLS_58, new __VLS_58({
        // @ts-ignore
        keypath: "docs.landMovement.bridges.rules.walls", tag: "li", scope: "global",
    }));
    const __VLS_60 = __VLS_59({
        keypath: "docs.landMovement.bridges.rules.walls",
        tag: "li",
        scope: "global",
    }, ...__VLS_functionalComponentArgsRest(__VLS_59));
    var __VLS_61;
    const { default: __VLS_63 } = __VLS_nonNull(__VLS_61.slots);
    {
        const { walls: __VLS_64 } = __VLS_nonNull(__VLS_61.slots);
        const __VLS_65 = DocsPageLink || DocsPageLink;
        // @ts-ignore
        const __VLS_66 = __VLS_asFunctionalComponent1(__VLS_65, new __VLS_65({
            // @ts-ignore
            to: "/docs/walls",
        }));
        const __VLS_67 = __VLS_66({
            to: "/docs/walls",
        }, ...__VLS_functionalComponentArgsRest(__VLS_66));
        var __VLS_68;
        const { default: __VLS_70 } = __VLS_nonNull(__VLS_68.slots);
        (__VLS_ctx.$t('docs.landMovement.cost.wallsLink'));
        // @ts-ignore
        [$t, $t, $t, $t, $t,];
        // @ts-ignore
        [];
    }
    // @ts-ignore
    [];
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.landMovement.bridges.rules.fleets'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "pace",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.landMovement.pace.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "text" },
    });
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    (__VLS_ctx.$t('docs.landMovement.pace.body'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "text" },
    });
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    (__VLS_ctx.$t('docs.landMovement.pace.start'));
    if (spearman.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.landMovement.pace.example', { unit: __VLS_unwrap(unitName, {})('spearman'), minutes: spearman.value }));
    }
    if (units.value.loading) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('docs.status.loading'));
    }
    if (unitRows.value.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-scroll" },
        });
        /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            'data-testid': "pace-table",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.landMovement.pace.columns.unit'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.landMovement.pace.columns.speed'));
        if (adminNotes.value) {
            const __VLS_71 = __VLS_tryAsConstant((columns.value));
            for (const [c] of __VLS_vFor(__VLS_nonNull(__VLS_71))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                    key: (c.id),
                });
                (c.id === 'stream' ? __VLS_ctx.$t('docs.landMovement.cost.stream') : __VLS_unwrap(terrainName, {})(c.id));
                // @ts-ignore
                [$t, $t, $t, $t, $t, $t, $t, $t, $t, terrainName, spearman, spearman, unitName, units, unitRows, adminNotes, columns,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_72 = __VLS_tryAsConstant((unitRows.value));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_72))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (row.type),
                'data-unit': (row.type),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_unwrap(unitName, {})(row.type));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "value" },
            });
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            (__VLS_unwrap(n, {})(row.speed));
            if (adminNotes.value) {
                const __VLS_73 = __VLS_tryAsConstant((row.minutes));
                for (const [minutes, i] of __VLS_vFor(__VLS_nonNull(__VLS_73))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                        key: (columns.value[i].id),
                        ...{ class: "value" },
                    });
                    /** @type {__VLS_StyleScopedClasses['value']} */ ;
                    (minutes);
                    // @ts-ignore
                    [n, unitName, unitRows, adminNotes, columns,];
                }
            }
            // @ts-ignore
            [];
        }
    }
    if (adminNotes.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (__VLS_ctx.$t('docs.landMovement.pace.note'));
    }
    if (slowest.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "text" },
        });
        /** @type {__VLS_StyleScopedClasses['text']} */ ;
        (__VLS_ctx.$t('docs.landMovement.pace.slowest', { unit: __VLS_unwrap(unitName, {})(slowest.value.type) }));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "food",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.landMovement.food.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "rules" },
    });
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.landMovement.food.upkeep'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.landMovement.food.carry'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.landMovement.food.turnBack'));
    if (unitRows.value.length > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-scroll" },
        });
        /** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "small" },
            'data-testid': "food-table",
        });
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.landMovement.pace.columns.unit'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.landMovement.food.columns.upkeep'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        (__VLS_ctx.$t('docs.landMovement.food.columns.carries'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_74 = __VLS_tryAsConstant((unitRows.value));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_74))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (row.type),
                'data-unit': (row.type),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                scope: "row",
                ...{ class: "name" },
            });
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            (__VLS_unwrap(unitName, {})(row.type));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "value" },
            });
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            (row.upkeep);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "value" },
            });
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            (row.food);
            // @ts-ignore
            [$t, $t, $t, $t, $t, $t, $t, $t, $t, unitName, unitName, unitRows, unitRows, adminNotes, slowest, slowest,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "road",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.landMovement.road.heading'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
        ...{ class: "rules" },
    });
    /** @type {__VLS_StyleScopedClasses['rules']} */ ;
    let __VLS_75;
    /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
    i18nT;
    // @ts-ignore
    const __VLS_76 = __VLS_asFunctionalComponent1(__VLS_75, new __VLS_75({
        // @ts-ignore
        keypath: "docs.landMovement.road.camps", tag: "li", scope: "global",
    }));
    const __VLS_77 = __VLS_76({
        keypath: "docs.landMovement.road.camps",
        tag: "li",
        scope: "global",
    }, ...__VLS_functionalComponentArgsRest(__VLS_76));
    var __VLS_78;
    const { default: __VLS_80 } = __VLS_nonNull(__VLS_78.slots);
    {
        const { link: __VLS_81 } = __VLS_nonNull(__VLS_78.slots);
        const __VLS_82 = DocsPageLink || DocsPageLink;
        // @ts-ignore
        const __VLS_83 = __VLS_asFunctionalComponent1(__VLS_82, new __VLS_82({
            // @ts-ignore
            to: "/docs/wildlife-camps",
        }));
        const __VLS_84 = __VLS_83({
            to: "/docs/wildlife-camps",
        }, ...__VLS_functionalComponentArgsRest(__VLS_83));
        var __VLS_85;
        const { default: __VLS_87 } = __VLS_nonNull(__VLS_85.slots);
        (__VLS_ctx.$t('docs.landMovement.road.campsLink'));
        // @ts-ignore
        [$t, $t,];
        // @ts-ignore
        [];
    }
    {
        const { min: __VLS_88 } = __VLS_nonNull(__VLS_78.slots);
        (__VLS_unwrap(strongCampGuardRange, {})(1));
        // @ts-ignore
        [strongCampGuardRange,];
    }
    {
        const { max: __VLS_89 } = __VLS_nonNull(__VLS_78.slots);
        (__VLS_unwrap(strongCampGuardRange, {})(5));
        // @ts-ignore
        [strongCampGuardRange,];
    }
    // @ts-ignore
    [];
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.landMovement.road.enemies'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
    (__VLS_ctx.$t('docs.landMovement.road.orders'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        id: "sight",
        ...{ class: "block" },
    });
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.$t('docs.landMovement.sight.heading'));
    let __VLS_90;
    /** @ts-ignore @type { | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t'] | typeof __VLS_components.i18nT | typeof __VLS_components.I18nT | typeof __VLS_components['i18n-t']} */
    i18nT;
    // @ts-ignore
    const __VLS_91 = __VLS_asFunctionalComponent1(__VLS_90, new __VLS_90({
        // @ts-ignore
        keypath: "docs.landMovement.sight.body", tag: "p", ...{ class: "text" }, scope: "global",
    }));
    const __VLS_92 = __VLS_91({
        keypath: "docs.landMovement.sight.body",
        tag: "p",
        ...{ class: "text" },
        scope: "global",
    }, ...__VLS_functionalComponentArgsRest(__VLS_91));
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    var __VLS_93;
    const { default: __VLS_95 } = __VLS_nonNull(__VLS_93.slots);
    {
        const { rings: __VLS_96 } = __VLS_nonNull(__VLS_93.slots);
        (__VLS_unwrap(ARMY_VISION_RINGS, {}));
        // @ts-ignore
        [$t, $t, $t, ARMY_VISION_RINGS,];
    }
    {
        const { odin: __VLS_97 } = __VLS_nonNull(__VLS_93.slots);
        const __VLS_98 = BuildingLink;
        // @ts-ignore
        const __VLS_99 = __VLS_asFunctionalComponent1(__VLS_98, new __VLS_98({
            // @ts-ignore
            type: "odinstatue",
        }));
        const __VLS_100 = __VLS_99({
            type: "odinstatue",
        }, ...__VLS_functionalComponentArgsRest(__VLS_99));
        // @ts-ignore
        [];
    }
    {
        const { bonus: __VLS_103 } = __VLS_nonNull(__VLS_93.slots);
        (__VLS_unwrap(ravensRings, {})(1));
        // @ts-ignore
        [ravensRings,];
    }
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
