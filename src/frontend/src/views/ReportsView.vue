<script setup lang="ts">
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
import type { BattleReportResponse, FieldBattleReportResponse, TradeReportResponse } from '../api/types';
import { isVictoryFor, missionLabel, outcomeLabel, reportSummaryLine, sideFor } from '../lib/units/battleReports';
import {
  fieldBattleOutcomeLabel,
  fieldBattleSideFor,
  fieldBattleSummaryLine,
  isFieldBattleVictoryFor,
} from '../lib/units/fieldBattleReports';
import { tradeSideFor, tradeSummaryLine } from '../lib/units/tradeReports';
import { type InboxKindFilter, filterInbox } from '../lib/units/inbox';
import { reportsLocation } from '../lib/modalRoute';
import BattleReportCard from '../components/battle/BattleReportCard.vue';
import FieldBattleReportCard from '../components/battle/FieldBattleReportCard.vue';
import CampReportCard from '../components/battle/CampReportCard.vue';
import { campName } from '../i18n/catalogueNames';
import { isCampReportVictory, totalBeastsLost, totalCampLoot, totalUnitsLost } from '../lib/units/campReports';
import type { MessageSchema } from '../i18n/schema';

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
const reports = useReportsStore();

const reportId = computed(() => (typeof route.params.reportId === 'string' ? route.params.reportId : null));
const kindFilter = ref<InboxKindFilter>('all');

async function load() {
  if (!player.settlementId) return;
  await reports.load(player.settlementId, player.id);
  // Opening the inbox (list or a specific report) is what "reading it"
  // means client-side — see stores/reports.ts's own comment on why there is
  // no backend read-state to defer to instead.
  reports.markAllSeen();
}

onMounted(load);
watch(() => player.settlementId, load);

function open(id: string) {
  router.push(reportsLocation(router, id));
}
// Exposed to ReportsModal.vue for the mobile header's back chevron on a
// detail (list → this modal's own close() instead, since there's nowhere
// "up" from the list). Goes back in history when the previous entry really
// is the list (an in-app "open a report" navigation), otherwise replaces
// with the list location instead of leaving a stray detail entry in
// history — same reasoning as RouteModal.vue's own close().
function backToList() {
  const state = router.options.history.state as { back?: unknown };
  if (state.back === '/reports') {
    router.back();
  } else {
    router.replace(reportsLocation(router));
  }
}

function sideOf(report: BattleReportResponse): 'attacker' | 'defender' {
  if (!player.settlementId) return 'attacker';
  return sideFor(report, player.settlementId) ?? 'attacker';
}

function fieldSideOf(report: FieldBattleReportResponse): 'sidea' | 'sideb' {
  if (!player.settlementId) return 'sidea';
  return fieldBattleSideFor(report, player.settlementId) ?? 'sidea';
}

function tradeSideOf(report: TradeReportResponse): 'poster' | 'acceptor' {
  if (!player.settlementId) return 'poster';
  return tradeSideFor(report, player.settlementId) ?? 'poster';
}

const filteredItems = computed(() => filterInbox(reports.inboxItems, kindFilter.value));

const rows = computed(() =>
  filteredItems.value.map((item) => {
    if (item.kind === 'battle') {
      const side = sideOf(item.report);
      return {
        kind: 'battle' as const,
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
        kind: 'field' as const,
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
        kind: 'camp' as const,
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
      kind: 'trade' as const,
      id: item.report.id,
      outcome: null,
      isVictory: false,
      isTie: false,
      mission: item.report.guildTrade ? t('reports.trade.guildTrade') : t('reports.trade.trade'),
      summary: tradeSummaryLine(item.report, side),
      when: d(new Date(item.report.completedAt), 'long'),
    };
  }),
);

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
  if (detail.value) return missionLabel(detail.value.mission);
  if (fieldDetail.value) return t('hud.fieldBattleReport.title');
  if (campDetail.value) return t(`hud.campReport.kind.${campDetail.value.kind}`);
  if (tradeDetail.value) return tradeDetail.value.guildTrade ? t('reports.trade.guildTrade') : t('reports.trade.trade');
  return t('reports.title');
});

defineExpose({ detailTitle, isDetail, backToList });
</script>

