<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import type { ReportResponse } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const SOURCE_LABELS = computed<Record<string, string>>(() => ({
  profileBio: t('adminReports.source.profileBio'),
  chatMessage: t('adminReports.source.chatMessage'),
}));

const reports = ref<ReportResponse[]>([]);
const totalCount = ref(0);
const page = ref(1);
const pageSize = 25;
const loading = ref(true);
const loadError = ref<string | null>(null);

const statusFilter = ref('pending');
const sourceTypeFilter = ref('');

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
    const result = await api.adminListReports({
      status: statusFilter.value || undefined,
      sourceType: sourceTypeFilter.value || undefined,
      page: page.value,
      pageSize,
    });
    reports.value = result.items;
    totalCount.value = result.totalCount;
    for (const report of reports.value) {
      rows[report.id] = { saving: false, error: null };
    }
  } catch {
    loadError.value = t('adminReports.loadError');
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

async function resolve(report: ReportResponse, outcome: string) {
  const row = rows[report.id];
  if (!row || row.saving) return;

  row.saving = true;
  row.error = null;
  try {
    const updated = await api.adminResolveReport(report.id, { outcome });
    const index = reports.value.findIndex((r) => r.id === updated.id);
    if (index !== -1) reports.value[index] = updated;
  } catch (err) {
    row.error = err instanceof ApiError ? err.message : t('adminReports.updateError');
  } finally {
    row.saving = false;
  }
}
</script>

<template>
  <div class="reports">
    <h1>{{ $t('adminReports.title') }}</h1>

    <div class="filters">
      <select v-model="statusFilter" @change="onFilter">
        <option value="">{{ $t('adminReports.filters.allStatuses') }}</option>
        <option value="pending">{{ $t('adminReports.filters.pending') }}</option>
        <option value="resolved">{{ $t('adminReports.filters.resolved') }}</option>
        <option value="dismissed">{{ $t('adminReports.filters.dismissed') }}</option>
        <option value="actioned">{{ $t('adminReports.filters.actioned') }}</option>
      </select>
      <select v-model="sourceTypeFilter" @change="onFilter">
        <option value="">{{ $t('adminReports.filters.allSources') }}</option>
        <option value="profileBio">{{ $t('adminReports.source.profileBio') }}</option>
        <option value="chatMessage">{{ $t('adminReports.source.chatMessage') }}</option>
      </select>
    </div>

    <p v-if="loading">{{ $t('adminReports.loading') }}</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>
    <p v-else-if="reports.length === 0" class="muted">{{ $t('adminReports.empty') }}</p>

    <template v-else>
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('adminReports.columns.source') }}</th>
            <th>{{ $t('adminReports.columns.reported') }}</th>
            <th>{{ $t('adminReports.columns.reporter') }}</th>
            <th>{{ $t('adminReports.columns.content') }}</th>
            <th>{{ $t('adminReports.columns.reason') }}</th>
            <th>{{ $t('adminReports.columns.note') }}</th>
            <th>{{ $t('adminReports.columns.status') }}</th>
            <th>{{ $t('adminReports.columns.created') }}</th>
            <th>{{ $t('adminReports.columns.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="report in reports" :key="report.id">
            <td>{{ SOURCE_LABELS[report.sourceType] ?? report.sourceType }}</td>
            <td>
              <!-- Straight to the user row moderation already lives on. -->
              <router-link :to="`/profile/${report.reportedUserName}`">
                {{ report.reportedUserName }}
              </router-link>
            </td>
            <td>{{ report.reporterUserName }}</td>
            <td class="snapshot">{{ report.contextSnapshot }}</td>
            <td>{{ report.reason }}</td>
            <td class="note">{{ report.note ?? $t('adminReports.noNote') }}</td>
            <td>
              <span :class="['status', report.status]">{{ report.status }}</span>
            </td>
            <td>{{ d(new Date(report.createdAt), 'long') }}</td>
            <td class="actions">
              <template v-if="report.status === 'pending'">
                <button :disabled="rows[report.id]?.saving" @click="resolve(report, 'resolved')">
                  {{ $t('adminReports.actions.resolve') }}
                </button>
                <button :disabled="rows[report.id]?.saving" @click="resolve(report, 'dismissed')">
                  {{ $t('adminReports.actions.dismiss') }}
                </button>
                <button :disabled="rows[report.id]?.saving" @click="resolve(report, 'actioned')">
                  {{ $t('adminReports.actions.actioned') }}
                </button>
              </template>
              <span v-else class="muted">{{ $t('adminReports.noActions') }}</span>
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
        <button :disabled="page <= 1" @click="changePage(-1)">{{ $t('adminReports.pager.previous') }}</button>
        <span>{{ $t('adminReports.pager.summary', { page, total: totalCount }) }}</span>
        <button :disabled="page * pageSize >= totalCount" @click="changePage(1)">
          {{ $t('adminReports.pager.next') }}
        </button>
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
.note,
.snapshot {
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
