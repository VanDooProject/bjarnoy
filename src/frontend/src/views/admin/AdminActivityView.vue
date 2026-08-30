<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api, ApiError } from '../../api/client';
import ActivityChart from '../../components/admin/ActivityChart.vue';
import type { AdminActivityUser, AdminUserActivityDetailResponse, ActivityBucket } from '../../api/types';

type BucketUnit = 'day' | 'hour';

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfDayIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00.000Z`).toISOString();
}

function endOfDayIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59.999Z`).toISOString();
}

// Default range: the last 7 days — a safe default under both the 92-day
// (bucket=day) and 7-day (bucket=hour) limits the backend enforces.
const today = new Date();
const weekAgo = new Date(today);
weekAgo.setUTCDate(weekAgo.getUTCDate() - 6);

const rangeFrom = ref(toIsoDate(weekAgo));
const rangeTo = ref(toIsoDate(today));
const bucketUnit = ref<BucketUnit>('day');

// --- Aggregate summary -----------------------------------------------------

const buckets = ref<ActivityBucket[]>([]);
const summaryLoading = ref(true);
const summaryError = ref<string | null>(null);

async function loadSummary() {
  summaryLoading.value = true;
  summaryError.value = null;
  try {
    const result = await api.adminGetActivitySummary({
      from: startOfDayIso(rangeFrom.value),
      to: endOfDayIso(rangeTo.value),
      bucket: bucketUnit.value,
    });
    buckets.value = result.buckets;
  } catch (err) {
    summaryError.value = err instanceof ApiError ? err.message : 'Could not load activity summary.';
  } finally {
    summaryLoading.value = false;
  }
}

function setBucketUnit(unit: BucketUnit) {
  if (bucketUnit.value === unit) return;
  bucketUnit.value = unit;
}

function onRangeChange() {
  void loadSummary();
  if (selectedUserId.value) void loadDetail(selectedUserId.value);
}

watch(bucketUnit, () => void loadSummary());

// --- Users table -------------------------------------------------------

const users = ref<AdminActivityUser[]>([]);
const totalCount = ref(0);
const page = ref(1);
const pageSize = 25;
const usersLoading = ref(true);
const usersError = ref<string | null>(null);

async function loadUsers() {
  usersLoading.value = true;
  usersError.value = null;
  try {
    const result = await api.adminListActivityUsers({ page: page.value, pageSize, sort: 'lastActive' });
    users.value = result.items;
    totalCount.value = result.totalCount;
  } catch (err) {
    usersError.value = err instanceof ApiError ? err.message : 'Could not load users.';
  } finally {
    usersLoading.value = false;
  }
}

function changePage(delta: number) {
  const next = page.value + delta;
  if (next < 1) return;
  page.value = next;
  void loadUsers();
}

// --- Per-user drill-down -------------------------------------------------

const selectedUserId = ref<string | null>(null);
const detail = ref<AdminUserActivityDetailResponse | null>(null);
const detailLoading = ref(false);
const detailError = ref<string | null>(null);

async function loadDetail(userId: string) {
  detail.value = null;
  detailError.value = null;
  detailLoading.value = true;
  try {
    detail.value = await api.adminGetUserActivityDetail(userId, {
      from: startOfDayIso(rangeFrom.value),
      to: endOfDayIso(rangeTo.value),
    });
  } catch (err) {
    detailError.value = err instanceof ApiError ? err.message : 'Could not load session detail.';
  } finally {
    detailLoading.value = false;
  }
}

function selectUser(user: AdminActivityUser) {
  if (selectedUserId.value === user.userId) {
    selectedUserId.value = null;
    detail.value = null;
    return;
  }
  selectedUserId.value = user.userId;
  void loadDetail(user.userId);
}

// `totalActiveDuration` comes across as a .NET TimeSpan string
// ("d.hh:mm:ss.fffffff", the day segment optional) — not a plain number of
// seconds — so parse that shape explicitly rather than risk misreading it.
function parseTimeSpanSeconds(value: string): number | null {
  const match = /^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/.exec(value);
  if (!match) return null;
  const [, days, hours, minutes, seconds, fraction] = match;
  const fractionalSeconds = fraction ? Number(`0.${fraction}`) : 0;
  return (
    Number(days ?? 0) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    fractionalSeconds
  );
}