<template>
  <div class="reports-view">
    <p v-if="DEMO_MODE" class="hint">{{ $t('reports.demoModeHint') }}</p>
    <p v-else-if="!player.settlementId" class="hint">{{ $t('reports.noSettlement') }}</p>

    <template v-else-if="tradeDetail">
      <button type="button" class="back-to-list" data-testid="reports-back-to-list" @click="backToList">
        {{ $t('reports.backToList') }}
      </button>
      <div class="card trade" data-testid="report-detail">
        <div class="card-header">
          <span class="banner trade-banner">{{ $t('reports.trade.completed') }}</span>
          <span class="mission-pill">{{
            tradeDetail.guildTrade ? $t('reports.trade.guildTrade') : $t('reports.trade.trade')
          }}</span>
        </div>
        <p class="occurred">{{ d(new Date(tradeDetail.completedAt), 'long') }}</p>

        <div class="power-row">
          <div class="power">
            <span class="power-label">{{ $t('reports.trade.youGave') }}</span>
            <span class="power-value">
              {{ Math.round(tradeDetailSide === 'poster' ? tradeDetail.offeredAmount : tradeDetail.requestedAmount) }}
              {{ tradeDetailSide === 'poster' ? tradeDetail.offeredResource : tradeDetail.requestedResource }}
            </span>
          </div>
          <div class="power">
            <span class="power-label">{{ $t('reports.trade.youReceived') }}</span>
            <span class="power-value">
              {{ Math.round(tradeDetailSide === 'poster' ? tradeDetail.requestedAmount : tradeDetail.offeredAmount) }}
              {{ tradeDetailSide === 'poster' ? tradeDetail.requestedResource : tradeDetail.offeredResource }}
            </span>
          </div>
        </div>

        <p class="trade-travel">{{ $t('reports.trade.travelled', { hours: tradeDetail.travelHours.toFixed(1) }) }}</p>
      </div>
    </template>

    <template v-else-if="detail">
      <button type="button" class="back-to-list" data-testid="reports-back-to-list" @click="backToList">
        {{ $t('reports.backToList') }}
      </button>
      <div data-testid="report-detail">
        <BattleReportCard :report="detail" :side="detailSide" :occurred-at="detail.occurredAt" />
      </div>
    </template>

    <template v-else-if="fieldDetail">
      <button type="button" class="back-to-list" data-testid="reports-back-to-list" @click="backToList">
        {{ $t('reports.backToList') }}
      </button>
      <div data-testid="report-detail">
        <FieldBattleReportCard :report="fieldDetail" :side="fieldDetailSide" :occurred-at="fieldDetail.occurredAt" />
      </div>
    </template>

    <template v-else-if="campDetail">
      <button type="button" class="back-to-list" data-testid="reports-back-to-list" @click="backToList">
        {{ $t('reports.backToList') }}
      </button>
      <div data-testid="report-detail">
        <CampReportCard :report="campDetail" />
      </div>
    </template>

    <template v-else>
      <h1>{{ $t('reports.title') }}</h1>

      <div class="kind-tabs">
        <button
          v-for="tab in (['all', 'battle', 'field', 'camp', 'trade'] as const)"
          :key="tab"
          type="button"
          class="kind-tab"
          :class="{ active: kindFilter === tab }"
          @click="kindFilter = tab"
        >
          {{ $t(`reports.tabs.${tab}`) }}
        </button>
      </div>

      <p v-if="reports.loading && !rows.length">{{ $t('common.states.loading') }}</p>
      <p v-else-if="reports.error" class="hint error">{{ reports.error }}</p>
      <p v-else-if="!rows.length" class="hint">{{ $t('reports.noReports') }}</p>

      <div v-else class="list">
        <button
          v-for="row in rows"
          :key="row.id"
          type="button"
          class="row"
          data-testid="report-row"
          @click="open(row.id)"
        >
          <div class="row-top">
            <span
              v-if="row.kind === 'battle' || row.kind === 'field' || row.kind === 'camp'"
              class="outcome"
              :class="row.isTie ? 'tie' : row.isVictory ? 'victory' : 'defeat'"
            >
              {{ row.outcome }}
            </span>
            <span v-else class="outcome trade-outcome">{{ $t('reports.trade.trade') }}</span>
            <span class="mission-pill">{{ row.mission }}</span>
            <span class="when">{{ row.when }}</span>
          </div>
          <div class="row-summary">{{ row.summary }}</div>
        </button>
      </div>

      <p class="simulator-link">
        {{ $t('reports.simulatorHint') }}
        <router-link to="/simulator">{{ $t('reports.simulatorLink') }}</router-link>
      </p>
    </template>
  </div>
