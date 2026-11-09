/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Issue #40 phase 3: battle-reports inbox — rendered inside
// components/reports/ReportsModal.vue's shared dialog chrome as a modal over
// whatever page was showing before (see lib/modalRoute.ts and App.vue's own
// comment), rather than a full page of its own. This component keeps all of
// the actual reports logic (data loading, the kind filter, which rows are
// open); ReportsModal.vue is only the chrome around it — mirroring how
// ProfileModal.vue wraps ProfileView.vue.
//
// Every row is collapsible and expands in place into its full report, any
// number at once, so reports can be read side by side with no detail page
// to go back from. `/reports/:reportId` is only a deep link: that row starts
// expanded (and is scrolled into view); opening and closing rows never
// touches the URL.
//
// The battle-detail card itself is BattleReportCard.vue (issue #40 phase 7)
// — extracted so the premium fight simulator can render its result with the
// exact same markup as a real report, rather than duplicating it.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { usePlayerStore } from '../stores/player';
import { useReportsStore } from '../stores/reports';
import { DEMO_MODE } from '../config';
import { isVictoryFor, missionLabel, outcomeLabel, reportSummaryLine, sideFor } from '../lib/units/battleReports';
import { fieldBattleOutcomeLabel, fieldBattleSideFor, fieldBattleSummaryLine, isFieldBattleVictoryFor, } from '../lib/units/fieldBattleReports';
import { tradeSideFor, tradeSummaryLine } from '../lib/units/tradeReports';
import { filterInbox } from '../lib/units/inbox';
import BattleReportCard from '../components/battle/BattleReportCard.vue';
import FieldBattleReportCard from '../components/battle/FieldBattleReportCard.vue';
import CampReportCard from '../components/battle/CampReportCard.vue';
import { campName } from '../i18n/catalogueNames';
import { isCampReportVictory, totalBeastsLost, totalCampLoot, totalUnitsLost } from '../lib/units/campReports';
const { t, d } = useI18n({ useScope: 'global' });
const route = useRoute();
const player = usePlayerStore();
const reports = useReportsStore();
const reportId = computed(() => (typeof route.params.reportId === 'string' ? route.params.reportId : null));
const kindFilter = ref('all');
async function load() {
    if (!player.settlementId)
        return;
    await reports.load(player.settlementId, player.id);
    // Opening the inbox (list or a specific report) is what "reading it"
    // means client-side — see stores/reports.ts's own comment on why there is
    // no backend read-state to defer to instead.
    reports.markAllSeen();
}
onMounted(load);
watch(() => player.settlementId, load);
// Rows currently expanded. Local state, not the URL: any number can be open at once.
const expanded = ref(new Set());
const listRef = ref(null);
function isExpanded(id) {
    return expanded.value.has(id);
}
function toggle(id) {
    const next = new Set(expanded.value);
    if (!next.delete(id))
        next.add(id);
    expanded.value = next;
}
// A deep link (`/reports/:reportId`) opens that report's row and brings it into view once the list has rendered.
watch(reportId, async (id) => {
    if (!id)
        return;
    expanded.value = new Set(expanded.value).add(id);
    await nextTick();
    listRef.value?.querySelector(`[data-report-id="${CSS.escape(id)}"]`)?.scrollIntoView?.({ block: 'nearest' });
}, { immediate: true });
watch(() => reports.inboxItems.length, async () => {
    if (!reportId.value)
        return;
    await nextTick();
    listRef.value?.querySelector(`[data-report-id="${CSS.escape(reportId.value)}"]`)?.scrollIntoView?.({ block: 'nearest' });
});
function sideOf(report) {
    if (!player.settlementId)
        return 'attacker';
    return sideFor(report, player.settlementId) ?? 'attacker';
}
function fieldSideOf(report) {
    if (!player.settlementId)
        return 'sidea';
    return fieldBattleSideFor(report, player.settlementId) ?? 'sidea';
}
function tradeSideOf(report) {
    if (!player.settlementId)
        return 'poster';
    return tradeSideFor(report, player.settlementId) ?? 'poster';
}
const filteredItems = computed(() => filterInbox(reports.inboxItems, kindFilter.value));
const rows = computed(() => filteredItems.value.map((item) => {
    if (item.kind === 'battle') {
        const side = sideOf(item.report);
        return {
            kind: 'battle',
            item,
            id: item.report.id,
            outcome: outcomeLabel(item.report, side),
            isVictory: isVictoryFor(item.report, side),
            isTie: false,
            mission: missionLabel(item.report.mission),
            summary: reportSummaryLine(item.report, side),
            when: d(new Date(item.report.occurredAt), 'long'),
        };
    }
    if (item.kind === 'field') {
        const side = fieldSideOf(item.report);
        return {
            kind: 'field',
            item,
            id: item.report.id,
            outcome: fieldBattleOutcomeLabel(item.report, side),
            isVictory: isFieldBattleVictoryFor(item.report, side),
            isTie: item.report.winner === 'tie',
            mission: t('hud.fieldBattleReport.title'),
            summary: fieldBattleSummaryLine(item.report, side),
            when: d(new Date(item.report.occurredAt), 'long'),
        };
    }
    if (item.kind === 'camp') {
        const report = item.report;
        return {
            kind: 'camp',
            item,
            id: report.id,
            outcome: isCampReportVictory(report) ? t('hud.campReport.won') : t('hud.campReport.lost'),
            isVictory: isCampReportVictory(report),
            isTie: false,
            mission: t(`hud.campReport.kind.${report.kind}`),
            summary: t('hud.campReport.summary', {
                title: t(`hud.campReport.title.${report.kind}`, { camp: campName(report.camp.family) }),
                lost: totalUnitsLost(report),
                beasts: totalBeastsLost(report),
                loot: totalCampLoot(report.loot),
            }),
            when: d(new Date(report.occurredAt), 'long'),
        };
    }
    const side = tradeSideOf(item.report);
    return {
        kind: 'trade',
        item,
        id: item.report.id,
        outcome: null,
        isVictory: false,
        isTie: false,
        mission: item.report.guildTrade ? t('reports.trade.guildTrade') : t('reports.trade.trade'),
        summary: tradeSummaryLine(item.report, side),
        when: d(new Date(item.report.completedAt), 'long'),
    };
}));
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(DEMO_MODE, {});
    __VLS_withDotValue(player, {});
    __VLS_withDotValue(kindFilter, {});
    __VLS_withDotValue(reports, {});
    __VLS_withDotValue(rows, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['kind-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['kind-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['open']} */ ;
    /** @type {__VLS_StyleScopedClasses['chevron']} */ ;
    /** @type {__VLS_StyleScopedClasses['row-body']} */ ;
    /** @type {__VLS_StyleScopedClasses['outcome']} */ ;
    /** @type {__VLS_StyleScopedClasses['outcome']} */ ;
    /** @type {__VLS_StyleScopedClasses['outcome']} */ ;
    /** @type {__VLS_StyleScopedClasses['outcome']} */ ;
    /** @type {__VLS_StyleScopedClasses['simulator-link']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['kind-tabs']} */ ;
    /** @type {__VLS_StyleScopedClasses['kind-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['when']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "reports-view" },
    });
    /** @type {__VLS_StyleScopedClasses['reports-view']} */ ;
    if (DEMO_MODE.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('reports.demoModeHint'));
    }
    else if (!player.value.settlementId) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        (__VLS_ctx.$t('reports.noSettlement'));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
        (__VLS_ctx.$t('reports.title'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "kind-tabs" },
        });
        /** @type {__VLS_StyleScopedClasses['kind-tabs']} */ ;
        const __VLS_0 = __VLS_tryAsConstant(['all', 'battle', 'field', 'camp', 'trade']);
        for (const [tab] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        __VLS_withDotValue(DEMO_MODE, {});
                        if (!!(DEMO_MODE.value))
                            throw 0;
                        if (!!(!player.value.settlementId))
                            throw 0;
                        return (kindFilter.value = tab);
                        // @ts-ignore
                        [DEMO_MODE, $t, $t, $t, player, kindFilter,];
                    } },
                key: (tab),
                type: "button",
                ...{ class: "kind-tab" },
                ...{ class: ({ active: kindFilter.value === tab }) },
            });
            /** @type {__VLS_StyleScopedClasses['kind-tab']} */ ;
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            (__VLS_ctx.$t(`reports.tabs.${tab}`));
            // @ts-ignore
            [$t, kindFilter,];
        }
        if (reports.value.loading && !rows.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
            (__VLS_ctx.$t('common.states.loading'));
        }
        else if (reports.value.error) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "hint error" },
            });
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
            (reports.value.error);
        }
        else if (!rows.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "hint" },
            });
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            (__VLS_ctx.$t('reports.noReports'));
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ref: "listRef",
                ...{ class: "list" },
            });
            /** @type {__VLS_StyleScopedClasses['list']} */ ;
            const __VLS_1 = __VLS_tryAsConstant((rows.value));
            for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (row.id),
                    ...{ class: "item" },
                    'data-report-id': (row.id),
                });
                /** @type {__VLS_StyleScopedClasses['item']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            __VLS_withDotValue(DEMO_MODE, {});
                            if (!!(DEMO_MODE.value))
                                throw 0;
                            if (!!(!player.value.settlementId))
                                throw 0;
                            if (!!(reports.value.loading && !rows.value.length))
                                throw 0;
                            if (!!(reports.value.error))
                                throw 0;
                            if (!!(!rows.value.length))
                                throw 0;
                            return (toggle(row.id));
                            // @ts-ignore
                            [$t, $t, reports, reports, reports, rows, rows, rows,];
                        } },
                    type: "button",
                    ...{ class: "row" },
                    ...{ class: ({ open: isExpanded(row.id) }) },
                    'data-testid': "report-row",
                    'aria-expanded': (isExpanded(row.id)),
                });
                /** @type {__VLS_StyleScopedClasses['row']} */ ;
                /** @type {__VLS_StyleScopedClasses['open']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "row-top" },
                });
                /** @type {__VLS_StyleScopedClasses['row-top']} */ ;
                if (row.kind === 'battle' || row.kind === 'field' || row.kind === 'camp') {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "outcome" },
                        ...{ class: (row.isTie ? 'tie' : row.isVictory ? 'victory' : 'defeat') },
                    });
                    /** @type {__VLS_StyleScopedClasses['outcome']} */ ;
                    (row.outcome);
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "outcome trade-outcome" },
                    });
                    /** @type {__VLS_StyleScopedClasses['outcome']} */ ;
                    /** @type {__VLS_StyleScopedClasses['trade-outcome']} */ ;
                    (__VLS_ctx.$t('reports.trade.trade'));
                }
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "mission-pill" },
                });
                /** @type {__VLS_StyleScopedClasses['mission-pill']} */ ;
                (row.mission);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "when" },
                });
                /** @type {__VLS_StyleScopedClasses['when']} */ ;
                (row.when);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                    ...{ class: "chevron" },
                    'aria-hidden': "true",
                });
                /** @type {__VLS_StyleScopedClasses['chevron']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "row-summary" },
                });
                /** @type {__VLS_StyleScopedClasses['row-summary']} */ ;
                (row.summary);
                if (isExpanded(row.id)) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                        ...{ class: "row-body" },
                        'data-testid': "report-detail",
                    });
                    /** @type {__VLS_StyleScopedClasses['row-body']} */ ;
                    if (row.item.kind === 'battle') {
                        const __VLS_2 = BattleReportCard;
                        // @ts-ignore
                        const __VLS_3 = __VLS_asFunctionalComponent1(__VLS_2, new __VLS_2({
                            // @ts-ignore
                            report: (row.item.report), side: (sideOf(row.item.report)), occurredAt: (row.item.report.occurredAt),
                        }));
                        const __VLS_4 = __VLS_3({
                            report: (row.item.report),
                            side: (sideOf(row.item.report)),
                            occurredAt: (row.item.report.occurredAt),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_3));
                    }
                    else if (row.item.kind === 'field') {
                        const __VLS_7 = FieldBattleReportCard;
                        // @ts-ignore
                        const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
                            // @ts-ignore
                            report: (row.item.report), side: (fieldSideOf(row.item.report)), occurredAt: (row.item.report.occurredAt),
                        }));
                        const __VLS_9 = __VLS_8({
                            report: (row.item.report),
                            side: (fieldSideOf(row.item.report)),
                            occurredAt: (row.item.report.occurredAt),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_8));
                    }
                    else if (row.item.kind === 'camp') {
                        const __VLS_12 = CampReportCard;
                        // @ts-ignore
                        const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
                            // @ts-ignore
                            report: (row.item.report),
                        }));
                        const __VLS_14 = __VLS_13({
                            report: (row.item.report),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
                    }
                    else {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "card trade" },
                        });
                        /** @type {__VLS_StyleScopedClasses['card']} */ ;
                        /** @type {__VLS_StyleScopedClasses['trade']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "card-header" },
                        });
                        /** @type {__VLS_StyleScopedClasses['card-header']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "banner trade-banner" },
                        });
                        /** @type {__VLS_StyleScopedClasses['banner']} */ ;
                        /** @type {__VLS_StyleScopedClasses['trade-banner']} */ ;
                        (__VLS_ctx.$t('reports.trade.completed'));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "mission-pill" },
                        });
                        /** @type {__VLS_StyleScopedClasses['mission-pill']} */ ;
                        (row.mission);
                        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                            ...{ class: "occurred" },
                        });
                        /** @type {__VLS_StyleScopedClasses['occurred']} */ ;
                        (row.when);
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
                        (__VLS_ctx.$t('reports.trade.youGave'));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "power-value" },
                        });
                        /** @type {__VLS_StyleScopedClasses['power-value']} */ ;
                        (Math.round(tradeSideOf(row.item.report) === 'poster' ? row.item.report.offeredAmount : row.item.report.requestedAmount));
                        (tradeSideOf(row.item.report) === 'poster' ? row.item.report.offeredResource : row.item.report.requestedResource);
                        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                            ...{ class: "power" },
                        });
                        /** @type {__VLS_StyleScopedClasses['power']} */ ;
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "power-label" },
                        });
                        /** @type {__VLS_StyleScopedClasses['power-label']} */ ;
                        (__VLS_ctx.$t('reports.trade.youReceived'));
                        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                            ...{ class: "power-value" },
                        });
                        /** @type {__VLS_StyleScopedClasses['power-value']} */ ;
                        (Math.round(tradeSideOf(row.item.report) === 'poster' ? row.item.report.requestedAmount : row.item.report.offeredAmount));
                        (tradeSideOf(row.item.report) === 'poster' ? row.item.report.requestedResource : row.item.report.offeredResource);
                        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                            ...{ class: "trade-travel" },
                        });
                        /** @type {__VLS_StyleScopedClasses['trade-travel']} */ ;
                        (__VLS_ctx.$t('reports.trade.travelled', { hours: row.item.report.travelHours.toFixed(1) }));
                    }
                }
                // @ts-ignore
                [$t, $t, $t, $t, $t,];
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "simulator-link" },
        });
        /** @type {__VLS_StyleScopedClasses['simulator-link']} */ ;
        (__VLS_ctx.$t('reports.simulatorHint'));
        let __VLS_17;
        /** @ts-ignore @type { | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link'] | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components['router-link']} */
        routerLink;
        // @ts-ignore
        const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
            // @ts-ignore
            to: "/simulator",
        }));
        const __VLS_19 = __VLS_18({
            to: "/simulator",
        }, ...__VLS_functionalComponentArgsRest(__VLS_18));
        var __VLS_20;
        const { default: __VLS_22 } = __VLS_nonNull(__VLS_20.slots);
        (__VLS_ctx.$t('reports.simulatorLink'));
        // @ts-ignore
        [$t, $t,];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
