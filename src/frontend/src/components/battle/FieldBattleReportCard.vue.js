/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Issue #206's field-battle report card — the army-vs-army sibling of
// BattleReportCard.vue, reusing that card's exact visual shape (issue #206's
// own ask) minus the siege section: a field battle has no building to
// damage. Unlike a settlement attack, both sides here are symmetric (side A
// / side B, not attacker/defender), so each renders with the same
// sent-less "unit / lost / survived" table and the viewer's own side is
// called out with a "(you)" tag rather than a fixed attacker/defender label.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { resourceName, unitName } from '../../i18n/catalogueNames';
import { fieldBattleOpponent, fieldBattleOutcomeLabel, groupFieldBattleLinesByUnit, isFieldBattleVictoryFor, totalFieldBattleLoot, } from '../../lib/units/fieldBattleReports';
import { worldMapLocation } from '../../lib/mapCameraHash';
const { defineProps, } = {};
const props = defineProps();
const { t, d } = useI18n({ useScope: 'global' });
const outcomeVariant = computed(() => props.report.winner === 'tie' ? 'tie' : isFieldBattleVictoryFor(props.report, props.side) ? 'victory' : 'defeat');
const outcome = computed(() => fieldBattleOutcomeLabel(props.report, props.side));
const loot = computed(() => totalFieldBattleLoot(props.report.lootTaken));
const wonLoot = computed(() => props.report.winner === props.side && loot.value > 0);
const opponent = computed(() => fieldBattleOpponent(props.report, props.side));
const opponentLabel = computed(() => {
    const { ownerName, settlementName } = opponent.value;
    if (ownerName && settlementName)
        return `${ownerName} (${settlementName})`;
    return ownerName ?? settlementName ?? t('hud.fieldBattleReport.unknownOpponent');
});
const mapLocation = computed(() => worldMapLocation(props.report.hex));
const sideARows = computed(() => groupFieldBattleLinesByUnit(props.report.lines, 'sidea'));
const sideBRows = computed(() => groupFieldBattleLinesByUnit(props.report.lines, 'sideb'));
function rowsFor(side) {
    return side === 'sidea' ? sideARows.value : sideBRows.value;
}
function wasDefending(side) {
    return side === 'sidea' ? props.report.sideAWasDefending : props.report.sideBWasDefending;
}
function powerOf(side) {
    return side === 'sidea' ? props.report.sideAPower : props.report.sideBPower;
}
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
    __VLS_withDotValue(wonLoot, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['victory']} */ ;
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['defeat']} */ ;
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['tie']} */ ;
    /** @type {__VLS_StyleScopedClasses['banner']} */ ;
    /** @type {__VLS_StyleScopedClasses['you-tag']} */ ;
    /** @type {__VLS_StyleScopedClasses['lines']} */ ;
    /** @type {__VLS_StyleScopedClasses['lines']} */ ;
    /** @type {__VLS_StyleScopedClasses['lines']} */ ;
    /** @type {__VLS_StyleScopedClasses['lines']} */ ;
    /** @type {__VLS_StyleScopedClasses['lines']} */ ;
    /** @type {__VLS_StyleScopedClasses['sides']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "card" },
        ...{ class: (__VLS_unwrap(outcomeVariant, {})) },
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
    (__VLS_unwrap(t, {})('hud.fieldBattleReport.title'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "occurred" },
    });
    /** @type {__VLS_StyleScopedClasses['occurred']} */ ;
    (__VLS_unwrap(d, {})(new Date(__VLS_ctx.occurredAt), 'long'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "where" },
        'data-testid': "field-battle-where",
    });
    /** @type {__VLS_StyleScopedClasses['where']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "where-label" },
    });
    /** @type {__VLS_StyleScopedClasses['where-label']} */ ;
    (__VLS_unwrap(t, {})('hud.fieldBattleReport.opponent'));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        'data-testid': "field-battle-opponent",
    });
    (__VLS_unwrap(opponentLabel, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "where-sep" },
    });
    /** @type {__VLS_StyleScopedClasses['where-sep']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "where-label" },
    });
    /** @type {__VLS_StyleScopedClasses['where-label']} */ ;
    (__VLS_unwrap(t, {})('hud.fieldBattleReport.location'));
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
    RouterLink;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        to: (__VLS_unwrap(mapLocation, {})), ...{ class: "where-link" }, dataTestid: "field-battle-location",
    }));
    const __VLS_2 = __VLS_1({
        to: (__VLS_unwrap(mapLocation, {})),
        ...{ class: "where-link" },
        dataTestid: "field-battle-location",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['where-link']} */ ;
    var __VLS_3;
    const { default: __VLS_5 } = __VLS_nonNull(__VLS_3.slots);
    (__VLS_unwrap(t, {})('hud.fieldBattleReport.hexCoord', { q: __VLS_ctx.report.hex.q, r: __VLS_ctx.report.hex.r }));
    // @ts-ignore
    [outcomeVariant, outcome, t, t, t, t, d, occurredAt, opponentLabel, mapLocation, report, report,];
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "sides" },
    });
    /** @type {__VLS_StyleScopedClasses['sides']} */ ;
    const __VLS_6 = __VLS_tryAsConstant(['sidea', 'sideb']);
    for (const [s] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            key: (s),
            ...{ class: "side" },
        });
        /** @type {__VLS_StyleScopedClasses['side']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({});
        (__VLS_unwrap(t, {})(`hud.fieldBattleReport.${s === 'sidea' ? 'sideA' : 'sideB'}`));
        if (s === __VLS_ctx.side) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "you-tag" },
            });
            /** @type {__VLS_StyleScopedClasses['you-tag']} */ ;
            (__VLS_unwrap(t, {})('hud.fieldBattleReport.you'));
        }
        if (wasDefending(s)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "defending-tag" },
            });
            /** @type {__VLS_StyleScopedClasses['defending-tag']} */ ;
            (__VLS_unwrap(t, {})('hud.fieldBattleReport.defending'));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "power" },
        });
        /** @type {__VLS_StyleScopedClasses['power']} */ ;
        (__VLS_unwrap(t, {})('hud.fieldBattleReport.power'));
        (Math.round(powerOf(s)));
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
        const __VLS_7 = __VLS_tryAsConstant((rowsFor(s)));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_7))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (row.unit),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (__VLS_unwrap(unitName, {})(row.unit));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "lost" },
            });
            /** @type {__VLS_StyleScopedClasses['lost']} */ ;
            (row.lost);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "survived" },
            });
            /** @type {__VLS_StyleScopedClasses['survived']} */ ;
            (row.survived);
            // @ts-ignore
            [t, t, t, t, t, t, t, side, unitName,];
        }
        if (!rowsFor(s).length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                colspan: "3",
                ...{ class: "empty" },
            });
            /** @type {__VLS_StyleScopedClasses['empty']} */ ;
            (__VLS_unwrap(t, {})('hud.battleReport.noStacksRecorded'));
        }
        // @ts-ignore
        [t,];
    }
    if (wonLoot.value) {
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
    // @ts-ignore
    [t, report, report, report, report, wonLoot, resourceName, resourceName, resourceName, resourceName,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