</template>

<style scoped>
/* Content padding suits a dialog (RouteModal.vue supplies the backdrop,
   panel and its own scrolling) — no page-height/background rules here
   anymore, unlike when this was a standalone route. */
.reports-view {
  padding: 20px 24px 28px;
  color: var(--text);
}
h1 {
  margin: 0;
}
.hint {
  color: var(--muted);
}
.error {
  color: #e08a8a;
}

/* Desktop-only "← Reports" back button — on mobile, ReportsModal.vue's
   header chevron does the same job (see MOBILE_MODAL_MAX_WIDTH's own
   comment on why this literal must be kept in sync by hand: plain CSS here
   has no access to the shared TS constant inside a `@media` condition). */
.back-to-list {
  display: inline-block;
  margin-bottom: 16px;
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.back-to-list:hover {
  border-color: var(--gold);
}
/* Same for the list's own "Reports" heading: the mobile header bar already
   titles the modal, so showing it twice just pushes the list down. */
@media (max-width: 640px) {
  .back-to-list,
  h1 {
    display: none;
  }
}

.kind-tabs {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  /* Mobile-readiness audit: four tabs plus longer German labels don't fit a
     360px width without wrapping the row's height around — a horizontal
     scroll strip keeps the tabs' own row a single, predictable height. */
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.kind-tab {
  flex: none;
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--muted);
  padding: 6px 14px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  font-family: inherit;
}
.kind-tab:hover {
  color: var(--text);
}
.kind-tab.active {
  border-color: var(--gold);
  color: var(--gold);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 20px;
}
.row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 0;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.row:hover {
  border-color: var(--gold);
}
.row-top {
  display: flex;
  align-items: center;
  gap: 10px;
  /* Mobile-readiness audit: wraps rather than squeezing the date against
     the mission pill at 360px — the `.when` rule below moves it to its own
     full-width line once wrapped, instead of leaving it half-squeezed next
     to the pill. */
  flex-wrap: wrap;
}
.outcome {
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.outcome.victory {
  color: var(--gold);
}
.outcome.defeat {
  color: #e08a8a;
}
.outcome.tie {
  color: var(--muted);
}
.outcome.trade-outcome {
  color: var(--gold);
}
.mission-pill {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  color: var(--muted);
}
.when {
  margin-left: auto;
  font-size: 12px;
  color: var(--muted);
}
.row-summary {
  font-size: 13px;
  color: var(--muted);
}
.simulator-link {
  margin-top: 20px;
  font-size: 13px;
  color: var(--muted);
}
.simulator-link a {
  color: var(--gold);
}

.card {
  margin-top: 0;
  padding: 20px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-left: 4px solid var(--panel-border);
}
.card.trade {
  border-left-color: var(--gold);
}
.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.banner {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.trade-banner {
  color: var(--gold);
}
.trade-travel {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}
.occurred {
  margin: 4px 0 16px;
  font-size: 12px;
  color: var(--muted);
}
.power-row {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  /* Mobile-readiness audit: two power values side by side don't both fit at
     360px with room to breathe — wrap instead of squeezing their numbers. */
  flex-wrap: wrap;
}
.power {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.power-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.power-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}

@media (max-width: 640px) {
  /* Touch targets >= 40px tall for the list rows and kind-filter tabs. */
  .row {
    min-height: 40px;
    justify-content: center;
  }
  .kind-tabs {
    /* The heading above it is hidden on mobile (see .back-to-list's block). */
    margin-top: 0;
  }
  .kind-tab {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
  }
  .when {
    /* Drops to its own full-width line under `.row-top`'s wrap above,
       instead of sitting squeezed against the mission pill. */
    margin-left: 0;
    flex: 1 0 100%;
  }
}
</style>
