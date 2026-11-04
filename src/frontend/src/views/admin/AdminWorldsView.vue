<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import DateTimeField from '../../components/admin/DateTimeField.vue';
import type { AdminWorldResponse } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';
import { useUnsavedInput } from '../../composables/useUnsavedInput';
import { dateTimePattern, formatDateTime, formatRelativeTime, parseDateTime } from '../../lib/dateTimeFormat';
import { DEFAULT_GENERATION } from '../../lib/map/worldGenerator';

const { t, locale } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const worlds = ref<AdminWorldResponse[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

// Per-world draft form state, keyed by world id — lets each panel be edited
// independently without clobbering the others.
interface Draft {
  name: string;
  speedFactor: string;
  startsAt: string;
  joinsClosed: boolean;
  frozenIslesEnabled: boolean;
  hidden: boolean;
  endbossAt: string;
  /** The run state picked in the dropdown; only applied with the Apply button. */
  runState: string;
  graceMinutes: string;
  saving: boolean;
  error: string | null;
}

const drafts = reactive<Record<string, Draft>>({});

function draftFor(world: AdminWorldResponse): Draft {
  return {
    name: world.name,
    speedFactor: String(world.speedFactor),
    startsAt: formatDateTime(world.startsAt, locale.value),
    joinsClosed: world.joinsClosed,
    frozenIslesEnabled: world.frozenIslesEnabled,
    hidden: world.hidden,
    endbossAt: formatDateTime(world.endbossAt, locale.value),
    runState: world.runState,
    graceMinutes: '0',
    saving: false,
    error: null,
  };
}

// The date fields hold text in the UI language's layout; when the language
// changes, re-write what is typed into the new layout so it still parses.
watch(locale, (next, prev) => {
  for (const draft of Object.values(drafts)) {
    for (const key of ['startsAt', 'endbossAt'] as const) {
      const parsed = parseDateTime(draft[key], prev);
      if (parsed.ok) draft[key] = formatDateTime(parsed.iso, next);
    }
  }
});

// Creating a world (issue #105). Its own draft, separate from the per-world
// settings drafts above — this one has no world to key off yet.
const newWorld = reactive({
  name: '',
  seed: '',
  radius: String(DEFAULT_GENERATION.worldRadius),
  maxPlayers: '500',
  creating: false,
  error: null as string | null,
});

function editedFields(d: Draft): string {
  return JSON.stringify([d.speedFactor, d.startsAt, d.joinsClosed, d.frozenIslesEnabled, d.endbossAt, d.graceMinutes]);
}

// A new-world form with a name or seed typed, or a world setting changed but not saved.
useUnsavedInput(
  () =>
    newWorld.name !== '' ||
    newWorld.seed !== '' ||
    worlds.value.some((world) => !!drafts[world.id] && editedFields(drafts[world.id]) !== editedFields(draftFor(world))),
);

async function createWorld() {
  if (newWorld.creating) return;

  if (newWorld.name.trim().length < 3) {
    newWorld.error = t('adminWorlds.create.nameTooShort');
    return;
  }

  newWorld.creating = true;
  newWorld.error = null;
  try {
    const created = await api.adminCreateWorld({
      name: newWorld.name.trim(),
      // An omitted seed means "draw one" — the backend does that, so an empty
      // field must send nothing rather than 0, which is a real seed.
      seed: newWorld.seed === '' ? undefined : Number(newWorld.seed),
      radius: Number(newWorld.radius) || DEFAULT_GENERATION.worldRadius,
      maxPlayers: Number(newWorld.maxPlayers) || 500,
    });

    worlds.value = [...worlds.value, created];
    drafts[created.id] = draftFor(created);
    newWorld.name = '';
    newWorld.seed = '';
  } catch (err) {
    newWorld.error = err instanceof ApiError ? err.message : t('adminWorlds.create.createError');
  } finally {
    newWorld.creating = false;
  }
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    worlds.value = await api.adminListWorlds();
    for (const world of worlds.value) {
      drafts[world.id] = draftFor(world);
    }
  } catch {
    loadError.value = t('adminWorlds.loadError');
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// A world is generated in the background after the create request returns (status "creating"): poll the list
// while one is, and pick up its new status and seed when it turns "active" or "failed".
const CREATING_POLL_MS = 3000;
let creatingPoll: ReturnType<typeof setInterval> | null = null;

const anyCreating = computed(() => worlds.value.some((w) => w.status === 'creating'));

async function refreshCreating() {
  try {
    const fresh = await api.adminListWorlds();
    const previous = new Map(worlds.value.map((w) => [w.id, w]));
    worlds.value = fresh;
    for (const world of fresh) {
      // Only a world that just left "creating" (or is new) takes the server's values; every other draft may hold unsaved edits.
      if (!drafts[world.id] || previous.get(world.id)?.status !== world.status) drafts[world.id] = draftFor(world);
    }
  } catch {
    // The next tick tries again; the list on screen stays as it was.
  }
}

watch(
  anyCreating,
  (creating) => {
    if (creating && creatingPoll === null) {
      creatingPoll = setInterval(() => void refreshCreating(), CREATING_POLL_MS);
    } else if (!creating && creatingPoll !== null) {
      clearInterval(creatingPoll);
      creatingPoll = null;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (creatingPoll !== null) clearInterval(creatingPoll);
});

const STATUSES = ['active', 'inactive', 'full', 'creating', 'failed'] as const;

function statusName(status: string): string {
  return (STATUSES as readonly string[]).includes(status) ? t(`adminWorlds.statuses.${status}`) : status;
}

/** A world still being generated or whose generation failed has no map to configure: its panel only says so. */
function hasMap(world: AdminWorldResponse): boolean {
  return world.status !== 'creating' && world.status !== 'failed';
}

function applyUpdated(updated: AdminWorldResponse) {
  const index = worlds.value.findIndex((w) => w.id === updated.id);
  if (index !== -1) worlds.value[index] = updated;
  drafts[updated.id] = draftFor(updated);
}

async function saveSettings(world: AdminWorldResponse) {
  const draft = drafts[world.id];
  if (!draft || draft.saving) return;

  const name = draft.name.trim();
  if (name.length < 3) {
    draft.error = t('adminWorlds.create.nameTooShort');
    return;
  }

  const speedFactor = Number(draft.speedFactor);
  if (!Number.isFinite(speedFactor) || speedFactor <= 0) {
    draft.error = t('adminWorlds.speedFactorTooLow');
    return;
  }

  const startsAt = parseDateTime(draft.startsAt, locale.value);
  const endbossAt = parseDateTime(draft.endbossAt, locale.value);
  if (!startsAt.ok || !endbossAt.ok) {
    draft.error = t('adminWorlds.dateInvalid', { pattern: dateTimePattern(locale.value) });
    return;
  }

  draft.saving = true;
  draft.error = null;
  try {
    const updated = await api.adminUpdateWorldSettings(world.id, {
      name,
      speedFactor,
      startsAt: startsAt.iso,
      joinsClosed: draft.joinsClosed,
      frozenIslesEnabled: draft.frozenIslesEnabled,
      hidden: draft.hidden,
      endbossAt: endbossAt.iso,
    });
    // Saving the settings must not throw away a run state that was picked
    // but not applied yet.
    const pendingRunState = draft.runState;
    applyUpdated(updated);
    drafts[updated.id].runState = pendingRunState;
  } catch (err) {
    draft.error = err instanceof ApiError ? err.message : t('adminWorlds.saveError');
  } finally {
    draft.saving = false;
  }
}

// The run states a world can be put in, with the backend action that gets
// it there (POST /admin/worlds/{id}/run-state).
const RUN_STATES = ['running', 'paused', 'maintenance', 'locked'] as const;
const ACTION_FOR_STATE: Record<string, string> = {
  running: 'resume',
  paused: 'pause',
  maintenance: 'maintenance',
  locked: 'lock',
};

const RUN_STATE_LABELS = computed<Record<string, string>>(() => ({
  pause: t('adminWorlds.runStateLabels.pause'),
  maintenance: t('adminWorlds.runStateLabels.maintenance'),
  lock: t('adminWorlds.runStateLabels.lock'),
  resume: t('adminWorlds.runStateLabels.resume'),
}));

function runStateName(state: string): string {
  return (RUN_STATES as readonly string[]).includes(state) ? t(`adminWorlds.runStates.${state}`) : state;
}

function runStateSinceText(world: AdminWorldResponse): string {
  return t('adminWorlds.runStateSince', {
    state: runStateName(world.runState),
    date: formatDateTime(world.runStateSince, locale.value),
    relative: formatRelativeTime(world.runStateSince, new Date(), locale.value),
  });
}

/** The grace field only matters when resuming a world that is not running. */
function showsGrace(world: AdminWorldResponse): boolean {
  return drafts[world.id]?.runState === 'running' && world.runState !== 'running';
}

async function applyRunState(world: AdminWorldResponse) {
  const draft = drafts[world.id];
  if (!draft || draft.saving || draft.runState === world.runState) return;

  const action = ACTION_FOR_STATE[draft.runState];
  if (!action) return;

  const label = RUN_STATE_LABELS.value[action] ?? action;
  if (!window.confirm(t('adminWorlds.confirmRunState', { label, name: world.name }))) return;

  draft.saving = true;
  draft.error = null;
  try {
    const graceMinutes = action === 'resume' ? Number(draft.graceMinutes) || 0 : undefined;
    const updated = await api.adminSetWorldRunState(world.id, { action, graceMinutes });
    applyUpdated(updated);
  } catch (err) {
    draft.error = err instanceof ApiError ? err.message : t('adminWorlds.runStateError');
  } finally {
    draft.saving = false;
  }
}
</script>

<template>
  <div class="worlds">
    <h1>{{ $t('adminWorlds.title') }}</h1>

    <form class="create" @submit.prevent="createWorld">
      <h2>{{ $t('adminWorlds.create.heading') }}</h2>
      <div class="create-fields">
        <label>
          {{ $t('adminWorlds.create.name') }}
          <input v-model="newWorld.name" type="text" :placeholder="$t('adminWorlds.create.namePlaceholder')" />
        </label>
        <label>
          {{ $t('adminWorlds.create.seed') }}
          <input v-model="newWorld.seed" type="number" step="1" :placeholder="$t('adminWorlds.create.seedPlaceholder')" />
        </label>
        <label>
          {{ $t('adminWorlds.create.radius') }}
          <input v-model="newWorld.radius" type="number" min="1" max="5000" step="1" />
        </label>
        <label>
          {{ $t('adminWorlds.create.maxPlayers') }}
          <input v-model="newWorld.maxPlayers" type="number" min="1" step="1" />
        </label>
        <button type="submit" :disabled="newWorld.creating">
          {{ newWorld.creating ? $t('adminWorlds.create.generating') : $t('adminWorlds.create.submit') }}
        </button>
      </div>
      <p v-if="newWorld.error" class="error">{{ newWorld.error }}</p>
    </form>

    <p v-if="loading">{{ $t('adminWorlds.loading') }}</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>

    <table v-else class="table">
      <thead>
        <tr>
          <th>{{ $t('adminWorlds.columns.name') }}</th>
          <th>{{ $t('adminWorlds.columns.status') }}</th>
          <th>{{ $t('adminWorlds.columns.runState') }}</th>
          <th>{{ $t('adminWorlds.columns.players') }}</th>
          <th :title="$t('adminWorlds.columns.spawnsHint')">{{ $t('adminWorlds.columns.spawns') }}</th>
          <th>{{ $t('adminWorlds.columns.joinable') }}</th>
          <th>{{ $t('adminWorlds.columns.endboss') }}</th>
          <th>{{ $t('adminWorlds.columns.frozenIsles') }}</th>
          <th>{{ $t('adminWorlds.columns.hidden') }}</th>
          <th>{{ $t('adminWorlds.columns.seed') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="world in worlds" :key="world.id">
          <td>{{ world.name }}</td>
          <td>{{ statusName(world.status) }}</td>
          <td>{{ runStateName(world.runState) }}</td>
          <td>{{ world.playerCount }} / {{ world.maxPlayers }}</td>
          <td>{{ world.freeSpawnCount }} / {{ world.spawnCount }}</td>
          <td>{{ world.joinsClosed ? $t('adminWorlds.joins.closed') : $t('adminWorlds.joins.open') }}</td>
          <td>{{ world.endbossTriggeredAt ? $t('adminWorlds.endbossStatus.triggered') : world.endbossAt ? $t('adminWorlds.endbossStatus.scheduled') : $t('adminWorlds.endbossStatus.none') }}</td>
          <td>{{ world.frozenIslesEnabled ? $t('adminWorlds.frozenIsles.enabled') : $t('adminWorlds.frozenIsles.disabled') }}</td>
          <td>{{ world.hidden ? $t('adminWorlds.yes') : $t('adminWorlds.no') }}</td>
          <td>{{ world.seed }}</td>
        </tr>
      </tbody>
    </table>

    <section v-for="world in worlds" :key="`panel-${world.id}`" class="panel">
      <h2>{{ world.name }}</h2>

      <p v-if="world.status === 'creating'" class="creating-note">{{ $t('adminWorlds.creatingNote') }}</p>
      <p v-else-if="world.status === 'failed'" class="error">
        {{ $t('adminWorlds.failedNote', { reason: world.creationError ?? '' }) }}
      </p>

      <div v-if="hasMap(world)" class="fields">
        <label :for="`name-${world.id}`">{{ $t('adminWorlds.fields.name') }}</label>
        <input :id="`name-${world.id}`" v-model="drafts[world.id].name" type="text" />

        <label :for="`speed-${world.id}`">{{ $t('adminWorlds.fields.speedFactor') }}</label>
        <input
          :id="`speed-${world.id}`"
          v-model="drafts[world.id].speedFactor"
          type="number"
          min="0.01"
          step="0.1"
        />

        <label :for="`starts-${world.id}`">{{ $t('adminWorlds.fields.startsAt') }}</label>
        <DateTimeField :id="`starts-${world.id}`" v-model="drafts[world.id].startsAt" />

        <label :for="`closed-${world.id}`">{{ $t('adminWorlds.fields.closedToNewPlayers') }}</label>
        <input :id="`closed-${world.id}`" v-model="drafts[world.id].joinsClosed" type="checkbox" />

        <label :for="`frozen-${world.id}`">{{ $t('adminWorlds.fields.frozenIslesEnabled') }}</label>
        <input :id="`frozen-${world.id}`" v-model="drafts[world.id].frozenIslesEnabled" type="checkbox" />

        <label :for="`hidden-${world.id}`">{{ $t('adminWorlds.fields.hidden') }}</label>
        <input :id="`hidden-${world.id}`" v-model="drafts[world.id].hidden" type="checkbox" />


        <label :for="`endboss-${world.id}`">{{ $t('adminWorlds.fields.endbossAt') }}</label>
        <DateTimeField :id="`endboss-${world.id}`" v-model="drafts[world.id].endbossAt" />
      </div>

      <p v-if="hasMap(world) && drafts[world.id]?.error" class="error">{{ drafts[world.id].error }}</p>

      <div v-if="hasMap(world)" class="actions">
        <button :disabled="drafts[world.id]?.saving" @click="saveSettings(world)">
          {{ drafts[world.id]?.saving ? $t('adminWorlds.saving') : $t('adminWorlds.saveSettings') }}
        </button>

        <span class="run-state">
          <span class="run-state-since">{{ runStateSinceText(world) }}</span>
          <select v-model="drafts[world.id].runState" :aria-label="$t('adminWorlds.columns.runState')">
            <option v-for="state in RUN_STATES" :key="state" :value="state">{{ runStateName(state) }}</option>
          </select>
          <label v-if="showsGrace(world)" class="grace">
            {{ $t('adminWorlds.graceMinutes') }}
            <input v-model="drafts[world.id].graceMinutes" type="number" min="0" step="1" />
          </label>
          <button
            class="apply-run-state"
            :disabled="drafts[world.id]?.saving || drafts[world.id]?.runState === world.runState"
            @click="applyRunState(world)"
          >
            {{ $t('adminWorlds.applyRunState') }}
          </button>
        </span>

        <!-- Issue #133. Its own route, not a button here: regenerating the map
             is previewed full-screen before it can be committed, and unlike
             everything else on this panel it deletes every settlement in the
             world. -->
        <router-link class="reseed-link" :to="`/admin/worlds/${world.id}/reseed`">{{ $t('adminWorlds.reseedLink') }}</router-link>
      </div>
    </section>
  </div>
</template>

<style scoped>
.worlds h1 {
  margin: 0 0 16px;
}
.table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 32px;
}
.table th,
.table td {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid var(--panel-border);
  font-size: 14px;
}
.panel {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 16px;
}
.panel h2 {
  margin: 0 0 12px;
  font-size: 16px;
}
.fields {
  display: grid;
  grid-template-columns: max-content 1fr;
  align-items: center;
  gap: 8px 16px;
}
.fields label {
  font-size: 13px;
  color: var(--muted);
}
.fields .datetime-field {
  align-items: flex-start;
}
.fields input[type='checkbox'] {
  justify-self: start;
}
.actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.run-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 16px;
  border-left: 1px solid var(--panel-border);
}
.run-state-since {
  font-size: 13px;
  color: var(--muted);
}
.run-state select {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--text);
}
.grace {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}
.grace input {
  width: 60px;
}
.create {
  margin-bottom: 24px;
  padding: 16px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
}
.create h2 {
  margin: 0 0 12px;
  font-size: 15px;
}
.create-fields {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-end;
}
.create-fields label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}
.create-fields input {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--text);
}
.error {
  color: var(--rival);
  font-size: 13px;
}
.reseed-link {
  color: var(--rival);
  font-size: 13px;
  text-decoration: none;
  padding-left: 16px;
  border-left: 1px solid var(--panel-border);
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
