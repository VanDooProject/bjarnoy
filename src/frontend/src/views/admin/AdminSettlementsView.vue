<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import type { AdminSettlementSummary, SettlementResponse } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';
import { useAdminWorldStore } from '../../stores/adminWorld';
import ArmyEditor from './ArmyEditor.vue';
import GarrisonForm from './GarrisonForm.vue';
import GrantResourcesForm from './GrantResourcesForm.vue';
import SettlementLayoutEditor from './SettlementLayoutEditor.vue';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const adminWorld = useAdminWorldStore();

const settlements = ref<AdminSettlementSummary[]>([]);
const totalCount = ref(0);
const page = ref(1);
const pageSize = 25;
const loading = ref(true);
const loadError = ref<string | null>(null);

const owner = ref('');

// Settlements currently expanded for management (grant/level forms), any number
// at once, each with its full detail — fetched separately since the search row
// is a summary.
interface OpenPanel {
  detail: SettlementResponse | null;
  loading: boolean;
  error: string | null;
}
const open = ref<Record<string, OpenPanel>>({});

async function load() {
  // No world selected yet (worlds still loading, or none exist) — nothing to
  // search; the template shows a placeholder instead of an empty table.
  if (!adminWorld.selectedWorldId) {
    settlements.value = [];
    totalCount.value = 0;
    loading.value = false;
    return;
  }

  loading.value = true;
  loadError.value = null;
  try {
    const result = await api.adminSearchSettlements({
      worldId: adminWorld.selectedWorldId,
      owner: owner.value || undefined,
      page: page.value,
      pageSize,
    });
    settlements.value = result.items;
    totalCount.value = result.totalCount;
  } catch {
    loadError.value = t('adminSettlements.loadError');
  } finally {
    loading.value = false;
  }
}

// Reloads whenever the header's world selector changes — including its
// first resolution from AdminLayout's onMounted loadWorlds(), which this
// view's own onMounted can race ahead of.
watch(
  () => adminWorld.selectedWorldId,
  () => {
    page.value = 1;
    void load();
  },
  { immediate: true },
);

function onSearch() {
  page.value = 1;
  void load();
}

function changePage(delta: number) {
  const next = page.value + delta;
  if (next < 1) return;
  page.value = next;
  void load();
}

function applySummary(updated: SettlementResponse) {
  const index = settlements.value.findIndex((s) => s.id === updated.id);
  if (index !== -1) {
    settlements.value[index] = {
      ...settlements.value[index],
      longhouseLevel: updated.longhouseLevel,
    };
  }
}

// Background world ticks (resource production, queues) keep changing the
// open settlements' detail underneath the admin, so they're kept fresh on a
// timer while any is expanded, alongside a manual "Refresh" button for an
// on-demand nudge. Stopped whenever nothing is open/on unmount.
const DETAIL_POLL_MS = 10_000;
let detailPollHandle: ReturnType<typeof setInterval> | null = null;

function stopDetailPolling() {
  if (detailPollHandle !== null) {
    clearInterval(detailPollHandle);
    detailPollHandle = null;
  }
}

function startDetailPolling() {
  if (detailPollHandle !== null) return;
  detailPollHandle = setInterval(() => {
    for (const id of Object.keys(open.value)) void refreshDetail(id);
  }, DETAIL_POLL_MS);
}

async function refreshDetail(id: string) {
  const panel = open.value[id];
  if (!panel || panel.loading) return;
  try {
    const updated = await api.adminGetSettlement(id);
    if (!open.value[id]) return;
    panel.detail = updated;
    applySummary(updated);
    panel.error = null;
  } catch (err) {
    if (open.value[id]) {
      panel.error = err instanceof ApiError ? err.message : t('adminSettlements.detailError');
    }
  }
}

async function manage(settlement: AdminSettlementSummary) {
  const id = settlement.id;
  if (open.value[id]) {
    delete open.value[id];
    if (Object.keys(open.value).length === 0) stopDetailPolling();
    return;
  }

  open.value[id] = { detail: null, loading: true, error: null };
  const panel = open.value[id];
  try {
    const loaded = await api.adminGetSettlement(id);
    if (open.value[id]) panel.detail = loaded;
    startDetailPolling();
  } catch (err) {
    if (open.value[id]) {
      panel.error = err instanceof ApiError ? err.message : t('adminSettlements.detailError');
    }
  } finally {
    if (open.value[id]) panel.loading = false;
  }
}

function onChanged(id: string, updated: SettlementResponse) {
  const panel = open.value[id];
  if (panel) panel.detail = updated;
  applySummary(updated);
}

onBeforeUnmount(stopDetailPolling);
</script>

