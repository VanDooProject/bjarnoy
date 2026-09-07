<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import type { AdminUserResponse } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';
import { useAuthStore } from '../../stores/auth';

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const auth = useAuthStore();

const users = ref<AdminUserResponse[]>([]);
const totalCount = ref(0);
const page = ref(1);
const pageSize = 25;
const loading = ref(true);
const loadError = ref<string | null>(null);

const search = ref('');
const statusFilter = ref('');

// Per-user draft form state, keyed by id — lets each row be edited
// independently without clobbering the others.
interface Draft {
  displayName: string;
  role: string;
  saving: boolean;
  error: string | null;
}

const drafts = reactive<Record<string, Draft>>({});

function draftFor(user: AdminUserResponse): Draft {
  return {
    displayName: user.displayName ?? '',
    role: user.role,
    saving: false,
    error: null,
  };
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const result = await api.adminListUsers({
      search: search.value || undefined,
      status: statusFilter.value || undefined,
      page: page.value,
      pageSize,
    });
    users.value = result.items;
    totalCount.value = result.totalCount;
    for (const user of users.value) {
      drafts[user.id] = draftFor(user);
    }
  } catch {
    loadError.value = t('adminUsers.loadError');
  } finally {
    loading.value = false;
  }
}

onMounted(load);

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

function applyUpdated(updated: AdminUserResponse) {
  const index = users.value.findIndex((u) => u.id === updated.id);
  if (index !== -1) users.value[index] = updated;
  drafts[updated.id] = draftFor(updated);
}

async function saveEdit(user: AdminUserResponse) {
  const draft = drafts[user.id];
  if (!draft || draft.saving) return;

  draft.saving = true;
  draft.error = null;
  try {
    const updated = await api.adminUpdateUser(user.id, {
      displayName: draft.displayName,
      role: draft.role,
    });
    applyUpdated(updated);
  } catch (err) {
    draft.error = err instanceof ApiError ? err.message : t('adminUsers.saveError');
  } finally {
    draft.saving = false;
  }
}

const STATUS_LABELS = computed<Record<string, string>>(() => ({
  active: t('adminUsers.statusLabels.active'),
  locked: t('adminUsers.statusLabels.locked'),
  banned: t('adminUsers.statusLabels.banned'),
}));

function isSelf(user: AdminUserResponse): boolean {
  return auth.user?.id === user.id;
}

async function setStatus(user: AdminUserResponse, status: string) {
  const draft = drafts[user.id];
  if (!draft || draft.saving || isSelf(user)) return;

  const label = STATUS_LABELS.value[status] ?? status;
  if (!window.confirm(t('adminUsers.confirmStatusChange', { label, userName: user.userName }))) return;

  const reason = status === 'active' ? null : window.prompt(t('adminUsers.reasonPrompt')) ?? undefined;

  draft.saving = true;
  draft.error = null;
  try {
    const updated = await api.adminSetUserStatus(user.id, { status, reason: reason ?? undefined });
    applyUpdated(updated);
  } catch (err) {
    draft.error = err instanceof ApiError ? err.message : t('adminUsers.statusError');
  } finally {
    draft.saving = false;
  }
}

// Issue #40 phase 7: the fight simulator's `PremiumUserEndpointFilter` gate
// had no admin control to flip — this is that control, mirroring `setStatus`
// above exactly (same per-row draft/saving/error plumbing).
async function togglePremium(user: AdminUserResponse) {
  const draft = drafts[user.id];
  if (!draft || draft.saving) return;

  draft.saving = true;
  draft.error = null;
  try {
    const updated = await api.adminSetUserPremium(user.id, { isPremium: !user.isPremium });
    applyUpdated(updated);
  } catch (err) {
    draft.error = err instanceof ApiError ? err.message : t('adminUsers.premiumError');
  } finally {
    draft.saving = false;
  }
}
</script>

