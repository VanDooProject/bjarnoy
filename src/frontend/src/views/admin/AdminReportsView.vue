<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api, ApiError } from '../../api/client';
import type { ProfileReportResponse } from '../../api/types';

const reports = ref<ProfileReportResponse[]>([]);
const totalCount = ref(0);
const page = ref(1);
const pageSize = 25;
const loading = ref(true);
const loadError = ref<string | null>(null);

const statusFilter = ref('pending');

// Per-report in-flight/error state, keyed by id — same pattern as
// AdminUsersView's row drafts.
interface RowState {
  saving: boolean;
  error: string | null;
}

const rows = reactive<Record<string, RowState>>({});

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const result = await api.adminListProfileReports({
      status: statusFilter.value || undefined,
      page: page.value,
      pageSize,
    });
    reports.value = result.items;
    totalCount.value = result.totalCount;
    for (const report of reports.value) {
      rows[report.id] = { saving: false, error: null };
    }
  } catch {
    loadError.value = 'Could not load reports.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function onFilter() {
  page.value = 1;
  void load();
}

function changePage(delta: number) {
  const next = page.value + delta;
  if (next < 1) return;
  page.value = next;
  void load();
}

async function resolve(report: ProfileReportResponse, status: string) {
  const row = rows[report.id];
  if (!row || row.saving) return;

  row.saving = true;
  row.error = null;
  try {
    const updated = await api.adminResolveProfileReport(report.id, { status });
    const index = reports.value.findIndex((r) => r.id === updated.id);
    if (index !== -1) reports.value[index] = updated;
  } catch (err) {
    row.error = err instanceof ApiError ? err.message : 'Could not update the report.';
  } finally {
    row.saving = false;
  }
}
</script>

<template>
  <div class="reports">
    <h1>Profile reports</h1>

    <div class="filters">
      <select v-model="statusFilter" @change="onFilter">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="reviewed">Reviewed</option>
        <option value="dismissed">Dismissed</option>
        <option value="actioned">Actioned</option>
      </select>
    </div>

    <p v-if="loading">Loading…</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>
    <p v-else-if="reports.length === 0" class="muted">No reports.</p>

    <template v-else>
      <table class="table">
        <thead>
          <tr>
            <th>Reported</th>
            <th>Reporter</th>
            <th>Reason</th>
            <th>Note</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="report in reports" :key="report.id">
            <td>
              <!-- Straight to the user row moderation already lives on. -->
              <router-link :to="`/profile/${report.reportedUserName}`">
                {{ report.reportedUserName }}
              </router-link>
            </td>
            <td>{{ report.reporterUserName }}</td>
            <td>{{ report.reason }}</td>
            <td class="note">{{ report.note ?? '—' }}</td>
            <td>
              <span :class="['status', report.status]">{{ report.status }}</span>
            </td>
            <td>{{ new Date(report.createdAt).toLocaleString() }}</td>
            <td class="actions">
              <template v-if="report.status === 'pending'">
                <button :disabled="rows[report.id]?.saving" @click="resolve(report, 'reviewed')">
                  Reviewed
                </button>
                <button :disabled="rows[report.id]?.saving" @click="resolve(report, 'dismissed')">
                  Dismiss
                </button>
                <button :disabled="rows[report.id]?.saving" @click="resolve(report, 'actioned')">
                  Actioned
                </button>
              </template>
              <button v-else :disabled="rows[report.id]?.saving" @click="resolve(report, 'pending')">
                Reopen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="reports.some((r) => rows[r.id]?.error)" class="error">
        <template v-for="report in reports" :key="`err-${report.id}`">
          <span v-if="rows[report.id]?.error">{{ report.id }}: {{ rows[report.id].error }}</span>
        </template>
      </p>

      <div class="pager">
        <button :disabled="page <= 1" @click="changePage(-1)">Previous</button>
        <span>Page {{ page }} · {{ totalCount }} reports</span>
        <button :disabled="page * pageSize >= totalCount" @click="changePage(1)">Next</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.reports h1 {
  margin: 0 0 16px;
}
.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
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
.note {
  max-width: 260px;
  overflow-wrap: anywhere;
}
.status {
  text-transform: capitalize;
}
.status.pending {
  color: var(--gold);
}
.status.actioned {
  color: var(--rival);
}
.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.pager {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: var(--muted);
}
.muted {
  color: var(--muted);
}
.error {
  color: var(--rival);
  font-size: 13px;
}
select {
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
