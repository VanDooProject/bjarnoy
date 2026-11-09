/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// A wildlife camp fight report — hunt, ambush or tower attack (`CampReportResponse`). Same visual
// shape as BattleReportCard / FieldBattleReportCard: banner, the player's units (sent / lost) next
// to the camp's beasts per tier (before / lost, named after the camp's family), loot, and whether
// the camp was cleared / the tower burned.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { beastName, campName, resourceName, unitName } from '../../i18n/catalogueNames';
import { isCampReportVictory, totalCampLoot } from '../../lib/units/campReports';
const { defineProps, } = {};
const props = defineProps();
const { t, d } = useI18n({ useScope: 'global' });
const victory = computed(() => isCampReportVictory(props.report));
const camp = computed(() => campName(props.report.camp.family));
const title = computed(() => t(`hud.campReport.title.${props.report.kind}`, { camp: camp.value }));
const hasLoot = computed(() => totalCampLoot(props.report.loot) > 0);
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(victory, {});
    __VLS_withDotValue(hasLoot, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['victory']} */ ;
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['defeat']} */ ;
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['lines']} */ ;
    /** @type {__VLS_StyleScopedClasses['lines']} */ ;
    /** @type {__VLS_StyleScopedClasses['lines']} */ ;
    /** @type {__VLS_StyleScopedClasses['lines']} */ ;
    /** @type {__VLS_StyleScopedClasses['note']} */ ;
    /** @type {__VLS_StyleScopedClasses['note']} */ ;
    /** @type {__VLS_StyleScopedClasses['note']} */ ;
    /** @type {__VLS_StyleScopedClasses['sides']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "card" },
        ...{ class: (victory.value ? 'victory' : 'defeat') },
        'data-testid': "camp-report-card",
    });
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "card-header" },
    });
    /** @type {__VLS_StyleScopedClasses['card-header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "banner" },
    });
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    (victory.value ? __VLS_unwrap(t, {})('hud.campReport.won') : __VLS_unwrap(t, {})('hud.campReport.lost'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "mission-pill" },
    });
    /** @type {__VLS_StyleScopedClasses['mission-pill']} */ ;
    (__VLS_unwrap(t, {})(`hud.campReport.kind.${__VLS_ctx.report.kind}`));
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "title" },
        'data-testid': "camp-report-title",
    });
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    (__VLS_unwrap(title, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "occurred" },
    });
    /** @type {__VLS_StyleScopedClasses['occurred']} */ ;
    (__VLS_unwrap(d, {})(new Date(__VLS_ctx.report.occurredAt), 'long'));
    (__VLS_unwrap(t, {})('hud.campReport.campLevel', { level: __VLS_ctx.report.camp.effectiveLevel, q: __VLS_ctx.report.camp.q, r: __VLS_ctx.report.camp.r }));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "powers" },
    });
    /** @type {__VLS_StyleScopedClasses['powers']} */ ;
    (__VLS_unwrap(t, {})('hud.campReport.armyPower'));
    (Math.round(__VLS_ctx.report.armyPower));
    (__VLS_unwrap(t, {})('hud.campReport.campPower'));
    (Math.round(__VLS_ctx.report.campPower));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "sides" },
    });
    /** @type {__VLS_StyleScopedClasses['sides']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "side" },
        'data-testid': "camp-report-units",
    });
    /** @type {__VLS_StyleScopedClasses['side']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_unwrap(t, {})('hud.campReport.yourUnits'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "lines-scroll" },
    });
    /** @type {__VLS_StyleScopedClasses['lines-scroll']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "lines" },
    });
    /** @type {__VLS_StyleScopedClasses['lines']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_unwrap(t, {})('hud.battleReport.unit'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_unwrap(t, {})('hud.battleReport.sent'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_unwrap(t, {})('hud.battleReport.lost'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_0 = __VLS_tryAsConstant((__VLS_ctx.report.units));
    for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (row.type),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_unwrap(unitName, {})(row.type));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (row.sent);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "lost" },
        });
        /** @type {__VLS_StyleScopedClasses['lost']} */ ;
        (row.lost);
        // @ts-ignore
        [victory, victory, t, t, t, t, t, t, t, t, t, t, report, report, report, report, report, report, report, report, title, d, unitName,];
    }
    if (!__VLS_ctx.report.units.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            colspan: "3",
            ...{ class: "empty" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        (__VLS_unwrap(t, {})('hud.battleReport.noStacksRecorded'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "side" },
        'data-testid': "camp-report-beasts",
    });
    /** @type {__VLS_StyleScopedClasses['side']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_unwrap(t, {})('hud.campReport.beasts'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "lines-scroll" },
    });
    /** @type {__VLS_StyleScopedClasses['lines-scroll']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
        ...{ class: "lines" },
    });
    /** @type {__VLS_StyleScopedClasses['lines']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_unwrap(t, {})('hud.campReport.beast'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_unwrap(t, {})('hud.campReport.before'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_unwrap(t, {})('hud.battleReport.lost'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_1 = __VLS_tryAsConstant((__VLS_ctx.report.beasts));
    for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (row.tier),
            'data-tier': (row.tier),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_unwrap(beastName, {})(__VLS_ctx.report.camp.family, row.tier));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (row.before);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "lost" },
        });
        /** @type {__VLS_StyleScopedClasses['lost']} */ ;
        (row.lost);
        // @ts-ignore
        [t, t, t, t, t, report, report, report, beastName,];
    }
    if (__VLS_ctx.report.campCleared) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "note cleared" },
            'data-testid': "camp-report-cleared",
        });
        /** @type {__VLS_StyleScopedClasses['note']} */ ;
        /** @type {__VLS_StyleScopedClasses['cleared']} */ ;
        (__VLS_unwrap(t, {})('hud.campReport.cleared', { camp: __VLS_unwrap(camp, {}) }));
    }
    if (__VLS_ctx.report.kind === 'tower') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "note" },
            ...{ class: (__VLS_ctx.report.towerBurned ? 'burned' : 'held') },
            'data-testid': "camp-report-tower",
        });
        /** @type {__VLS_StyleScopedClasses['note']} */ ;
        (__VLS_ctx.report.towerBurned
            ? __VLS_unwrap(t, {})('hud.campReport.towerBurned', { q: __VLS_ctx.report.tower?.q ?? 0, r: __VLS_ctx.report.tower?.r ?? 0 })
            : __VLS_unwrap(t, {})('hud.campReport.towerHeld', { q: __VLS_ctx.report.tower?.q ?? 0, r: __VLS_ctx.report.tower?.r ?? 0 }));
    }
    if (hasLoot.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "loot" },
            'data-testid': "camp-report-loot",
        });
        /** @type {__VLS_StyleScopedClasses['loot']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
        (__VLS_unwrap(t, {})('hud.battleReport.lootTaken'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "loot-row" },
        });
        /** @type {__VLS_StyleScopedClasses['loot-row']} */ ;
        const __VLS_2 = __VLS_tryAsConstant(['wood', 'stone', 'food', 'iron']);
        for (const [kind] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                key: (kind),
            });
            const __VLS_3 = __VLS_asFunctionalDirective(__VLS_directives.vShow, {});
            __VLS_3(__VLS_nonNull(null), { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.report.loot[kind] > 0), }, ...__VLS_directiveHookArgsRest(__VLS_3));
            (__VLS_unwrap(resourceName, {})(kind));
            (Math.round(__VLS_ctx.report.loot[kind]));
            // @ts-ignore
            [t, t, t, t, report, report, report, report, report, report, report, report, report, report, camp, hasLoot, resourceName,];
        }
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
