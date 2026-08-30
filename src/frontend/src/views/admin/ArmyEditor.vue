<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { api, ApiError } from '../../api/client';
import type { AdminArmyResponse } from '../../api/types';

// Troop editing via admin (issue #105): change an army's units and food, speed
// its journey up (or slow it down), and drop it on any hex it could legally
// stand on. Scoped to one settlement's armies, alongside the rest of that
// settlement's god-mode panel.
const props = defineProps<{ settlementId: string }>();

const armies = ref<AdminArmyResponse[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);

interface Draft {
  stacks: { unit: string; count: number }[];
  provisions: number;
  arriveInMinutes: string;
  q: string;
  r: string;
  saving: boolean;
  error: string | null;
}

const drafts = reactive<Record<string, Draft>>({});
const openId = ref<string | null>(null);

function draftFor(entry: AdminArmyResponse): Draft {
  return {
    stacks: entry.army.stacks.map((s) => ({ unit: s.unit, count: s.count })),
    provisions: Math.round(entry.army.provisions),
    arriveInMinutes: '',
    q: String(entry.army.position.q),
    r: String(entry.army.position.r),
    saving: false,
    error: null,
  };
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    armies.value = await api.adminListArmies({ settlementId: props.settlementId });
    for (const entry of armies.value) {
      drafts[entry.army.id] = draftFor(entry);
    }
  } catch {
    loadError.value = 'Could not load armies.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.settlementId, load, { immediate: true });

function toggle(entry: AdminArmyResponse) {
  openId.value = openId.value === entry.army.id ? null : entry.army.id;
}

function where(entry: AdminArmyResponse): string {
  if (entry.army.atHome) return 'at home';
  if (entry.army.supporting) return 'supporting';
  return `in transit, arriving ${new Date(entry.army.movement!.arrivesAt).toLocaleString()}`;
}

async function save(entry: AdminArmyResponse, options: { move: boolean; retime: boolean }) {
  const draft = drafts[entry.army.id];
  if (!draft || draft.saving) return;

  draft.saving = true;
  draft.error = null;
  try {
    const updated = await api.adminEditArmy(entry.army.id, {
      units: draft.stacks.map((s) => ({ unit: s.unit, count: Number(s.count) || 0 })),
      provisions: Number(draft.provisions) || 0,
      ...(options.retime && draft.arriveInMinutes !== ''
        ? { arriveInMinutes: Number(draft.arriveInMinutes) }
        : {}),
      ...(options.move ? { position: { q: Number(draft.q), r: Number(draft.r) } } : {}),
    });

    const index = armies.value.findIndex((a) => a.army.id === updated.army.id);
    if (index !== -1) armies.value[index] = updated;
    drafts[updated.army.id] = draftFor(updated);
  } catch (err) {
    draft.error = err instanceof ApiError ? err.message : 'Could not edit the army.';
  } finally {
    draft.saving = false;
  }
}
</script>

<template>
  <section class="army-editor">
    <h3>Armies</h3>

    <p v-if="loading">Loading armies…</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>
    <p v-else-if="armies.length === 0" class="hint">No armies in the field.</p>

    <ul v-else class="armies">
      <li v-for="entry in armies" :key="entry.army.id" class="army">
        <div class="summary">
          <span class="mission">{{ entry.army.mission }}</span>
          <span class="units">
            {{ entry.army.stacks.map((s) => `${s.count}x ${s.unit}`).join(', ') || 'empty' }}
          </span>
          <span class="position">({{ entry.army.position.q }}, {{ entry.army.position.r }}) — {{ where(entry) }}</span>
          <button type="button" @click="toggle(entry)">
            {{ openId === entry.army.id ? 'Close' : 'Edit' }}
          </button>
        </div>

        <div v-if="openId === entry.army.id && drafts[entry.army.id]" class="edit">
          <div class="stacks">
            <label v-for="(stack, index) in drafts[entry.army.id].stacks" :key="stack.unit">
              {{ stack.unit }}
              <input v-model.number="drafts[entry.army.id].stacks[index].count" type="number" min="0" step="1" />
            </label>
            <label>
              Provisions
              <input v-model.number="drafts[entry.army.id].provisions" type="number" min="0" step="1" />
            </label>
          </div>

          <div class="controls">
            <label>
              Arrive in (min)
              <input v-model="drafts[entry.army.id].arriveInMinutes" type="number" min="0" step="1" />
            </label>
            <button
              type="button"
              :disabled="drafts[entry.army.id].saving"
              @click="save(entry, { move: false, retime: true })"
            >
              Speed up
            </button>
          </div>

          <div class="controls">
            <label>
              q
              <input v-model="drafts[entry.army.id].q" type="number" step="1" />
            </label>
            <label>
              r
              <input v-model="drafts[entry.army.id].r" type="number" step="1" />
            </label>
            <button
              type="button"
              :disabled="drafts[entry.army.id].saving"
              @click="save(entry, { move: true, retime: false })"
            >
              Move here
            </button>
          </div>

          <button
            type="button"
            :disabled="drafts[entry.army.id].saving"
            @click="save(entry, { move: false, retime: false })"
          >
            {{ drafts[entry.army.id].saving ? 'Saving…' : 'Save units & food' }}
          </button>

          <p v-if="drafts[entry.army.id].error" class="error">{{ drafts[entry.army.id].error }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.army-editor h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
.hint {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}
.armies {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.summary {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  flex-wrap: wrap;
}
.mission {
  font-weight: 600;
}
.position {
  color: var(--muted);
}
.edit {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 12px;
}
.stacks,
.controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: flex-end;
}
label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}
input {
  width: 90px;
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
  align-self: flex-start;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.error {
  color: var(--rival);
  font-size: 13px;
}
</style>