<template>
  <div class="settlements">
    <h1>{{ $t('adminSettlements.title') }}</h1>

    <div class="filters">
      <input v-model="owner" type="text" :placeholder="$t('adminSettlements.ownerPlaceholder')" @keyup.enter="onSearch" />
      <button @click="onSearch">{{ $t('adminSettlements.search') }}</button>
    </div>

    <p v-if="!adminWorld.selectedWorldId" class="hint">
      {{ $t('adminSettlements.selectWorldHint') }}
    </p>
    <p v-else-if="loading">{{ $t('adminSettlements.loading') }}</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>

    <template v-else>
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('adminSettlements.columns.name') }}</th>
            <th>{{ $t('adminSettlements.columns.owner') }}</th>
            <th>{{ $t('adminSettlements.columns.world') }}</th>
            <th>{{ $t('adminSettlements.columns.position') }}</th>
            <th>{{ $t('adminSettlements.columns.longhouse') }}</th>
            <th>{{ $t('adminSettlements.columns.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="settlement in settlements" :key="settlement.id">
            <tr>
              <td>{{ settlement.name }}</td>
              <td>{{ settlement.ownerName }}</td>
              <td>{{ settlement.worldName }}</td>
              <td>({{ settlement.q }}, {{ settlement.r }})</td>
              <td>{{ settlement.longhouseLevel }}</td>
              <td>
                <button
                  v-if="open[settlement.id]"
                  :disabled="open[settlement.id]!.loading"
                  @click="refreshDetail(settlement.id)"
                >
                  {{ $t('adminSettlements.actions.refresh') }}
                </button>
                <button @click="manage(settlement)">
                  {{ open[settlement.id] ? $t('adminSettlements.actions.close') : $t('adminSettlements.actions.manage') }}
                </button>
              </td>
            </tr>
            <tr v-if="open[settlement.id]" class="detail-row">
              <td colspan="6">
                <p v-if="open[settlement.id]!.loading">{{ $t('adminSettlements.loadingDetail') }}</p>
                <p v-else-if="open[settlement.id]!.error" class="error">{{ open[settlement.id]!.error }}</p>
                <div v-else-if="open[settlement.id]!.detail" class="detail">
                  <template v-for="detail in [open[settlement.id]!.detail!]" :key="detail.id">
                    <div class="stocks">
                      <span>{{ $t('adminSettlements.stocks.wood', { stock: Math.floor(detail.resources.stock.wood), capacity: Math.floor(detail.resources.capacity.wood) }) }}</span>
                      <span>{{ $t('adminSettlements.stocks.stone', { stock: Math.floor(detail.resources.stock.stone), capacity: Math.floor(detail.resources.capacity.stone) }) }}</span>
                      <span>{{ $t('adminSettlements.stocks.food', { stock: Math.floor(detail.resources.stock.food), capacity: Math.floor(detail.resources.capacity.food) }) }}</span>
                      <span>{{ $t('adminSettlements.stocks.iron', { stock: Math.floor(detail.resources.stock.iron), capacity: Math.floor(detail.resources.capacity.iron) }) }}</span>
                    </div>
                    <div class="forms">
                      <GrantResourcesForm
                        :settlement-id="detail.id"
                        :before="detail.resources.stock"
                        @granted="onChanged(detail.id, $event)"
                      />
                      <GarrisonForm
                        :settlement-id="detail.id"
                        :garrison="detail.garrison"
                        :spots="detail.garrisonSpots"
                        @changed="onChanged(detail.id, $event)"
                      />
                    </div>
                    <SettlementLayoutEditor
                      :settlement-id="detail.id"
                      :settlement="detail"
                      @changed="onChanged(detail.id, $event)"
                    />
                    <ArmyEditor :settlement-id="detail.id" />
                  </template>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <div class="pager">
        <button :disabled="page <= 1" @click="changePage(-1)">{{ $t('adminSettlements.pager.previous') }}</button>
        <span>{{ $t('adminSettlements.pager.summary', { page, total: totalCount }) }}</span>
        <button :disabled="page * pageSize >= totalCount" @click="changePage(1)">{{ $t('adminSettlements.pager.next') }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.settlements h1 {
  margin: 0 0 16px;
}
.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.filters input {
  max-width: 240px;
}
.table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
}
.table th,
.table td {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid var(--panel-border);
  font-size: 14px;
  vertical-align: middle;
}
.detail-row td {
  background: var(--panel-bg);
}
.detail {
  padding: 8px 0;
}
.stocks {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--muted);
}
.forms {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.detail > * + * {
  margin-top: 20px;
}
.pager {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--muted);
}
.error {
  color: var(--rival);
  font-size: 13px;
}
.hint {
  color: var(--muted);
  font-size: 13px;
}
input {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--text);
}
button {
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.table td button + button {
  margin-left: 8px;
}
</style>
