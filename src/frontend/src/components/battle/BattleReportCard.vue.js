/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Issue #40 phase 3's outcome card, extracted out of ReportsView.vue in
// phase 7 so the premium fight simulator (SimulatorView.vue) can render its
// result with the exact same markup as a real battle report, rather than
// duplicating it — see SimulatorResponse's own comment on why its field
// shape deliberately mirrors BattleReportResponse's.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { resourceName, unitName } from '../../i18n/catalogueNames';
import { isVictoryFor, missionLabel, outcomeLabel, siegeSummaryLine, totalLoot } from '../../lib/units/battleReports';
const { defineProps, } = {};
const props = defineProps();
const { t, d } = useI18n({ useScope: 'global' });
const victory = computed(() => isVictoryFor(props.report, props.side));
const outcome = computed(() => outcomeLabel(props.report, props.side));
const loot = computed(() => totalLoot(props.report.lootTaken));
const siegeSummary = computed(() => (props.report.siege ? siegeSummaryLine(props.report.siege) : null));
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
    /** @type {__VLS_StyleScopedClasses['lines']} */ ;
    /** @type {__VLS_StyleScopedClasses['siege']} */ ;
    /** @type {__VLS_StyleScopedClasses['siege']} */ ;
    /** @type {__VLS_StyleScopedClasses['sides']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "card" },
        ...{ class: (victory.value ? 'victory' : 'defeat') },
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
    (__VLS_unwrap(outcome, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "mission-pill" },
    });
    /** @type {__VLS_StyleScopedClasses['mission-pill']} */ ;
    (__VLS_unwrap(missionLabel, {})(__VLS_ctx.report.mission));
    if (__VLS_ctx.occurredAt) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "occurred" },
        });
        /** @type {__VLS_StyleScopedClasses['occurred']} */ ;
        (__VLS_unwrap(d, {})(new Date(__VLS_ctx.occurredAt), 'long'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "power-row" },
    });
    /** @type {__VLS_StyleScopedClasses['power-row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "power" },
    });
    /** @type {__VLS_StyleScopedClasses['power']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "power-label" },
    });
    /** @type {__VLS_StyleScopedClasses['power-label']} */ ;
    (__VLS_unwrap(t, {})('hud.battleReport.attackPower'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "power-value" },
    });
    /** @type {__VLS_StyleScopedClasses['power-value']} */ ;
    (Math.round(__VLS_ctx.report.attackPower));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "power" },
    });
    /** @type {__VLS_StyleScopedClasses['power']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "power-label" },
    });
    /** @type {__VLS_StyleScopedClasses['power-label']} */ ;
    (__VLS_unwrap(t, {})('hud.battleReport.defensePower'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "power-value" },
    });
    /** @type {__VLS_StyleScopedClasses['power-value']} */ ;
    (Math.round(__VLS_ctx.report.defensePower));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "sides" },
    });
    /** @type {__VLS_StyleScopedClasses['sides']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "side" },
    });
    /** @type {__VLS_StyleScopedClasses['side']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_unwrap(t, {})('hud.battleReport.attacker'));
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_unwrap(t, {})('hud.battleReport.survived'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_0 = __VLS_tryAsConstant((__VLS_ctx.report.attackerLines));
    for (const [line] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (line.unit),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_unwrap(unitName, {})(line.unit));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (line.sent);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "lost" },
        });
        /** @type {__VLS_StyleScopedClasses['lost']} */ ;
        (line.lost);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "survived" },
        });
        /** @type {__VLS_StyleScopedClasses['survived']} */ ;
        (line.survived);
        // @ts-ignore
        [victory, outcome, missionLabel, report, report, report, report, occurredAt, occurredAt, d, t, t, t, t, t, t, t, unitName,];
    }
    if (!__VLS_ctx.report.attackerLines.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            colspan: "4",
            ...{ class: "empty" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        (__VLS_unwrap(t, {})('hud.battleReport.noStacksRecorded'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "side" },
    });
    /** @type {__VLS_StyleScopedClasses['side']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
    (__VLS_unwrap(t, {})('hud.battleReport.defender'));
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
    (__VLS_unwrap(t, {})('hud.battleReport.lost'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
    (__VLS_unwrap(t, {})('hud.battleReport.survived'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
    const __VLS_1 = __VLS_tryAsConstant((__VLS_ctx.report.defenderLines));
    for (const [line] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            key: (line.unit),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (__VLS_unwrap(unitName, {})(line.unit));
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "lost" },
        });
        /** @type {__VLS_StyleScopedClasses['lost']} */ ;
        (line.lost);
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "survived" },
        });
        /** @type {__VLS_StyleScopedClasses['survived']} */ ;
        (line.survived);
        // @ts-ignore
        [report, report, t, t, t, t, t, unitName,];
    }
    if (!__VLS_ctx.report.defenderLines.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            colspan: "3",
            ...{ class: "empty" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        (__VLS_unwrap(t, {})('hud.battleReport.noStacksRecorded'));
    }
    if (__VLS_unwrap(loot, {}) > 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "loot" },
        });
        /** @type {__VLS_StyleScopedClasses['loot']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
        (__VLS_unwrap(t, {})('hud.battleReport.lootTaken'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "loot-row" },
        });
        /** @type {__VLS_StyleScopedClasses['loot-row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_unwrap(resourceName, {})('wood'));
        (Math.round(__VLS_ctx.report.lootTaken.wood));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_unwrap(resourceName, {})('stone'));
        (Math.round(__VLS_ctx.report.lootTaken.stone));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_unwrap(resourceName, {})('food'));
        (Math.round(__VLS_ctx.report.lootTaken.food));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (__VLS_unwrap(resourceName, {})('iron'));
        (Math.round(__VLS_ctx.report.lootTaken.iron));
    }
    if (__VLS_ctx.report.siege) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "siege" },
            ...{ class: ({ razed: __VLS_ctx.report.siege.settlementRazed }) },
        });
        /** @type {__VLS_StyleScopedClasses['siege']} */ ;
        /** @type {__VLS_StyleScopedClasses['razed']} */ ;
        if (__VLS_ctx.report.siege.settlementRazed) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "razed-banner" },
            });
            /** @type {__VLS_StyleScopedClasses['razed-banner']} */ ;
            (__VLS_unwrap(t, {})('hud.battleReport.settlementRazed'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
        (__VLS_unwrap(t, {})('hud.battleReport.siege'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_unwrap(siegeSummary, {}));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "siege-coord" },
        });
        /** @type {__VLS_StyleScopedClasses['siege-coord']} */ ;
        (__VLS_unwrap(t, {})('hud.battleReport.hexCoord', { q: __VLS_ctx.report.siege.targetCoord.q, r: __VLS_ctx.report.siege.targetCoord.r }));
    }
    // @ts-ignore
    [report, report, report, report, report, report, report, report, report, report, t, t, t, t, t, loot, resourceName, resourceName, resourceName, resourceName, siegeSummary,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
