/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="../../../../../../../root/.npm/_npx/2db181330ea4b15b/node_modules/@vue/language-core/types/props-fallback.d.ts" />
// Issue #40 phase 3: battle-reports inbox and detail — now rendered inside
// components/reports/ReportsModal.vue's shared dialog chrome as a modal over
// whatever page was showing before (see lib/modalRoute.ts and App.vue's own
// comment), rather than a full page of its own. This component keeps all of
// the actual reports logic (data loading, the kind filter, the list/detail
// split); ReportsModal.vue is only the chrome around it — mirroring how
// ProfileModal.vue wraps ProfileView.vue. List and detail still share this
// one component (mirroring how ProfileView.vue reuses one component for "my
// profile" vs. "someone else's") since the detail is just "the list, but
// one row expanded to a full card" with no separate data-loading concern
// once the list itself is loaded.
//
// The battle-detail card itself is BattleReportCard.vue (issue #40 phase 7)
// — extracted so the premium fight simulator can render its result with the
// exact same markup as a real report, rather than duplicating it.
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { usePlayerStore } from '../stores/player';
import { useReportsStore } from '../stores/reports';
import { DEMO_MODE } from '../config';
import { isVictoryFor, missionLabel, outcomeLabel, reportSummaryLine, sideFor } from '../lib/units/battleReports';
import { fieldBattleOutcomeLabel, fieldBattleSideFor, fieldBattleSummaryLine, isFieldBattleVictoryFor, } from '../lib/units/fieldBattleReports';
import { tradeSideFor, tradeSummaryLine } from '../lib/units/tradeReports';
import { filterInbox } from '../lib/units/inbox';
import { reportsLocation } from '../lib/modalRoute';
import BattleReportCard from '../components/battle/BattleReportCard.vue';
import FieldBattleReportCard from '../components/battle/FieldBattleReportCard.vue';
import CampReportCard from '../components/battle/CampReportCard.vue';
import { campName } from '../i18n/catalogueNames';
import { isCampReportVictory, totalBeastsLost, totalCampLoot, totalUnitsLost } from '../lib/units/campReports';
const { defineExpose, } = {};
const { t, d } = useI18n({ useScope: 'global' });
const route = useRoute();
const router = useRouter();
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
function open(id) {
    router.push(reportsLocation(router, id));
}
// Exposed to ReportsModal.vue for the mobile header's back chevron on a
// detail (list → this modal's own close() instead, since there's nowhere
// "up" from the list). Goes back in history when the previous entry really
// is the list (an in-app "open a report" navigation), otherwise replaces
// with the list location instead of leaving a stray detail entry in
// history — same reasoning as RouteModal.vue's own close().
function backToList() {
    const state = router.options.history.state;
    if (state.back === '/reports') {
        router.back();
    }
    else {
        router.replace(reportsLocation(router));
    }
}
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
        id: item.report.id,
        outcome: null,
        isVictory: false,
        isTie: false,
        mission: item.report.guildTrade ? t('reports.trade.guildTrade') : t('reports.trade.trade'),
        summary: tradeSummaryLine(item.report, side),
        when: d(new Date(item.report.completedAt), 'long'),
    };
}));
const detailItem = computed(() => reports.inboxItems.find((item) => item.report.id === reportId.value) ?? null);
const detail = computed(() => (detailItem.value?.kind === 'battle' ? detailItem.value.report : null));
const fieldDetail = computed(() => (detailItem.value?.kind === 'field' ? detailItem.value.report : null));
const campDetail = computed(() => (detailItem.value?.kind === 'camp' ? detailItem.value.report : null));
const tradeDetail = computed(() => (detailItem.value?.kind === 'trade' ? detailItem.value.report : null));
const detailSide = computed(() => (detail.value ? sideOf(detail.value) : 'attacker'));
const fieldDetailSide = computed(() => (fieldDetail.value ? fieldSideOf(fieldDetail.value) : 'sidea'));
const tradeDetailSide = computed(() => (tradeDetail.value ? tradeSideOf(tradeDetail.value) : 'poster'));
// Exposed to ReportsModal.vue for the modal's title: the mobile header bar
// (list title, or a short label for whichever detail is open) and the
// mobile chevron's target (isDetail decides whether it goes to backToList()
// or falls through to RouteModal's own close()).
const isDetail = computed(() => detailItem.value !== null);
const detailTitle = computed(() => {
    if (detail.value)
        return missionLabel(detail.value.mission);
    if (fieldDetail.value)
        return t('hud.fieldBattleReport.title');
    if (campDetail.value)
        return t(`hud.campReport.kind.${campDetail.value.kind}`);
    if (tradeDetail.value)
        return tradeDetail.value.guildTrade ? t('reports.trade.guildTrade') : t('reports.trade.trade');
    return t('reports.title');
});
const __VLS_exposed = { detailTitle, isDetail, backToList };
defineExpose(__VLS_exposed);
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(DEMO_MODE, {});
    __VLS_withDotValue(player, {});
    __VLS_withDotValue(tradeDetail, {});
    __VLS_withDotValue(tradeDetailSide, {});
    __VLS_withDotValue(detail, {});
    __VLS_withDotValue(fieldDetail, {});
    __VLS_withDotValue(campDetail, {});
    __VLS_withDotValue(kindFilter, {});
    __VLS_withDotValue(reports, {});
    __VLS_withDotValue(rows, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['back-to-list']} */ ;
    /** @type {__VLS_StyleScopedClasses['back-to-list']} */ ;
    /** @type {__VLS_StyleScopedClasses['kind-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['kind-tab']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['outcome']} */ ;
    /** @type {__VLS_StyleScopedClasses['outcome']} */ ;
    /** @type {__VLS_StyleScopedClasses['outcome']} */ ;
    /** @type {__VLS_StyleScopedClasses['outcome']} */ ;
    /** @type {__VLS_StyleScopedClasses['simulator-link']} */ ;
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
    else if (tradeDetail.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (backToList) },
            type: "button",
            ...{ class: "back-to-list" },
            'data-testid': "reports-back-to-list",
        });
        /** @type {__VLS_StyleScopedClasses['back-to-list']} */ ;
        (__VLS_ctx.$t('reports.backToList'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "card trade" },
            'data-testid': "report-detail",
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
        (tradeDetail.value.guildTrade ? __VLS_ctx.$t('reports.trade.guildTrade') : __VLS_ctx.$t('reports.trade.trade'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "occurred" },
        });
        /** @type {__VLS_StyleScopedClasses['occurred']} */ ;
        (__VLS_unwrap(d, {})(new Date(tradeDetail.value.completedAt), 'long'));
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
        (Math.round(tradeDetailSide.value === 'poster' ? tradeDetail.value.offeredAmount : tradeDetail.value.requestedAmount));
        (tradeDetailSide.value === 'poster' ? tradeDetail.value.offeredResource : tradeDetail.value.requestedResource);
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
        (Math.round(tradeDetailSide.value === 'poster' ? tradeDetail.value.requestedAmount : tradeDetail.value.offeredAmount));
        (tradeDetailSide.value === 'poster' ? tradeDetail.value.requestedResource : tradeDetail.value.offeredResource);
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "trade-travel" },
        });
        /** @type {__VLS_StyleScopedClasses['trade-travel']} */ ;
        (__VLS_ctx.$t('reports.trade.travelled', { hours: tradeDetail.value.travelHours.toFixed(1) }));
    }
    else if (detail.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (backToList) },
            type: "button",
            ...{ class: "back-to-list" },
            'data-testid': "reports-back-to-list",
        });
        /** @type {__VLS_StyleScopedClasses['back-to-list']} */ ;
        (__VLS_ctx.$t('reports.backToList'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            'data-testid': "report-detail",
        });
        const __VLS_0 = BattleReportCard;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            report: (detail.value), side: (__VLS_unwrap(detailSide, {})), occurredAt: (detail.value.occurredAt),
        }));
        const __VLS_2 = __VLS_1({
            report: (detail.value),
            side: (__VLS_unwrap(detailSide, {})),
            occurredAt: (detail.value.occurredAt),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    }
    else if (fieldDetail.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (backToList) },
            type: "button",
            ...{ class: "back-to-list" },
            'data-testid': "reports-back-to-list",
        });
        /** @type {__VLS_StyleScopedClasses['back-to-list']} */ ;
        (__VLS_ctx.$t('reports.backToList'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            'data-testid': "report-detail",
        });
        const __VLS_5 = FieldBattleReportCard;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
            // @ts-ignore
            report: (fieldDetail.value), side: (__VLS_unwrap(fieldDetailSide, {})), occurredAt: (fieldDetail.value.occurredAt),
        }));
        const __VLS_7 = __VLS_6({
            report: (fieldDetail.value),
            side: (__VLS_unwrap(fieldDetailSide, {})),
            occurredAt: (fieldDetail.value.occurredAt),
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    }
    else if (campDetail.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (backToList) },
            type: "button",
            ...{ class: "back-to-list" },
            'data-testid': "reports-back-to-list",
        });
        /** @type {__VLS_StyleScopedClasses['back-to-list']} */ ;
        (__VLS_ctx.$t('reports.backToList'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            'data-testid': "report-detail",
        });
        const __VLS_10 = CampReportCard;
        // @ts-ignore
        const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
            // @ts-ignore
            report: (campDetail.value),
        }));
        const __VLS_12 = __VLS_11({
            report: (campDetail.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
        (__VLS_ctx.$t('reports.title'));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "kind-tabs" },
        });
        /** @type {__VLS_StyleScopedClasses['kind-tabs']} */ ;
        const __VLS_15 = __VLS_tryAsConstant(['all', 'battle', 'field', 'camp', 'trade']);
        for (const [tab] of __VLS_vFor(__VLS_nonNull(__VLS_15))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        __VLS_withDotValue(DEMO_MODE, {});
                        if (!!(DEMO_MODE.value))
                            throw 0;
                        if (!!(!player.value.settlementId))
                            throw 0;
                        if (!!(tradeDetail.value))
                            throw 0;
                        if (!!(detail.value))
                            throw 0;
                        if (!!(fieldDetail.value))
                            throw 0;
                        if (!!(campDetail.value))
                            throw 0;
                        return (kindFilter.value = tab);
                        // @ts-ignore
                        [DEMO_MODE, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, $t, player, tradeDetail, tradeDetail, tradeDetail, tradeDetail, tradeDetail, tradeDetail, tradeDetail, tradeDetail, tradeDetail, tradeDetail, tradeDetail, tradeDetail, d, tradeDetailSide, tradeDetailSide, tradeDetailSide, tradeDetailSide, detail, detail, detail, detailSide, fieldDetail, fieldDetail, fieldDetail, fieldDetailSide, campDetail, campDetail, kindFilter,];
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
                ...{ class: "list" },
            });
            /** @type {__VLS_StyleScopedClasses['list']} */ ;
            const __VLS_16 = __VLS_tryAsConstant((rows.value));
            for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_16))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            __VLS_withDotValue(DEMO_MODE, {});
                            if (!!(DEMO_MODE.value))
                                throw 0;
                            if (!!(!player.value.settlementId))
                                throw 0;
                            if (!!(tradeDetail.value))
                                throw 0;
                            if (!!(detail.value))
                                throw 0;
                            if (!!(fieldDetail.value))
                                throw 0;
                            if (!!(campDetail.value))
                                throw 0;
                            if (!!(reports.value.loading && !rows.value.length))
                                throw 0;
                            if (!!(reports.value.error))
                                throw 0;
                            if (!!(!rows.value.length))
                                throw 0;
                            return (open(row.id));
                            // @ts-ignore
                            [$t, $t, reports, reports, reports, rows, rows, rows,];
                        } },
                    key: (row.id),
                    type: "button",
                    ...{ class: "row" },
                    'data-testid': "report-row",
                });
                /** @type {__VLS_StyleScopedClasses['row']} */ ;
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
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "row-summary" },
                });
                /** @type {__VLS_StyleScopedClasses['row-summary']} */ ;
                (row.summary);
                // @ts-ignore
                [$t,];
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
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
});
export default {};
