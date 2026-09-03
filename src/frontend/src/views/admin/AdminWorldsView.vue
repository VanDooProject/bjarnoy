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
  // Issue #132 design doc §1: BaseShieldDays is admin-configurable per
  // world, mirroring speedFactor's own draft/save shape exactly.
  baseShieldDays: string;
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
    baseShieldDays: String(world.baseShieldDays),
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

// Creating a world (issue #105). Its own draft, separate from the per-world
// settings drafts above — this one has no world to key off yet.
const newWorld = reactive({
  name: '',
  seed: '',
  radius: '60',
  maxPlayers: '500',
  creating: false,
  error: null as string | null,
});

async function createWorld() {
  if (newWorld.creating) return;

  if (newWorld.name.trim().length < 3) {
    newWorld.error = 'A world name needs at least three characters.';
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
      radius: Number(newWorld.radius) || 60,
      maxPlayers: Number(newWorld.maxPlayers) || 500,
    });

    worlds.value = [...worlds.value, created];
    drafts[created.id] = draftFor(created);
    newWorld.name = '';
    newWorld.seed = '';
  } catch (err) {
    newWorld.error = err instanceof ApiError ? err.message : 'Could not create the world.';
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

  const baseShieldDays = Number(draft.baseShieldDays);
  if (!Number.isFinite(baseShieldDays) || baseShieldDays <= 0) {
    draft.error = 'Base shield days must be greater than 0.';
    return;
  }

  draft.saving = true;
  draft.error = null;
  try {
    const updated = await api.adminUpdateWorldSettings(world.id, {
      speedFactor,
      baseShieldDays,
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

    <form class="create" @submit.prevent="createWorld">
      <h2>Create a world</h2>
      <div class="create-fields">
        <label>
          Name
          <input v-model="newWorld.name" type="text" placeholder="Midgard" />
        </label>
        <label>
          Seed
          <input v-model="newWorld.seed" type="number" step="1" placeholder="random" />
        </label>
        <label>
          Radius
          <input v-model="newWorld.radius" type="number" min="1" max="1000" step="1" />
        </label>
        <label>
          Max players
          <input v-model="newWorld.maxPlayers" type="number" min="1" step="1" />
        </label>
        <button type="submit" :disabled="newWorld.creating">
          {{ newWorld.creating ? 'Generating…' : 'Create world' }}
        </button>
      </div>
      <p v-if="newWorld.error" class="error">{{ newWorld.error }}</p>
    </form>

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
          <!-- Issue #132 design doc §7: beginner spawn-segregation health at
               a glance — how many rings still have spare beginner capacity,
               out of how many contain any island, plus the total-exhaustion
               fallback state an admin needs to notice on its own. -->
          <th>Beginner rings</th>
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
          <td :class="{ exhausted: world.beginnerTotalExhaustion }">
            {{ world.beginnerRingsWithCapacity }} / {{ world.beginnerRingsTotal }}
            <span v-if="world.beginnerTotalExhaustion" class="exhausted-flag">exhausted</span>
          </td>
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

        <label :for="`shield-${world.id}`">Base shield days</label>
        <input
          :id="`shield-${world.id}`"
          v-model="drafts[world.id].baseShieldDays"
          type="number"
          min="0.01"
          step="0.5"
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
.exhausted {
  color: var(--rival);
  font-weight: 600;
}
.exhausted-flag {
  margin-left: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
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
