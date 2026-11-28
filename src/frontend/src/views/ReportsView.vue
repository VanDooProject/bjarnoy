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
// Reading is per report: expanding an unread row marks it read (the server
// keeps that per player), opening the window marks nothing. A row opened this
// way stays in the "Unread" group until it is collapsed, so it does not jump
// away under the cursor; "Mark read" clears the whole group at once.
//
// The battle-detail card itself is BattleReportCard.vue (issue #40 phase 7)
// — extracted so the premium fight simulator can render its result with the
// exact same markup as a real report, rather than duplicating it.
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { usePlayerStore } from '../stores/player';
import { useReportsStore } from '../stores/reports';
import { useWorldStore } from '../stores/world';
import { DEMO_MODE } from '../config';
import { INBOX_KINDS, type InboxKindFilter, filterInbox, inboxKey } from '../lib/units/inbox';
import { fieldSideOf, sideOf, tradeSideOf, useInboxGroups, type InboxRowView } from '../composables/useInboxRows';
import BattleReportCard from '../components/battle/BattleReportCard.vue';
import FieldBattleReportCard from '../components/battle/FieldBattleReportCard.vue';
import CampReportCard from '../components/battle/CampReportCard.vue';
import ArmyReportCard from '../components/battle/ArmyReportCard.vue';
import ReportKindIcon from '../components/battle/ReportKindIcon.vue';
import ReportInboxRow from '../components/reports/ReportInboxRow.vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const route = useRoute();
const player = usePlayerStore();
const reports = useReportsStore();
const world = useWorldStore();

const reportId = computed(() => (typeof route.params.reportId === 'string' ? route.params.reportId : null));
const kindFilter = ref<InboxKindFilter>('all');
const tabs = ['all', ...INBOX_KINDS] as const;

async function load() {
  if (!world.worldId) return;
  await reports.load(world.worldId, player.id);
}

onMounted(load);
watch(() => world.worldId, load);

// Rows currently expanded. Local state, not the URL: any number can be open at once.
const expanded = ref(new Set<string>());
// Keys of the rows opened while unread: they stay in the "Unread" group until collapsed.
const keptOpen = ref(new Set<string>());
const listRef = ref<HTMLElement | null>(null);
function isExpanded(id: string): boolean {
  return expanded.value.has(id);
}
function expand(row: InboxRowView) {
  expanded.value = new Set(expanded.value).add(row.id);
  if (row.unread) {
    keptOpen.value = new Set(keptOpen.value).add(row.key);
    void reports.markRead(row.item);
  }
}
function toggle(row: InboxRowView) {
  if (!expanded.value.has(row.id)) {
    expand(row);
    return;
  }
  const nextExpanded = new Set(expanded.value);
  nextExpanded.delete(row.id);
  expanded.value = nextExpanded;
  const nextKept = new Set(keptOpen.value);
  nextKept.delete(row.key);
  keptOpen.value = nextKept;
}

const filteredItems = computed(() => filterInbox(reports.inboxItems, kindFilter.value));
const { unread, earlier } = useInboxGroups(filteredItems, keptOpen);
const sections = computed(() => [
  { key: 'unread' as const, rows: unread.value },
  { key: 'earlier' as const, rows: earlier.value },
]);
const rowCount = computed(() => unread.value.length + earlier.value.length);

// A deep link (`/reports/:reportId`) opens that report's row (once, when the list has it) and brings it into view.
let deepLinked: string | null = null;
watch(
  [reportId, () => reports.inboxItems],
  async ([id, items]) => {
    if (!id) {
      deepLinked = null;
      return;
    }
    if (deepLinked === id) return;
    const item = items.find((candidate) => candidate.report.id === id);
    if (!item) return;
    deepLinked = id;
    const key = inboxKey(item);
    const rows = [...unread.value, ...earlier.value];
    const row = rows.find((candidate) => candidate.key === key);
    if (row) expand(row);
    await nextTick();
    listRef.value?.querySelector<HTMLElement>(`[data-report-id="${CSS.escape(id)}"]`)?.scrollIntoView?.({ block: 'nearest' });
  },
  { immediate: true },
);

function tabCount(tab: (typeof tabs)[number]): number {
  return tab === 'all' ? reports.unreadCount : reports.unreadCountByKind[tab];
}
function tabLabel(tab: (typeof tabs)[number]): string {
  const name = t(`reports.tabs.${tab}`);
  const count = tabCount(tab);
  return count ? t('reports.tabs.withUnread', { kind: name, count }) : name;
}
</script>

