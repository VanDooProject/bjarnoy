<script setup lang="ts">
import { ref, watch } from 'vue';
import { api, ApiError } from '../../api/client';
import type { AdminSettlementSummary, SettlementResponse } from '../../api/types';
import { useAdminWorldStore } from '../../stores/adminWorld';
import ArmyEditor from './ArmyEditor.vue';
import GarrisonForm from './GarrisonForm.vue';
import GrantResourcesForm from './GrantResourcesForm.vue';
import SettlementLayoutEditor from './SettlementLayoutEditor.vue';

const adminWorld = useAdminWorldStore();

const settlements = ref<AdminSettlementSummary[]>([]);
const totalCount = ref(0);
const page = ref(1);
const pageSize = 25;
const loading = ref(true);
const loadError = ref<string | null>(null);

const owner = ref('');

// The settlement currently expanded for management (grant/level forms), and
// its full detail — fetched separately since the search row is a summary.
const selectedId = ref<string | null>(null);
const detail = ref<SettlementResponse | null>(null);
const detailLoading = ref(false);
const detailError = ref<string | null>(null);

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
    loadError.value = 'Could not load settlements.';
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

async function manage(settlement: AdminSettlementSummary) {
  if (selectedId.value === settlement.id) {
    selectedId.value = null;
    detail.value = null;
    return;
  }

  selectedId.value = settlement.id;
  detail.value = null;
  detailError.value = null;
  detailLoading.value = true;
  try {
    detail.value = await api.adminGetSettlement(settlement.id);
  } catch (err) {
    detailError.value = err instanceof ApiError ? err.message : 'Could not load settlement detail.';
  } finally {
    detailLoading.value = false;
  }
}

function onChanged(updated: SettlementResponse) {
  detail.value = updated;
  applySummary(updated);
}
</script>

<template>
  <div class="settlements">
    <h1>Settlements</h1>

    <div class="filters">
      <input v-model="owner" type="text" placeholder="Owner name" @keyup.enter="onSearch" />
      <button @click="onSearch">Search</button>
    </div>

    <p v-if="!adminWorld.selectedWorldId" class="hint">
      Select a world above to search its settlements.
    </p>
    <p v-else-if="loading">Loading…</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>

    <template v-else>
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Owner</th>
            <th>World</th>
            <th>Position</th>
            <th>Longhouse</th>
            <th>Actions</th>
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
                <button @click="manage(settlement)">
                  {{ selectedId === settlement.id ? 'Close' : 'Manage' }}
                </button>
              </td>
            </tr>
            <tr v-if="selectedId === settlement.id" class="detail-row">
              <td colspan="6">
                <p v-if="detailLoading">Loading detail…</p>
                <p v-else-if="detailError" class="error">{{ detailError }}</p>
                <div v-else-if="detail" class="detail">
                  <div class="stocks">
                    <span>Wood {{ Math.floor(detail.resources.stock.wood) }}</span>
                    <span>Stone {{ Math.floor(detail.resources.stock.stone) }}</span>
                    <span>Food {{ Math.floor(detail.resources.stock.food) }}</span>
                    <span>Iron {{ Math.floor(detail.resources.stock.iron) }}</span>
                  </div>
                  <div class="forms">
                    <GrantResourcesForm :settlement-id="detail.id" @granted="onChanged" />
                    <GarrisonForm
                      :settlement-id="detail.id"
                      :garrison="detail.garrison"
                      @changed="onChanged"
                    />
                  </div>
                  <SettlementLayoutEditor
                    :settlement-id="detail.id"
                    :settlement="detail"
                    @changed="onChanged"
                  />
                  <ArmyEditor :settlement-id="detail.id" />
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>

      <div class="pager">
        <button :disabled="page <= 1" @click="changePage(-1)">Previous</button>
        <span>Page {{ page }} · {{ totalCount }} settlements</span>
        <button :disabled="page * pageSize >= totalCount" @click="changePage(1)">Next</button>
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
</style>
