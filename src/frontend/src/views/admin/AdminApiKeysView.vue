<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import type {
  AdminWorldResponse,
  ApiKeyAccess,
  ApiKeyFeatureInfo,
  ApiKeyFeatureMap,
  ApiKeyRequestResponse,
  ApiKeyResponse,
  ApiKeyTokenResponse,
  ApproveApiKeyRequestBody,
  SaveApiKeyRequest,
} from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';
import { useAuthStore } from '../../stores/auth';
import ApiKeyScopeEditor, {
  type ScopeEditorInitial,
  type ScopeEditorOwner,
} from '../../components/admin/ApiKeyScopeEditor.vue';

// Admin tab for debug API keys (docs/tech/api-keys.md): the open requests an
// agent filed (the approval link it hands the admin is
// `/admin/api-keys?request=<userCode>`, which highlights and scrolls to that
// request), and the keys themselves. Create / edit / approve all go through
// the shared scope editor; a freshly minted token is shown exactly once.

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const route = useRoute();
const auth = useAuthStore();

const features = ref<ApiKeyFeatureInfo[]>([]);
const worlds = ref<AdminWorldResponse[]>([]);
const keys = ref<ApiKeyResponse[]>([]);
const requests = ref<ApiKeyRequestResponse[]>([]);
const includeInactive = ref(false);
const loading = ref(true);
const loadError = ref<string | null>(null);

type EditorState =
  | { kind: 'new'; initial: ScopeEditorInitial }
  | { kind: 'edit'; key: ApiKeyResponse; initial: ScopeEditorInitial }
  | { kind: 'approve'; request: ApiKeyRequestResponse; initial: ScopeEditorInitial };

const editor = ref<EditorState | null>(null);
const editorBusy = ref(false);
const editorError = ref<string | null>(null);
const actionError = ref<string | null>(null);
const revealed = ref<ApiKeyTokenResponse | null>(null);
const copied = ref(false);

const highlightedCode = computed(() => {
  const raw = route.query.request;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? value.trim().toUpperCase() : null;
});

function isHighlighted(request: ApiKeyRequestResponse): boolean {
  return highlightedCode.value !== null && request.userCode.toUpperCase() === highlightedCode.value;
}

async function scrollToHighlighted() {
  await nextTick();
  const el = document.querySelector('[data-highlighted="true"]');
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center' });
}

async function loadRequests() {
  requests.value = await api.adminListApiKeyRequests();
}

async function loadKeys() {
  keys.value = await api.adminListApiKeys(includeInactive.value);
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const [featureList, worldList] = await Promise.all([api.getApiKeyFeatures(), api.adminListWorlds()]);
    features.value = featureList;
    worlds.value = worldList;
    await Promise.all([loadRequests(), loadKeys()]);
  } catch {
    loadError.value = t('adminApiKeys.loadError');
  } finally {
    loading.value = false;
  }
  await scrollToHighlighted();
}

onMounted(load);
watch(highlightedCode, () => void scrollToHighlighted());
watch(includeInactive, () => void loadKeys().catch(() => (loadError.value = t('adminApiKeys.loadError'))));

function selfOwner(): ScopeEditorOwner {
  return {
    id: auth.user?.id ?? '',
    userName: auth.user?.userName ?? '',
    role: auth.user?.role ?? 'player',
  };
}

/** Looks a user up by exact user name; the owner picker only knows search. */
async function resolveOwner(userName: string | null): Promise<ScopeEditorOwner | null> {
  if (!userName) return null;
  try {
    const result = await api.adminListUsers({ search: userName, pageSize: 10 });
    const hit = result.items.find((u) => u.userName.toLowerCase() === userName.toLowerCase());
    return hit ? { id: hit.id, userName: hit.userName, role: hit.role } : null;
  } catch {
    return null;
  }
}

function openNew() {
  actionError.value = null;
  editorError.value = null;
  editor.value = {
    kind: 'new',
    initial: {
      owner: selfOwner(),
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    },
  };
}

async function openEdit(key: ApiKeyResponse) {
  actionError.value = null;
  editorError.value = null;
  const found = await resolveOwner(key.ownerUserName);
  const owner = found ?? {
    id: key.ownerUserId,
    userName: key.ownerUserName,
    role: Object.keys(key.features).some((id) => id.startsWith('admin.')) ? 'admin' : 'player',
  };
  editor.value = {
    kind: 'edit',
    key,
    initial: {
      name: key.name,
      purpose: key.purpose,
      owner,
      features: key.features,
      allWorlds: key.allWorlds,
      worldIds: key.worldIds,
      expiresAt: key.expiresAt,
      requestsPerMinute: key.requestsPerMinute,
    },
  };
}

