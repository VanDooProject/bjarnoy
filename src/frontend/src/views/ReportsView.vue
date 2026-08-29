<script setup lang="ts">
// Issue #40 phase 3: battle-reports inbox and detail. One view/route
// (`/reports`, `/reports/:reportId`) rather than a HUD panel — a report is
// read at leisure, not tied to being on the settlement canvas, same
// reasoning LeaderboardView.vue's own route already follows. List and
// detail share this component (mirroring how ProfileView.vue reuses one
// component for "my profile" vs. "someone else's") rather than two
// separate views, since the detail is just "the list, but one row expanded
// to a full card" with no separate data-loading concern once the list
// itself is loaded.
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usePlayerStore } from '../stores/player';
import { useReportsStore } from '../stores/reports';
import { DEMO_MODE } from '../config';
import type { BattleReportResponse, TradeReportResponse } from '../api/types';
import {
  missionLabel,
  outcomeLabel,
  reportSummaryLine,
  siegeSummaryLine,
  sideFor,
  totalLoot,
} from '../lib/units/battleReports';
import { tradeSideFor, tradeSummaryLine } from '../lib/units/tradeReports';
import { type InboxKindFilter, filterInbox } from '../lib/units/inbox';

const route = useRoute();
const router = useRouter();
const player = usePlayerStore();
const reports = useReportsStore();

const reportId = computed(() => (typeof route.params.reportId === 'string' ? route.params.reportId : null));
const kindFilter = ref<InboxKindFilter>('all');

async function load() {
  if (!player.settlementId) return;
  await reports.load(player.settlementId);
  // Opening the inbox (list or a specific report) is what "reading it"
  // means client-side — see stores/reports.ts's own comment on why there is
  // no backend read-state to defer to instead.
  reports.markAllSeen();
}

onMounted(load);
watch(() => player.settlementId, load);

function open(id: string) {
  router.push({ name: 'report-detail', params: { reportId: id } });
}
function backToList() {
  router.push({ name: 'reports' });
}

function sideOf(report: BattleReportResponse): 'attacker' | 'defender' {
  if (!player.settlementId) return 'attacker';
  return sideFor(report, player.settlementId) ?? 'attacker';
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
        mission: missionLabel(item.report.mission),
        summary: reportSummaryLine(item.report, side),
        when: new Date(item.report.occurredAt).toLocaleString(),
      };
    }
    const side = tradeSideOf(item.report);
    return {
      kind: 'trade' as const,
      id: item.report.id,
      outcome: null,
      mission: item.report.guildTrade ? 'Guild trade' : 'Trade',
      summary: tradeSummaryLine(item.report, side),
      when: new Date(item.report.completedAt).toLocaleString(),
    };
  }),
);

const detailItem = computed(() => reports.inboxItems.find((item) => item.report.id === reportId.value) ?? null);
const detail = computed(() => (detailItem.value?.kind === 'battle' ? detailItem.value.report : null));
const tradeDetail = computed(() => (detailItem.value?.kind === 'trade' ? detailItem.value.report : null));
const detailSide = computed(() => (detail.value ? sideOf(detail.value) : 'attacker'));
const detailOutcome = computed(() => (detail.value ? outcomeLabel(detail.value, detailSide.value) : null));
const detailLoot = computed(() => (detail.value ? totalLoot(detail.value.lootTaken) : 0));
const tradeDetailSide = computed(() => (tradeDetail.value ? tradeSideOf(tradeDetail.value) : 'poster'));
const detailSiegeSummary = computed(() => (detail.value?.siege ? siegeSummaryLine(detail.value.siege) : null));
</script>