<template>
  <div class="users">
    <h1>{{ $t('adminUsers.title') }}</h1>

    <div class="filters">
      <input v-model="search" type="text" :placeholder="$t('adminUsers.searchPlaceholder')" @keyup.enter="onSearch" />
      <select v-model="statusFilter" @change="onSearch">
        <option value="">{{ $t('adminUsers.filters.allStatuses') }}</option>
        <option value="active">{{ $t('adminUsers.filters.active') }}</option>
        <option value="locked">{{ $t('adminUsers.filters.locked') }}</option>
        <option value="banned">{{ $t('adminUsers.filters.banned') }}</option>
      </select>
      <button @click="onSearch">{{ $t('adminUsers.search') }}</button>
    </div>

    <p v-if="loading">{{ $t('adminUsers.loading') }}</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>

    <template v-else>
      <table class="table">
        <thead>
          <tr>
            <th>{{ $t('adminUsers.columns.userName') }}</th>
            <th>{{ $t('adminUsers.columns.displayName') }}</th>
            <th>{{ $t('adminUsers.columns.role') }}</th>
            <th>{{ $t('adminUsers.columns.status') }}</th>
            <th>{{ $t('adminUsers.columns.premium') }}</th>
            <th>{{ $t('adminUsers.columns.settlements') }}</th>
            <th>{{ $t('adminUsers.columns.created') }}</th>
            <th>{{ $t('adminUsers.columns.lastLogin') }}</th>
            <th>{{ $t('adminUsers.columns.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in users" :key="user.id">
            <td>{{ user.userName }}</td>
            <td>
              <input v-model="drafts[user.id].displayName" type="text" class="cell-input" />
            </td>
            <td>
              <select v-model="drafts[user.id].role" class="cell-input">
                <option value="player">{{ $t('adminUsers.roles.player') }}</option>
                <option value="admin">{{ $t('adminUsers.roles.admin') }}</option>
              </select>
            </td>
            <td>
              <span :class="['status', user.status]">{{ user.status }}</span>
            </td>
            <td>
              <button
                type="button"
                class="premium-toggle"
                :disabled="drafts[user.id]?.saving"
                @click="togglePremium(user)"
              >
                {{ user.isPremium ? $t('adminUsers.premium.revoke') : $t('adminUsers.premium.grant') }}
              </button>
            </td>
            <td>{{ user.settlementCount }}</td>
            <td>{{ d(new Date(user.createdAt), 'short') }}</td>
            <td>{{ user.lastLoginAt ? d(new Date(user.lastLoginAt), 'long') : $t('adminUsers.noLastLogin') }}</td>
            <td class="actions">
              <button :disabled="drafts[user.id]?.saving" @click="saveEdit(user)">{{ $t('adminUsers.actions.save') }}</button>
              <button
                v-if="user.status !== 'active'"
                :disabled="drafts[user.id]?.saving || isSelf(user)"
                @click="setStatus(user, 'active')"
              >
                {{ $t('adminUsers.actions.unlockUnban') }}
              </button>
              <button
                v-if="user.status !== 'locked'"
                :disabled="drafts[user.id]?.saving || isSelf(user)"
                :title="isSelf(user) ? $t('adminUsers.cannotLockSelf') : undefined"
                @click="setStatus(user, 'locked')"
              >
                {{ $t('adminUsers.actions.lock') }}
              </button>
              <button
                v-if="user.status !== 'banned'"
                :disabled="drafts[user.id]?.saving || isSelf(user)"
                :title="isSelf(user) ? $t('adminUsers.cannotBanSelf') : undefined"
                @click="setStatus(user, 'banned')"
              >
                {{ $t('adminUsers.actions.ban') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="drafts && users.some((u) => drafts[u.id]?.error)" class="error">
        <template v-for="user in users" :key="`err-${user.id}`">
          <span v-if="drafts[user.id]?.error">{{ user.userName }}: {{ drafts[user.id].error }}</span>
        </template>
      </p>

      <div class="pager">
        <button :disabled="page <= 1" @click="changePage(-1)">{{ $t('adminUsers.pager.previous') }}</button>
        <span>{{ $t('adminUsers.pager.summary', { page, total: totalCount }) }}</span>
        <button :disabled="page * pageSize >= totalCount" @click="changePage(1)">{{ $t('adminUsers.pager.next') }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.users h1 {
  margin: 0 0 16px;
}
.filters {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.filters input[type='text'] {
  flex: 1;
  max-width: 320px;
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
.cell-input {
  width: 100%;
}
.status {
  text-transform: capitalize;
}
.status.locked,
.status.banned {
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
.error {
  color: var(--rival);
  font-size: 13px;
}
input,
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