async function openApprove(request: ApiKeyRequestResponse) {
  actionError.value = null;
  editorError.value = null;
  const owner = (await resolveOwner(request.requestedOwnerUserName)) ?? selfOwner();
  editor.value = {
    kind: 'approve',
    request,
    initial: {
      owner,
      features: request.features,
      allWorlds: request.allWorlds,
      worldIds: request.worldIds,
      lifetimeMinutes: request.lifetimeMinutes,
      requestsPerMinute: request.requestsPerMinute,
      autoRenewMinutes: null,
    },
  };
}

function closeEditor() {
  editor.value = null;
  editorError.value = null;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

async function onEditorSubmit(payload: SaveApiKeyRequest | ApproveApiKeyRequestBody) {
  const state = editor.value;
  if (!state || editorBusy.value) return;
  editorBusy.value = true;
  editorError.value = null;
  try {
    if (state.kind === 'new') {
      revealed.value = await api.adminCreateApiKey(payload as SaveApiKeyRequest);
      copied.value = false;
    } else if (state.kind === 'edit') {
      await api.adminUpdateApiKey(state.key.id, payload as SaveApiKeyRequest);
    } else {
      await api.adminApproveApiKeyRequest(state.request.id, payload as ApproveApiKeyRequestBody);
    }
    editor.value = null;
    await Promise.all([loadKeys(), loadRequests()]);
  } catch (err) {
    editorError.value = errorMessage(err, t('adminApiKeys.saveError'));
  } finally {
    editorBusy.value = false;
  }
}

async function deny(request: ApiKeyRequestResponse) {
  if (!window.confirm(t('adminApiKeys.confirmDeny', { name: request.name }))) return;
  actionError.value = null;
  try {
    await api.adminDenyApiKeyRequest(request.id);
    await loadRequests();
  } catch (err) {
    actionError.value = errorMessage(err, t('adminApiKeys.actionError'));
  }
}

async function recreate(key: ApiKeyResponse) {
  if (!window.confirm(t('adminApiKeys.confirmRecreate', { name: key.name }))) return;
  actionError.value = null;
  try {
    revealed.value = await api.adminRecreateApiKey(key.id);
    copied.value = false;
    await loadKeys();
  } catch (err) {
    actionError.value = errorMessage(err, t('adminApiKeys.actionError'));
  }
}

async function revoke(key: ApiKeyResponse) {
  if (!window.confirm(t('adminApiKeys.confirmRevoke', { name: key.name }))) return;
  actionError.value = null;
  try {
    await api.adminRevokeApiKey(key.id);
    await loadKeys();
  } catch (err) {
    actionError.value = errorMessage(err, t('adminApiKeys.actionError'));
  }
}

async function copyToken() {
  if (!revealed.value) return;
  try {
    await navigator.clipboard.writeText(revealed.value.token);
    copied.value = true;
  } catch {
    copied.value = false;
  }
}

const ACCESS_SHORT: Record<ApiKeyAccess, string> = { None: '', Read: 'r', ReadWrite: 'rw' };

function featureSummary(map: ApiKeyFeatureMap): string {
  return Object.entries(map)
    .filter(([, level]) => level !== 'None')
    .map(([id, level]) => `${id}:${ACCESS_SHORT[level]}`)
    .join(', ');
}

function worldSummary(scope: { allWorlds: boolean; worldIds: string[] }): string {
  if (scope.allWorlds) return t('adminApiKeys.allWorlds');
  if (scope.worldIds.length === 0) return t('adminApiKeys.noWorlds');
  return scope.worldIds.map((id) => worlds.value.find((w) => w.id === id)?.name ?? id.slice(0, 8)).join(', ');
}

function lifetimeLabel(minutes: number): string {
  return minutes % 1440 === 0
    ? t('adminApiKeys.lifetime.days', { n: minutes / 1440 })
    : minutes % 60 === 0
      ? t('adminApiKeys.lifetime.hours', { n: minutes / 60 })
      : t('adminApiKeys.lifetime.minutes', { n: minutes });
}

const openRequests = computed(() =>
  requests.value.filter((r) => r.status === 'Pending' || r.status === 'Approved'),
);
</script>

<template>
  <div class="api-keys">
    <h1>{{ $t('adminApiKeys.title') }}</h1>
    <p v-if="loading">{{ $t('adminApiKeys.loading') }}</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>

    <template v-else>
      <section v-if="revealed" class="token-box" data-testid="token-box">
        <h2>{{ $t('adminApiKeys.token.title', { name: revealed.apiKey.name }) }}</h2>
        <p class="warning">{{ $t('adminApiKeys.token.warning') }}</p>
        <code class="token" data-testid="token-value">{{ revealed.token }}</code>
        <div class="actions">
          <button type="button" data-testid="token-copy" @click="copyToken">
            {{ copied ? $t('adminApiKeys.token.copied') : $t('adminApiKeys.token.copy') }}
          </button>
          <button type="button" @click="revealed = null">{{ $t('adminApiKeys.token.dismiss') }}</button>
        </div>
      </section>

      <p v-if="actionError" class="error" data-testid="action-error">{{ actionError }}</p>

      <section class="requests">
        <h2>{{ $t('adminApiKeys.requests.title') }}</h2>
        <p v-if="openRequests.length === 0" class="muted">{{ $t('adminApiKeys.requests.empty') }}</p>
        <article
          v-for="request in openRequests"
          :key="request.id"
          :class="['request', { highlight: isHighlighted(request) }]"
          :data-highlighted="isHighlighted(request) ? 'true' : 'false'"
          :data-testid="`request-${request.userCode}`"
        >
          <div class="request-head">
            <span class="code">{{ request.userCode }}</span>
            <strong>{{ request.name }}</strong>
            <span class="badge">{{ $t(`adminApiKeys.requestKind.${request.kind}`) }}</span>
            <span class="badge">{{ $t(`adminApiKeys.requestStatus.${request.status}`) }}</span>
          </div>
          <dl class="facts">
            <template v-if="request.purpose">
              <dt>{{ $t('adminApiKeys.requests.purpose') }}</dt>
              <dd>{{ request.purpose }}</dd>
            </template>
            <template v-if="request.description">
              <dt>{{ $t('adminApiKeys.requests.description') }}</dt>
              <dd>{{ request.description }}</dd>
            </template>
            <template v-if="request.contextUrl">
              <dt>{{ $t('adminApiKeys.requests.context') }}</dt>
              <dd>
                <a :href="request.contextUrl" target="_blank" rel="noopener noreferrer">{{ request.contextUrl }}</a>
              </dd>
            </template>
            <dt>{{ $t('adminApiKeys.requests.requester') }}</dt>
            <dd>{{ request.requesterIp }} <span class="muted">{{ request.requesterUserAgent }}</span></dd>
            <template v-if="request.requestedOwnerUserName">
              <dt>{{ $t('adminApiKeys.requests.owner') }}</dt>
              <dd>{{ request.requestedOwnerUserName }}</dd>
            </template>
            <dt>{{ $t('adminApiKeys.requests.features') }}</dt>
            <dd>{{ featureSummary(request.features) }}</dd>
            <dt>{{ $t('adminApiKeys.requests.worlds') }}</dt>
            <dd>{{ worldSummary(request) }}</dd>
            <dt>{{ $t('adminApiKeys.requests.lifetime') }}</dt>
            <dd>{{ lifetimeLabel(request.lifetimeMinutes) }}</dd>
            <dt>{{ $t('adminApiKeys.requests.expires') }}</dt>
            <dd>{{ d(new Date(request.expiresAt), 'long') }}</dd>
          </dl>
          <div v-if="request.status === 'Pending'" class="actions">
            <button type="button" :data-testid="`approve-${request.userCode}`" @click="openApprove(request)">
              {{ $t('adminApiKeys.requests.approve') }}
            </button>
            <button type="button" class="danger" :data-testid="`deny-${request.userCode}`" @click="deny(request)">
              {{ $t('adminApiKeys.requests.deny') }}
            </button>
          </div>
          <ApiKeyScopeEditor
            v-if="editor?.kind === 'approve' && editor.request.id === request.id"
            mode="approve"
            :features="features"
            :worlds="worlds"
            :initial="editor.initial"
            :busy="editorBusy"
            :error="editorError"
            @submit="onEditorSubmit"
            @cancel="closeEditor"
          />
        </article>
      </section>

      <section class="keys">
        <div class="keys-head">
          <h2>{{ $t('adminApiKeys.keys.title') }}</h2>
          <label class="inline">
            <input v-model="includeInactive" type="checkbox" data-testid="include-inactive" />
            {{ $t('adminApiKeys.keys.includeInactive') }}
          </label>
          <button type="button" data-testid="new-key" @click="openNew">{{ $t('adminApiKeys.keys.new') }}</button>
        </div>

        <ApiKeyScopeEditor
          v-if="editor && editor.kind !== 'approve'"
          :key="editor.kind === 'edit' ? editor.key.id : 'new'"
          mode="key"
          :features="features"
          :worlds="worlds"
          :initial="editor.initial"
          :busy="editorBusy"
          :error="editorError"
          @submit="onEditorSubmit"
          @cancel="closeEditor"
        />

        <p v-if="keys.length === 0" class="muted">{{ $t('adminApiKeys.keys.empty') }}</p>
        <table v-else class="table">
          <thead>
            <tr>
              <th>{{ $t('adminApiKeys.keys.columns.name') }}</th>
              <th>{{ $t('adminApiKeys.keys.columns.hint') }}</th>
              <th>{{ $t('adminApiKeys.keys.columns.owner') }}</th>
              <th>{{ $t('adminApiKeys.keys.columns.createdBy') }}</th>
              <th>{{ $t('adminApiKeys.keys.columns.status') }}</th>
              <th>{{ $t('adminApiKeys.keys.columns.expires') }}</th>
              <th>{{ $t('adminApiKeys.keys.columns.lastUsed') }}</th>
              <th>{{ $t('adminApiKeys.keys.columns.features') }}</th>
              <th>{{ $t('adminApiKeys.keys.columns.worlds') }}</th>
              <th>{{ $t('adminApiKeys.keys.columns.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="key in keys" :key="key.id" :data-testid="`key-${key.id}`">
              <td>{{ key.name }}</td>
              <td><code>{{ key.keyHint }}</code></td>
              <td>{{ key.ownerUserName }}</td>
              <td>{{ key.createdByUserName ?? '' }}</td>
              <td>
                <span :class="['status', key.status.toLowerCase()]">
                  {{ $t(`adminApiKeys.keyStatus.${key.status}`) }}
                </span>
              </td>
              <td>{{ d(new Date(key.expiresAt), 'long') }}</td>
              <td>{{ key.lastUsedAt ? d(new Date(key.lastUsedAt), 'long') : $t('adminApiKeys.keys.neverUsed') }}</td>
              <td class="summary">{{ featureSummary(key.features) }}</td>
              <td class="summary">{{ worldSummary(key) }}</td>
              <td class="actions">
                <template v-if="key.status !== 'Revoked'">
                  <button type="button" :data-testid="`edit-${key.id}`" @click="openEdit(key)">
                    {{ $t('adminApiKeys.keys.edit') }}
                  </button>
                  <button type="button" :data-testid="`recreate-${key.id}`" @click="recreate(key)">
                    {{ $t('adminApiKeys.keys.recreate') }}
                  </button>
                  <button type="button" class="danger" :data-testid="`revoke-${key.id}`" @click="revoke(key)">
                    {{ $t('adminApiKeys.keys.revoke') }}
                  </button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped>
.api-keys h1 {
  margin: 0 0 16px;
}
.api-keys h2 {
  margin: 0 0 12px;
  font-size: 18px;
}
section {
  margin-bottom: 32px;
}
.muted {
  color: var(--muted);
  font-size: 13px;
}
.request {
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 12px;
  background: var(--panel-bg);
}
.request.highlight {
  border-color: var(--gold);
  box-shadow: 0 0 0 2px var(--gold);
}
.request-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
.code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.badge {
  padding: 1px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  font-size: 12px;
  color: var(--muted);
}
.facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0 0 12px;
  font-size: 14px;
}
.facts dt {
  color: var(--muted);
}
.facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.keys-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}
.keys-head h2 {
  margin: 0;
}
.inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}
.table {
  width: 100%;
  border-collapse: collapse;
}
.table th,
.table td {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid var(--panel-border);
  font-size: 14px;
  vertical-align: middle;
}
.summary {
  max-width: 260px;
  overflow-wrap: anywhere;
  font-size: 12px;
}
.status.revoked,
.status.expired {
  color: var(--rival);
}
.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.token-box {
  border: 2px solid var(--gold);
  border-radius: 10px;
  padding: 14px 16px;
  background: var(--panel-bg);
}
.token-box h2 {
  margin-top: 0;
}
.token {
  display: block;
  padding: 8px 10px;
  margin: 8px 0 12px;
  background: var(--shell);
  border-radius: 6px;
  overflow-wrap: anywhere;
  user-select: all;
}
.warning {
  color: var(--rival);
  font-size: 14px;
  margin: 0;
}
.error {
  color: var(--rival);
  font-size: 13px;
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
button.danger {
  background: var(--rival);
  color: #fff;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
