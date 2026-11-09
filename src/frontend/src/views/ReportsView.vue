<script setup lang="ts">
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
import BattleReportCard from '../components/battle/BattleReportCard.vue';
import FieldBattleReportCard from '../components/battle/FieldBattleReportCard.vue';
import CampReportCard from '../components/battle/CampReportCard.vue';
import { campName } from '../i18n/catalogueNames';
import { isCampReportVictory, totalBeastsLost, totalCampLoot, totalUnitsLost } from '../lib/units/campReports';
import type { MessageSchema } from '../i18n/schema';

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const route = useRoute();
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

// Rows currently expanded. Local state, not the URL: any number can be open at once.
const expanded = ref(new Set<string>());
const listRef = ref<HTMLElement | null>(null);
function isExpanded(id: string): boolean {
  return expanded.value.has(id);
}
function toggle(id: string) {
  const next = new Set(expanded.value);
  if (!next.delete(id)) next.add(id);
  expanded.value = next;
}
// A deep link (`/reports/:reportId`) opens that report's row and brings it into view once the list has rendered.
watch(
  reportId,
  async (id) => {
    if (!id) return;
    expanded.value = new Set(expanded.value).add(id);
    await nextTick();
    listRef.value?.querySelector<HTMLElement>(`[data-report-id="${CSS.escape(id)}"]`)?.scrollIntoView?.({ block: 'nearest' });
  },
  { immediate: true },
);
watch(
  () => reports.inboxItems.length,
  async () => {
    if (!reportId.value) return;
    await nextTick();
    listRef.value?.querySelector<HTMLElement>(`[data-report-id="${CSS.escape(reportId.value)}"]`)?.scrollIntoView?.({ block: 'nearest' });
  },
);

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
        kind: 'field' as const,
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
        kind: 'camp' as const,
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
      kind: 'trade' as const,
      item,
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
</script>

<template>
  <div class="reports-view">
    <p v-if="DEMO_MODE" class="hint">{{ $t('reports.demoModeHint') }}</p>
    <p v-else-if="!player.settlementId" class="hint">{{ $t('reports.noSettlement') }}</p>

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

      <div v-else ref="listRef" class="list">
        <div v-for="row in rows" :key="row.id" class="item" :data-report-id="row.id">
          <button
            type="button"
            class="row"
            :class="{ open: isExpanded(row.id) }"
            data-testid="report-row"
            :aria-expanded="isExpanded(row.id)"
            @click="toggle(row.id)"
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
              <span class="chevron" aria-hidden="true">▾</span>
            </div>
            <div class="row-summary">{{ row.summary }}</div>
          </button>

          <div v-if="isExpanded(row.id)" class="row-body" data-testid="report-detail">
            <BattleReportCard
              v-if="row.item.kind === 'battle'"
              :report="row.item.report"
              :side="sideOf(row.item.report)"
              :occurred-at="row.item.report.occurredAt"
            />
            <FieldBattleReportCard
              v-else-if="row.item.kind === 'field'"
              :report="row.item.report"
              :side="fieldSideOf(row.item.report)"
              :occurred-at="row.item.report.occurredAt"
            />
            <CampReportCard v-else-if="row.item.kind === 'camp'" :report="row.item.report" />
            <div v-else class="card trade">
              <div class="card-header">
                <span class="banner trade-banner">{{ $t('reports.trade.completed') }}</span>
                <span class="mission-pill">{{ row.mission }}</span>
              </div>
              <p class="occurred">{{ row.when }}</p>

              <div class="power-row">
                <div class="power">
                  <span class="power-label">{{ $t('reports.trade.youGave') }}</span>
                  <span class="power-value">
                    {{ Math.round(tradeSideOf(row.item.report) === 'poster' ? row.item.report.offeredAmount : row.item.report.requestedAmount) }}
                    {{ tradeSideOf(row.item.report) === 'poster' ? row.item.report.offeredResource : row.item.report.requestedResource }}
                  </span>
                </div>
                <div class="power">
                  <span class="power-label">{{ $t('reports.trade.youReceived') }}</span>
                  <span class="power-value">
                    {{ Math.round(tradeSideOf(row.item.report) === 'poster' ? row.item.report.requestedAmount : row.item.report.offeredAmount) }}
                    {{ tradeSideOf(row.item.report) === 'poster' ? row.item.report.requestedResource : row.item.report.offeredResource }}
                  </span>
                </div>
              </div>

              <p class="trade-travel">{{ $t('reports.trade.travelled', { hours: row.item.report.travelHours.toFixed(1) }) }}</p>
            </div>
          </div>
        </div>
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

/* The mobile header bar already titles the modal, so the list's own "Reports"
   heading would just push the list down (see MOBILE_MODAL_MAX_WIDTH's comment
   on why this literal must be kept in sync by hand). */
@media (max-width: 640px) {
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
.row {
  width: 100%;
}
.row:hover,
.row.open {
  border-color: var(--gold);
}
.chevron {
  color: var(--muted);
  transition: transform 0.15s;
}
.row.open .chevron {
  transform: rotate(180deg);
}
/* The expanded report sits directly under its row, the cards' own top margin dropped. */
.row-body {
  border: 1px solid var(--panel-border);
  border-top: 0;
}
.row-body :deep(.card) {
  margin-top: 0;
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