<template>
  <div class="reports-view">
    <header class="topbar">
      <span class="brand">Fjørdhold</span>
      <button class="back" @click="detailItem ? backToList() : router.push('/settlement')">
        {{ detailItem ? '← Reports' : '← Back' }}
      </button>
    </header>

    <main class="body">
      <p v-if="DEMO_MODE" class="hint">Reports require the live backend and aren't wired up in demo mode.</p>
      <p v-else-if="!player.settlementId" class="hint">Found a settlement first to have any reports.</p>

      <template v-else-if="tradeDetail">
        <div class="card trade">
          <div class="card-header">
            <span class="banner trade-banner">Trade completed</span>
            <span class="mission-pill">{{ tradeDetail.guildTrade ? 'Guild trade' : 'Trade' }}</span>
          </div>
          <p class="occurred">{{ new Date(tradeDetail.completedAt).toLocaleString() }}</p>

          <div class="power-row">
            <div class="power">
              <span class="power-label">You gave</span>
              <span class="power-value">
                {{ Math.round(tradeDetailSide === 'poster' ? tradeDetail.offeredAmount : tradeDetail.requestedAmount) }}
                {{ tradeDetailSide === 'poster' ? tradeDetail.offeredResource : tradeDetail.requestedResource }}
              </span>
            </div>
            <div class="power">
              <span class="power-label">You received</span>
              <span class="power-value">
                {{ Math.round(tradeDetailSide === 'poster' ? tradeDetail.requestedAmount : tradeDetail.offeredAmount) }}
                {{ tradeDetailSide === 'poster' ? tradeDetail.requestedResource : tradeDetail.offeredResource }}
              </span>
            </div>
          </div>

          <p class="trade-travel">Carts travelled {{ tradeDetail.travelHours.toFixed(1) }}h.</p>
        </div>
      </template>

      <template v-else-if="detail">
        <div class="card" :class="detailOutcome === 'Victory' ? 'victory' : 'defeat'">
          <div class="card-header">
            <span class="banner">{{ detailOutcome }}</span>
            <span class="mission-pill">{{ missionLabel(detail.mission) }}</span>
          </div>
          <p class="occurred">{{ new Date(detail.occurredAt).toLocaleString() }}</p>

          <div class="power-row">
            <div class="power">
              <span class="power-label">Attack power</span>
              <span class="power-value">{{ Math.round(detail.attackPower) }}</span>
            </div>
            <div class="power">
              <span class="power-label">Defense power</span>
              <span class="power-value">{{ Math.round(detail.defensePower) }}</span>
            </div>
          </div>

          <div class="sides">
            <section class="side">
              <h3>Attacker</h3>
              <table class="lines">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Sent</th>
                    <th>Lost</th>
                    <th>Survived</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in detail.attackerLines" :key="line.unit">
                    <td>{{ line.unit }}</td>
                    <td>{{ line.sent }}</td>
                    <td class="lost">{{ line.lost }}</td>
                    <td class="survived">{{ line.survived }}</td>
                  </tr>
                  <tr v-if="!detail.attackerLines.length">
                    <td colspan="4" class="empty">No stacks recorded.</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section class="side">
              <h3>Defender</h3>
              <table class="lines">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Lost</th>
                    <th>Survived</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="line in detail.defenderLines" :key="line.unit">
                    <td>{{ line.unit }}</td>
                    <td class="lost">{{ line.lost }}</td>
                    <td class="survived">{{ line.survived }}</td>
                  </tr>
                  <tr v-if="!detail.defenderLines.length">
                    <td colspan="3" class="empty">No stacks recorded.</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>

          <div v-if="detailLoot > 0" class="loot">
            <h3>Loot taken</h3>
            <div class="loot-row">
              <span>Wood {{ Math.round(detail.lootTaken.wood) }}</span>
              <span>Stone {{ Math.round(detail.lootTaken.stone) }}</span>
              <span>Food {{ Math.round(detail.lootTaken.food) }}</span>
              <span>Iron {{ Math.round(detail.lootTaken.iron) }}</span>
            </div>
          </div>

          <div v-if="detail.siege" class="siege" :class="{ razed: detail.siege.settlementRazed }">
            <div v-if="detail.siege.settlementRazed" class="razed-banner">Settlement razed</div>
            <h3>Siege</h3>
            <p>{{ detailSiegeSummary }}</p>
            <p class="siege-coord">
              Hex ({{ detail.siege.targetCoord.q }}, {{ detail.siege.targetCoord.r }})
            </p>
          </div>
        </div>
      </template>

      <template v-else>
        <h1>Reports</h1>

        <div class="kind-tabs">
          <button
            v-for="tab in (['all', 'battle', 'trade'] as const)"
            :key="tab"
            type="button"
            class="kind-tab"
            :class="{ active: kindFilter === tab }"
            @click="kindFilter = tab"
          >
            {{ tab === 'all' ? 'All' : tab === 'battle' ? 'Battle' : 'Trade' }}
          </button>
        </div>

        <p v-if="reports.loading && !rows.length">Loading…</p>
        <p v-else-if="reports.error" class="hint error">{{ reports.error }}</p>
        <p v-else-if="!rows.length" class="hint">No reports yet.</p>

        <div v-else class="list">
          <button v-for="row in rows" :key="row.id" type="button" class="row" @click="open(row.id)">
            <div class="row-top">
              <span
                v-if="row.kind === 'battle'"
                class="outcome"
                :class="row.outcome === 'Victory' ? 'victory' : 'defeat'"
              >
                {{ row.outcome }}
              </span>
              <span v-else class="outcome trade-outcome">Trade</span>
              <span class="mission-pill">{{ row.mission }}</span>
              <span class="when">{{ row.when }}</span>
            </div>
            <div class="row-summary">{{ row.summary }}</div>
          </button>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.reports-view {
  width: 100vw;
  min-height: 100vh;
  overflow: auto;
  background: var(--shell);
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
}
.brand {
  font-weight: 600;
  font-size: 20px;
  color: var(--text);
}
.back {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.back:hover {
  border-color: var(--gold);
}
.body {
  max-width: 90ch;
  margin: 0 auto;
  padding: 0 28px 60px;
  color: var(--text);
}
.hint {
  color: var(--muted);
}
.error {
  color: #e08a8a;
}

.kind-tabs {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.kind-tab {
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

.card {
  margin-top: 20px;
  padding: 20px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-left: 4px solid var(--panel-border);
}
.card.victory {
  border-left-color: var(--gold);
}
.card.defeat {
  border-left-color: #e08a8a;
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
.card.victory .banner {
  color: var(--gold);
}
.card.defeat .banner {
  color: #e08a8a;
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
.sides {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}
.side h3,
.loot h3,
.siege h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.lines {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.lines th {
  text-align: left;
  padding: 4px 6px;
  border-bottom: 1px solid var(--panel-border);
  color: var(--muted);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
}
.lines td {
  padding: 4px 6px;
  border-bottom: 1px solid var(--panel-border);
}
.lines .lost {
  color: #e08a8a;
}
.lines .survived {
  color: #8ac48a;
}
.lines .empty {
  color: var(--muted);
  text-align: center;
}
.loot-row {
  display: flex;
  gap: 16px;
  font-size: 13px;
}
.siege {
  padding-top: 4px;
}
.siege p {
  font-size: 13px;
  margin: 0;
}
.siege-coord {
  margin-top: 2px !important;
  color: var(--muted);
  font-size: 12px !important;
}
/* Reuses the outcome-banner visual language from `.card`/`.banner`
   (win/loss, phase 3) for the one other "the state of this settlement just
   changed" moment a report can carry: its Longhouse was destroyed. */
.razed-banner {
  display: inline-block;
  margin-bottom: 8px;
  padding: 4px 10px;
  background: rgba(224, 138, 138, 0.12);
  border: 1px solid #e08a8a;
  border-radius: 4px;
  color: #e08a8a;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

@media (max-width: 640px) {
  .sides {
    grid-template-columns: 1fr;
  }
}
</style>
