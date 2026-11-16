<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import UserLookupInput from './UserLookupInput.vue';
import type {
  AdminUserLookupResponse,
  AdminWorldResponse,
  ApiKeyAccess,
  ApiKeyFeatureInfo,
  ApiKeyFeatureMap,
  ApproveApiKeyRequestBody,
  SaveApiKeyRequest,
} from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';

// The scope editor shared by "New key", "Edit key" and "Approve request"
// (docs/tech/api-keys.md): owner picker, the feature grid (None / Read /
// Read+Write per feature from `GET /api-keys/features`), the all-worlds toggle
// with a world multi-select, and lifetime / rate limit. It never talks to the
// key endpoints itself: it validates, builds the exact request body for its
// `mode` and emits it, the view owns the call and any server error.

export interface ScopeEditorOwner {
  id: string;
  userName: string;
  role: string;
}

/**
 * A player without an account the key may act as. An existing grant has `id` (kept as is); a new one has `settlementId`
 * (picked in the autocomplete; the backend reads the identity off that settlement).
 */
export interface ScopeEditorAnonymous {
  id?: string;
  settlementId?: string;
  label: string;
  primary: boolean;
  settlementName?: string | null;
  worldName?: string | null;
  claimed?: boolean | null;
}

/** What the editor starts from; the view prefills it from a key or a request. */
export interface ScopeEditorInitial {
  name?: string;
  purpose?: string | null;
  owner: ScopeEditorOwner;
  /** Further accounts the key may act as (`X-Act-As`). */
  additionalAccounts?: ScopeEditorOwner[];
  /** Players without an account the key may act as (`X-Act-As: jarl:<label>`). */
  anonymousAccounts?: ScopeEditorAnonymous[];
  /** False: the owner is only the sponsor and the key acts as its default anonymous account. */
  ownerCanAct?: boolean;
  features?: ApiKeyFeatureMap;
  allWorlds?: boolean;
  worldIds?: string[];
  /** `key` mode: the key's current expiry (ISO). */
  expiresAt?: string;
  /** `approve` mode: the requested lifetime. */
  lifetimeMinutes?: number;
  requestsPerMinute?: number | null;
  /** `approve` mode: 0 / empty means no auto-renew. */
  autoRenewMinutes?: number | null;
}

const props = defineProps<{
  /** `key` creates/edits a key (`SaveApiKeyRequest`); `approve` answers a request. */
  mode: 'key' | 'approve';
  features: ApiKeyFeatureInfo[];
  worlds: AdminWorldResponse[];
  initial: ScopeEditorInitial;
  busy?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  submit: [payload: SaveApiKeyRequest | ApproveApiKeyRequestBody];
  cancel: [];
}>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const ACCESS_LEVELS: ApiKeyAccess[] = ['None', 'Read', 'ReadWrite'];

