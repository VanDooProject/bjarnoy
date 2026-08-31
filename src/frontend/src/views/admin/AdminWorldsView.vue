<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { api, ApiError } from '../../api/client';
import type { AdminWorldResponse } from '../../api/types';

const worlds = ref<AdminWorldResponse[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);

// Per-world draft form state, keyed by world id — lets each panel be edited
// independently without clobbering the others.
interface Draft {
  speedFactor: string;
  startsAt: string;
  joinsClosed: boolean;
  endbossAt: string;
  graceMinutes: string;
  saving: boolean;
  error: string | null;
}

const drafts = reactive<Record<string, Draft>>({});

function draftFor(world: AdminWorldResponse): Draft {
  return {
    speedFactor: String(world.speedFactor),
    startsAt: toLocalInput(world.startsAt),
    joinsClosed: world.joinsClosed,
    endbossAt: toLocalInput(world.endbossAt),
    graceMinutes: '0',
    saving: false,
    error: null,
  };
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time, and
// hands back the same shape — round-trip through Date to convert to/from
// the ISO 8601 the backend sends/expects.
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
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
    loadError.value = 'Could not load worlds.';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function applyUpdated(updated: AdminWorldResponse) {
  const index = worlds.value.findIndex((w) => w.id === updated.id);
  if (index !== -1) worlds.value[index] = updated;
  drafts[updated.id] = draftFor(updated);
}

async function saveSettings(world: AdminWorldResponse) {
  const draft = drafts[world.id];
  if (!draft || draft.saving) return;

  const speedFactor = Number(draft.speedFactor);
  if (!Number.isFinite(speedFactor) || speedFactor <= 0) {
    draft.error = 'Speed factor must be greater than 0.';
    return;
  }

  draft.saving = true;
  draft.error = null;
  try {
    const updated = await api.adminUpdateWorldSettings(world.id, {
      speedFactor,
      startsAt: fromLocalInput(draft.startsAt),
      joinsClosed: draft.joinsClosed,
      endbossAt: fromLocalInput(draft.endbossAt),
    });
    applyUpdated(updated);
  } catch (err) {
    draft.error = err instanceof ApiError ? err.message : 'Could not save.';
  } finally {
    draft.saving = false;
  }
}

const RUN_STATE_LABELS: Record<string, string> = {
  pause: 'Pause',
  maintenance: 'Enter maintenance',
  lock: 'Lock',
  resume: 'Resume',
};

async function setRunState(world: AdminWorldResponse, action: string) {
  const draft = drafts[world.id];
  if (!draft || draft.saving) return;

  const label = RUN_STATE_LABELS[action] ?? action;
  if (!window.confirm(`${label} world "${world.name}"?`)) return;

  draft.saving = true;
  draft.error = null;
  try {
    const graceMinutes = action === 'resume' ? Number(draft.graceMinutes) || 0 : undefined;
    const updated = await api.adminSetWorldRunState(world.id, { action, graceMinutes });
    applyUpdated(updated);
  } catch (err) {
    draft.error = err instanceof ApiError ? err.message : 'Could not update run state.';
  } finally {
    draft.saving = false;
  }
}
</script>

<template>
  <div class="worlds">
    <h1>Worlds</h1>

    <p v-if="loading">Loading…</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>

    <table v-else class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Status</th>
          <th>Run state</th>
          <th>Players</th>
          <th>Joinable</th>
          <th>Endboss</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="world in worlds" :key="world.id">
          <td>{{ world.name }}</td>
          <td>{{ world.status }}</td>
          <td>{{ world.runState }}</td>
          <td>{{ world.playerCount }} / {{ world.maxPlayers }}</td>
          <td>{{ world.joinsClosed ? 'Closed' : 'Open' }}</td>
          <td>{{ world.endbossTriggeredAt ? 'Triggered' : world.endbossAt ? 'Scheduled' : '—' }}</td>
        </tr>
      </tbody>
    </table>

    <section v-for="world in worlds" :key="`panel-${world.id}`" class="panel">
      <h2>{{ world.name }}</h2>

      <div class="fields">
        <label :for="`speed-${world.id}`">Speed factor</label>
        <input
          :id="`speed-${world.id}`"
          v-model="drafts[world.id].speedFactor"
          type="number"
          min="0.01"
          step="0.1"
        />

        <label :for="`starts-${world.id}`">Starts at</label>
        <input :id="`starts-${world.id}`" v-model="drafts[world.id].startsAt" type="datetime-local" />

        <label :for="`closed-${world.id}`">Closed to new players</label>
        <input :id="`closed-${world.id}`" v-model="drafts[world.id].joinsClosed" type="checkbox" />

        <label :for="`endboss-${world.id}`">Endboss at</label>
        <input :id="`endboss-${world.id}`" v-model="drafts[world.id].endbossAt" type="datetime-local" />
      </div>

      <p v-if="drafts[world.id]?.error" class="error">{{ drafts[world.id].error }}</p>

      <div class="actions">
        <button :disabled="drafts[world.id]?.saving" @click="saveSettings(world)">
          {{ drafts[world.id]?.saving ? 'Saving…' : 'Save settings' }}
        </button>

        <span class="run-state-actions">
          <button :disabled="drafts[world.id]?.saving" @click="setRunState(world, 'pause')">Pause</button>
          <button :disabled="drafts[world.id]?.saving" @click="setRunState(world, 'maintenance')">Maintenance</button>
          <button :disabled="drafts[world.id]?.saving" @click="setRunState(world, 'lock')">Lock</button>
          <label class="grace">
            Grace (min)
            <input v-model="drafts[world.id].graceMinutes" type="number" min="0" step="1" />
          </label>
          <button :disabled="drafts[world.id]?.saving" @click="setRunState(world, 'resume')">Resume</button>
        </span>

        <!-- Issue #133. Its own route, not a button here: regenerating the map
             is previewed full-screen before it can be committed, and unlike
             everything else on this panel it deletes every settlement in the
             world. -->
        <router-link class="reseed-link" :to="`/admin/worlds/${world.id}/reseed`">Reseed map…</router-link>
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
.run-state-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 16px;
  border-left: 1px solid var(--panel-border);
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