function formatDuration(value: string): string {
  const totalSeconds = parseTimeSpanSeconds(value);
  if (totalSeconds === null) return value;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0 && minutes === 0) return '<1m';
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatLastActive(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : 'Never';
}

const selectedUserName = computed(() => users.value.find((u) => u.userId === selectedUserId.value)?.userName ?? '');

onMounted(() => {
  void loadSummary();
  void loadUsers();
});
</script>

<template>
  <div class="activity">
    <h1>Activity</h1>

    <div class="filters">
      <label>
        From
        <input v-model="rangeFrom" type="date" @change="onRangeChange" />
      </label>
      <label>
        To
        <input v-model="rangeTo" type="date" @change="onRangeChange" />
      </label>
      <div class="bucket-toggle">
        <button :class="{ active: bucketUnit === 'day' }" @click="setBucketUnit('day')">Day</button>
        <button :class="{ active: bucketUnit === 'hour' }" @click="setBucketUnit('hour')">Hour</button>
      </div>
    </div>

    <section class="panel-section">
      <h2>Active users over time</h2>
      <p v-if="summaryLoading">Loading…</p>
      <p v-else-if="summaryError" class="error">{{ summaryError }}</p>
      <ActivityChart v-else :buckets="buckets" :bucket-unit="bucketUnit" />
    </section>

    <section class="panel-section">
      <h2>Users</h2>
      <p v-if="usersLoading">Loading…</p>
      <p v-else-if="usersError" class="error">{{ usersError }}</p>
      <p v-else-if="users.length === 0" class="muted">No users.</p>

      <template v-else>
        <table class="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Display name</th>
              <th>Last active</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="user in users" :key="user.userId">
              <tr class="user-row" @click="selectUser(user)">
                <td>{{ user.userName }}</td>
                <td>{{ user.displayName ?? '—' }}</td>
                <td>{{ formatLastActive(user.lastActiveAtUtc) }}</td>
              </tr>
              <tr v-if="selectedUserId === user.userId" class="detail-row">
                <td colspan="3">
                  <p v-if="detailLoading">Loading sessions…</p>
                  <p v-else-if="detailError" class="error">{{ detailError }}</p>
                  <div v-else-if="detail" class="detail">
                    <p class="totals">
                      {{ selectedUserName }} — {{ detail.sessionCount }} session{{ detail.sessionCount === 1 ? '' : 's' }},
                      {{ formatDuration(detail.totalActiveDuration) }} active
                    </p>
                    <p v-if="detail.sessions.length === 0" class="muted">No sessions in this range.</p>
                    <ul v-else class="sessions">
                      <li v-for="(session, index) in detail.sessions" :key="index">
                        {{ new Date(session.startedAtUtc).toLocaleString() }} –
                        {{ new Date(session.lastSeenAtUtc).toLocaleString() }}
                      </li>
                    </ul>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>

        <div class="pager">
          <button :disabled="page <= 1" @click="changePage(-1)">Previous</button>
          <span>Page {{ page }} · {{ totalCount }} users</span>
          <button :disabled="page * pageSize >= totalCount" @click="changePage(1)">Next</button>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.activity h1 {
  margin: 0 0 16px;
}
.activity h2 {
  margin: 0 0 12px;
  font-size: 16px;
}
.filters {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.filters label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}
.bucket-toggle {
  display: flex;
  gap: 4px;
}
.bucket-toggle button {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--muted);
}
.bucket-toggle button.active {
  background: var(--gold);
  color: #1a1208;
  border-color: var(--gold);
}
.panel-section {
  margin-bottom: 32px;
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
.user-row {
  cursor: pointer;
}
.user-row:hover {
  background: var(--panel-bg);
}
.detail-row td {
  background: var(--panel-bg);
}
.detail {
  padding: 8px 0;
}
.totals {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--muted);
}
.sessions {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--text);
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