function toLocalInput(iso: string | undefined): string {
  const date = iso ? new Date(iso) : new Date(Date.now() + 24 * 3600 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const form = reactive({
  name: props.initial.name ?? '',
  purpose: props.initial.purpose ?? '',
  owner: { ...props.initial.owner } as ScopeEditorOwner,
  additional: (props.initial.additionalAccounts ?? []).map((a) => ({ ...a })) as ScopeEditorOwner[],
  anonymous: (props.initial.anonymousAccounts ?? []).map((a) => ({ ...a })) as ScopeEditorAnonymous[],
  ownerCanAct: props.initial.ownerCanAct ?? true,
  features: { ...(props.initial.features ?? {}) } as ApiKeyFeatureMap,
  allWorlds: props.initial.allWorlds ?? false,
  worldIds: [...(props.initial.worldIds ?? [])],
  expiresAtLocal: toLocalInput(props.initial.expiresAt),
  lifetimeMinutes: props.initial.lifetimeMinutes ?? 60,
  requestsPerMinute: props.initial.requestsPerMinute ?? null,
  autoRenewMinutes: props.initial.autoRenewMinutes ?? null,
});

// Admin features need an admin owner who can act: an anonymous account has no admin rights.
const ownerIsAdmin = computed(() => form.owner.role.toLowerCase() === 'admin' && form.ownerCanAct);

function accessOf(id: string): ApiKeyAccess {
  return form.features[id] ?? 'None';
}

function setAccess(id: string, level: ApiKeyAccess) {
  form.features[id] = level;
}

// Admin features only make sense for an admin owner (the backend rejects the
// rest): switching to a non-admin owner drops any admin grant instead of
// leaving a hidden one that would fail on submit.
watch(ownerIsAdmin, (isAdmin) => {
  if (isAdmin) return;
  for (const feature of props.features) {
    if (feature.admin) form.features[feature.id] = 'None';
  }
});

function anonymousKey(a: ScopeEditorAnonymous): string {
  return a.id ?? a.settlementId ?? a.label;
}

function addAnonymous(user: AdminUserLookupResponse, primary: boolean) {
  if (form.anonymous.some((a) => a.settlementId === user.settlementId && user.settlementId)) return;
  form.anonymous.push({
    settlementId: user.settlementId ?? undefined,
    label: user.userName,
    primary,
    settlementName: user.settlementName,
    worldName: user.worldName,
  });
}

function pickOwner(user: AdminUserLookupResponse) {
  if (user.kind === 'anonymous') {
    // A player without an account cannot own a key: the key acts as them, the owner stays the sponsor.
    addAnonymous(user, form.anonymous.length === 0);
    form.ownerCanAct = false;
    return;
  }
  form.owner = { id: user.userId as string, userName: user.userName, role: user.role as string };
  // The owner is already an account of the key: it never also sits in the extra list.
  form.additional = form.additional.filter((a) => a.id !== user.userId);
}

function addAccount(user: AdminUserLookupResponse) {
  if (user.kind === 'anonymous') {
    addAnonymous(user, form.anonymous.length === 0 && !form.ownerCanAct);
    return;
  }
  const id = user.userId as string;
  if (id === form.owner.id || form.additional.some((a) => a.id === id)) return;
  form.additional.push({ id, userName: user.userName, role: user.role as string });
}

function removeAccount(id: string) {
  form.additional = form.additional.filter((a) => a.id !== id);
}

function removeAnonymous(key: string) {
  form.anonymous = form.anonymous.filter((a) => anonymousKey(a) !== key);
  if (form.anonymous.length === 0) form.ownerCanAct = true;
  else if (!form.anonymous.some((a) => a.primary)) form.anonymous[0].primary = true;
}

function makePrimary(key: string) {
  for (const a of form.anonymous) a.primary = anonymousKey(a) === key;
}

const takenAccountIds = computed(() => [
  form.owner.id,
  ...form.additional.map((a) => a.id),
  ...form.anonymous.map((a) => a.settlementId).filter((id): id is string => !!id),
]);

function pickSelf() {
  form.owner = { ...props.initial.owner };
}

function toggleWorld(id: string) {
  const index = form.worldIds.indexOf(id);
  if (index === -1) form.worldIds.push(id);
  else form.worldIds.splice(index, 1);
}

const selectedFeatures = computed<ApiKeyFeatureMap>(() => {
  const out: ApiKeyFeatureMap = {};
  for (const feature of props.features) {
    const level = accessOf(feature.id);
    if (level !== 'None') out[feature.id] = level;
  }
  return out;
});

const validationError = computed<string | null>(() => {
  if (props.mode === 'key' && form.name.trim() === '') return t('adminApiKeys.editor.errors.nameRequired');
  if (Object.keys(selectedFeatures.value).length === 0) return t('adminApiKeys.editor.errors.featureRequired');
  const worldScoped = props.features.some((f) => f.worldScoped && accessOf(f.id) !== 'None');
  if (worldScoped && !form.allWorlds && form.worldIds.length === 0) {
    return t('adminApiKeys.editor.errors.worldRequired');
  }
  return null;
});

function anonymousBody() {
  return {
    anonymousAccounts: form.anonymous.map((a) => ({ id: a.id, settlementId: a.settlementId, primary: a.primary })),
    ownerCanAct: form.ownerCanAct,
  };
}

function submit() {
  if (validationError.value || props.busy) return;
  const scope = {
    features: selectedFeatures.value,
    allWorlds: form.allWorlds,
    worldIds: form.allWorlds ? [] : [...form.worldIds],
  };
  const rpm = form.requestsPerMinute ? Number(form.requestsPerMinute) : null;
  if (props.mode === 'key') {
    const body: SaveApiKeyRequest = {
      name: form.name.trim(),
      purpose: form.purpose.trim() || null,
      ownerUserId: form.owner.id,
      additionalUserIds: form.additional.map((a) => a.id),
      ...anonymousBody(),
      ...scope,
      expiresAt: new Date(form.expiresAtLocal).toISOString(),
      requestsPerMinute: rpm,
    };
    emit('submit', body);
  } else {
    const renew = form.autoRenewMinutes ? Number(form.autoRenewMinutes) : null;
    const body: ApproveApiKeyRequestBody = {
      ownerUserId: form.owner.id,
      additionalUserIds: form.additional.map((a) => a.id),
      ...anonymousBody(),
      ...scope,
      lifetimeMinutes: Number(form.lifetimeMinutes),
      requestsPerMinute: rpm,
      autoRenewMinutes: renew,
    };
    emit('submit', body);
  }
}
</script>

<template>
  <form class="editor" data-testid="scope-editor" @submit.prevent="submit">
    <template v-if="mode === 'key'">
      <label class="field">
        <span>{{ $t('adminApiKeys.editor.name') }}</span>
        <input v-model="form.name" type="text" maxlength="100" data-testid="editor-name" />
      </label>
      <label class="field">
        <span>{{ $t('adminApiKeys.editor.purpose') }}</span>
        <input v-model="form.purpose" type="text" maxlength="500" data-testid="editor-purpose" />
      </label>
    </template>

    <fieldset class="owner">
      <legend>{{ form.ownerCanAct ? $t('adminApiKeys.editor.owner') : $t('adminApiKeys.editor.ownerSponsor') }}</legend>
      <p class="owner-current" data-testid="editor-owner">
        {{ form.owner.userName }}
        <span v-if="ownerIsAdmin" class="badge">{{ $t('adminApiKeys.editor.adminBadge') }}</span>
      </p>
      <div class="owner-search">
        <UserLookupInput
          :placeholder="$t('adminApiKeys.editor.ownerSearch')"
          testid="editor-owner"
          @pick="pickOwner"
        />
        <button type="button" data-testid="editor-owner-self" @click="pickSelf">
          {{ $t('adminApiKeys.editor.ownerSelf') }}
        </button>
      </div>
    </fieldset>

    <fieldset class="accounts">
      <legend>{{ $t('adminApiKeys.editor.accounts') }}</legend>
      <p class="muted">{{ $t('adminApiKeys.editor.accountsHint') }}</p>
      <ul v-if="form.additional.length > 0" class="chips" data-testid="editor-accounts">
        <li v-for="account in form.additional" :key="account.id" class="chip">
          {{ account.userName }}
          <span v-if="account.role.toLowerCase() === 'admin'" class="badge">{{ $t('adminApiKeys.editor.adminBadge') }}</span>
          <button
            type="button"
            :aria-label="$t('adminApiKeys.editor.removeAccount', { name: account.userName })"
            :data-testid="`account-remove-${account.id}`"
            @click="removeAccount(account.id)"
          >
            ×
          </button>
        </li>
      </ul>
      <ul v-if="form.anonymous.length > 0" class="chips" data-testid="editor-anonymous">
        <li
          v-for="account in form.anonymous"
          :key="anonymousKey(account)"
          :class="['chip', 'anonymous', { claimed: account.claimed }]"
          :data-testid="`anonymous-${anonymousKey(account)}`"
        >
          {{ account.label }}
          <span class="badge">{{ $t('adminApiKeys.editor.anonymousBadge') }}</span>
          <span v-if="account.settlementName" class="muted">{{ account.settlementName }}<template v-if="account.worldName"> · {{ account.worldName }}</template></span>
          <code>{{ $t('adminApiKeys.editor.anonymousHeader', { label: account.label }) }}</code>
          <button
            v-if="!account.primary && !form.ownerCanAct"
            type="button"
            :data-testid="`anonymous-primary-${anonymousKey(account)}`"
            @click="makePrimary(anonymousKey(account))"
          >
            {{ $t('adminApiKeys.editor.makePrimary', { name: account.label }) }}
          </button>
          <span v-else-if="account.primary && !form.ownerCanAct" class="badge">{{ $t('adminApiKeys.editor.anonymousPrimary') }}</span>
          <button
            type="button"
            :aria-label="$t('adminApiKeys.editor.removeAccount', { name: account.label })"
            :data-testid="`anonymous-remove-${anonymousKey(account)}`"
            @click="removeAnonymous(anonymousKey(account))"
          >
            ×
          </button>
          <span v-if="account.claimed" class="warn">{{ $t('adminApiKeys.editor.claimedWarning') }}</span>
        </li>
      </ul>
      <label v-if="form.anonymous.length > 0" class="inline">
        <input v-model="form.ownerCanAct" type="checkbox" data-testid="editor-owner-can-act" />
        {{ $t('adminApiKeys.editor.ownerCanAct') }}
      </label>
      <p v-if="!form.ownerCanAct" class="muted">{{ $t('adminApiKeys.editor.ownerCanActOff') }}</p>
      <UserLookupInput
        :placeholder="$t('adminApiKeys.editor.accountSearch')"
        :exclude="takenAccountIds"
        testid="editor-account"
        @pick="addAccount"
      />
    </fieldset>

    <fieldset class="features">
      <legend>{{ $t('adminApiKeys.editor.features') }}</legend>
      <table class="grid">
        <thead>
          <tr>
            <th>{{ $t('adminApiKeys.editor.feature') }}</th>
            <th v-for="level in ACCESS_LEVELS" :key="level">{{ $t(`adminApiKeys.access.${level}`) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="feature in features" :key="feature.id" :class="{ disabled: feature.admin && !ownerIsAdmin }">
            <td>
              <code>{{ feature.id }}</code>
              <span v-if="feature.worldScoped" class="badge">{{ $t('adminApiKeys.editor.worldScoped') }}</span>
              <div class="desc">{{ feature.description }}</div>
            </td>
            <td v-for="level in ACCESS_LEVELS" :key="level">
              <input
                type="radio"
                :name="`feature-${feature.id}`"
                :checked="accessOf(feature.id) === level"
                :disabled="feature.admin && !ownerIsAdmin"
                :data-testid="`feature-${feature.id}-${level}`"
                @change="setAccess(feature.id, level)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </fieldset>

    <fieldset class="worlds">
      <legend>{{ $t('adminApiKeys.editor.worlds') }}</legend>
      <label class="inline">
        <input v-model="form.allWorlds" type="checkbox" data-testid="editor-all-worlds" />
        {{ $t('adminApiKeys.editor.allWorlds') }}
      </label>
      <ul class="world-list">
        <li v-for="world in worlds" :key="world.id">
          <label class="inline">
            <input
              type="checkbox"
              :checked="form.worldIds.includes(world.id)"
              :disabled="form.allWorlds"
              :data-testid="`editor-world-${world.id}`"
              @change="toggleWorld(world.id)"
            />
            {{ world.name }}
          </label>
        </li>
      </ul>
    </fieldset>

    <div class="row">
      <label v-if="mode === 'key'" class="field">
        <span>{{ $t('adminApiKeys.editor.expiresAt') }}</span>
        <input v-model="form.expiresAtLocal" type="datetime-local" data-testid="editor-expires" />
      </label>
      <label v-else class="field">
        <span>{{ $t('adminApiKeys.editor.lifetimeMinutes') }}</span>
        <input v-model.number="form.lifetimeMinutes" type="number" min="1" data-testid="editor-lifetime" />
      </label>
      <label class="field">
        <span>{{ $t('adminApiKeys.editor.requestsPerMinute') }}</span>
        <input v-model.number="form.requestsPerMinute" type="number" min="1" data-testid="editor-rpm" />
      </label>
      <label v-if="mode === 'approve'" class="field">
        <span>{{ $t('adminApiKeys.editor.autoRenewMinutes') }}</span>
        <input v-model.number="form.autoRenewMinutes" type="number" min="0" data-testid="editor-auto-renew" />
      </label>
    </div>

    <p v-if="validationError" class="error" data-testid="editor-validation">{{ validationError }}</p>
    <p v-if="error" class="error" data-testid="editor-error">{{ error }}</p>

    <div class="actions">
      <button type="submit" class="primary" :disabled="busy || validationError !== null" data-testid="editor-submit">
        {{ mode === 'approve' ? $t('adminApiKeys.editor.approve') : $t('adminApiKeys.editor.save') }}
      </button>
      <button type="button" @click="emit('cancel')">{{ $t('adminApiKeys.editor.cancel') }}</button>
    </div>
  </form>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
}
fieldset {
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 10px 12px;
  margin: 0;
  min-width: 0;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}
.grid {
  width: 100%;
  border-collapse: collapse;
}
.grid th,
.grid td {
  padding: 6px 8px;
  text-align: left;
  font-size: 13px;
  border-bottom: 1px solid var(--panel-border);
  vertical-align: top;
}
.grid th:not(:first-child),
.grid td:not(:first-child) {
  text-align: center;
  white-space: nowrap;
}
tr.disabled {
  opacity: 0.5;
}
.desc {
  color: var(--muted);
  font-size: 12px;
}
.badge {
  margin-left: 6px;
  padding: 1px 6px;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  font-size: 11px;
  color: var(--muted);
}
.world-list,
.owner-results {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}
.chips {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px 2px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  font-size: 14px;
}
.chip button {
  padding: 0 8px;
  line-height: 1.4;
}
.chip.anonymous {
  flex-wrap: wrap;
  border-style: dashed;
  padding-right: 4px;
}
.chip.claimed {
  border-color: var(--rival);
}
.warn {
  color: var(--rival);
  font-size: 12px;
}
.muted {
  color: var(--muted);
  font-size: 13px;
  margin: 0 0 8px;
}
.owner-current {
  margin: 0 0 8px;
}
.owner-search {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.actions {
  display: flex;
  gap: 8px;
}
.error {
  color: var(--rival);
  font-size: 13px;
  margin: 0;
}
input,
select {
  background: var(--shell);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--text);
}
input[type='radio'],
input[type='checkbox'] {
  padding: 0;
}
</style>