<template>
  <div class="reports-view">
    <p v-if="DEMO_MODE" class="hint">{{ $t('reports.demoModeHint') }}</p>
    <p v-else-if="!player.settlementId" class="hint">{{ $t('reports.noSettlement') }}</p>

    <template v-else>
      <h1>{{ $t('reports.title') }}</h1>

      <div class="kind-tabs">
        <button
          v-for="tab in tabs"
          :key="tab"
          type="button"
          class="kind-tab"
          :class="{ active: kindFilter === tab }"
          :data-testid="`report-kind-tab-${tab}`"
          :aria-pressed="kindFilter === tab"
          :aria-label="tabLabel(tab)"
          :title="tabLabel(tab)"
          @click="kindFilter = tab"
        >
          <template v-if="tab === 'all'">{{ $t('reports.tabs.all') }}</template>
          <ReportKindIcon v-else :kind="tab" :size="22" />
          <span v-if="tabCount(tab) > 0" class="kind-tab-badge" :data-testid="`report-kind-tab-badge-${tab}`" aria-hidden="true">{{ tabCount(tab) }}</span>
        </button>
      </div>

      <p v-if="reports.loading && !rowCount">{{ $t('common.states.loading') }}</p>
      <p v-else-if="reports.error" class="hint error">{{ reports.error }}</p>
      <p v-else-if="!rowCount" class="hint">{{ $t('reports.noReports') }}</p>

      <div v-else ref="listRef" class="list">
        <div v-if="unread.length" class="group-header">
          <span class="group-label unread-label" data-testid="reports-unread-header">{{ $t('reports.groups.unread', { count: unread.length }) }}</span>
          <button v-if="reports.unreadCount > 0" type="button" class="mark-read" data-testid="reports-mark-read" @click="reports.markAllRead()">
            {{ $t('reports.markRead') }}
          </button>
        </div>

        <template v-for="section in sections" :key="section.key">
          <div v-if="section.key === 'earlier' && unread.length && earlier.length" class="group-header earlier-divider" data-testid="reports-earlier-divider">
            <span class="group-label">{{ $t('reports.groups.earlier') }}</span>
            <span class="divider-line" />
          </div>
          <div v-if="section.rows.length" class="group">
            <div v-for="row in section.rows" :key="row.key" class="item" :data-report-id="row.id">
              <ReportInboxRow :row="row" :tile="44" summary :expanded="isExpanded(row.id)" @open="toggle(row)" />

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
                <ArmyReportCard v-else-if="row.item.kind === 'army'" :report="row.item.report" />
                <div v-else class="card trade">
                  <div class="card-header">
                    <span class="banner trade-banner">{{ $t('reports.trade.completed') }}</span>
                    <span class="mission-pill">{{ row.item.report.guildTrade ? $t('reports.trade.guildTrade') : $t('reports.trade.trade') }}</span>
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
        </template>
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
  /* Room above and to the right for the corner badges, which overhang their tab. */
  padding: 9px 9px 2px 0;
  /* Mobile-readiness audit: four tabs plus longer German labels don't fit a
     360px width without wrapping the row's height around — a horizontal
     scroll strip keeps the tabs' own row a single, predictable height. */
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.kind-tab {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 44px;
  padding: 0 12px;
  box-sizing: border-box;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  color: #cbd5dc;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
}
.kind-tab:hover {
  color: var(--text);
}
.kind-tab.active {
  background: var(--gold);
  border-color: var(--gold);
  color: #1a1408;
}
.kind-tab-badge {
  position: absolute;
  top: -7px;
  right: -7px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 9px;
  background: var(--gold);
  color: #1a1408;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  box-shadow: 0 0 0 2px #0a141b;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 20px;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.group-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.unread-label {
  color: var(--gold);
}
.earlier-divider {
  margin-top: 4px;
  justify-content: flex-start;
}
.divider-line {
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
}
.mark-read {
  min-height: 32px;
  padding: 0;
  background: none;
  border: 0;
  font-family: inherit;
  font-size: 13px;
  color: var(--muted);
  text-decoration: underline;
  cursor: pointer;
}
.mark-read:hover {
  color: var(--text);
}
/* The expanded report sits directly under its row, the cards' own top margin dropped. */
.row-body {
  border: 1px solid var(--panel-border);
  border-top: 0;
}
.row-body :deep(.card) {
  margin-top: 0;
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
  .kind-tabs {
    /* The heading above it is hidden on mobile (see .back-to-list's block). */
    margin-top: 0;
  }
}
</style>
