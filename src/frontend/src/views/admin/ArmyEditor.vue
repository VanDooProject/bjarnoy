<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiError } from '../../api/client';
import type { AdminArmyResponse } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';
import { useUnsavedInput } from '../../composables/useUnsavedInput';

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

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

function editedFields(d: Draft): string {
  return JSON.stringify([d.stacks, d.provisions, d.arriveInMinutes, d.q, d.r]);
}

// An open draft that differs from what the army currently is.
useUnsavedInput(() =>
  armies.value.some((entry) => {
    const draft = drafts[entry.army.id];
    if (!draft) return false;
    return editedFields(draft) !== editedFields(draftFor(entry));
  }),
);

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
    loadError.value = t('armyEditor.loadError');
  } finally {
    loading.value = false;
  }
}

watch(() => props.settlementId, load, { immediate: true });

function toggle(entry: AdminArmyResponse) {
  openId.value = openId.value === entry.army.id ? null : entry.army.id;
}

function where(entry: AdminArmyResponse): string {
  if (entry.army.atHome) return t('armyEditor.where.atHome');
  if (entry.army.supporting) return t('armyEditor.where.supporting');
  return t('armyEditor.where.inTransit', {
    date: d(new Date(entry.army.movement!.arrivesAt), 'long'),
  });
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
    draft.error = err instanceof ApiError ? err.message : t('armyEditor.editError');
  } finally {
    draft.saving = false;
  }
}
</script>

<template>
  <section class="army-editor">
    <h3>{{ $t('armyEditor.title') }}</h3>

    <p v-if="loading">{{ $t('armyEditor.loading') }}</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>
    <p v-else-if="armies.length === 0" class="hint">{{ $t('armyEditor.empty') }}</p>

    <table v-else class="armies">
      <thead>
        <tr>
          <th>{{ $t('armyEditor.col.mission') }}</th>
          <th>{{ $t('armyEditor.col.units') }}</th>
          <th class="num">{{ $t('armyEditor.col.provisions') }}</th>
          <th>{{ $t('armyEditor.col.loot') }}</th>
          <th>{{ $t('armyEditor.col.position') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody v-for="entry in armies" :key="entry.army.id" class="army">
        <tr class="summary">
          <td class="mission">{{ entry.army.mission }}</td>
          <td class="units">
            {{ entry.army.stacks.map((s) => `${s.count}x ${s.unit}`).join(', ') || $t('armyEditor.unitsEmpty') }}
          </td>
          <td class="num provisions">{{ Math.round(entry.army.provisions) }}</td>
          <td class="loot">
            {{
              $t('armyEditor.lootLine', {
                wood: Math.round(entry.loot.wood),
                stone: Math.round(entry.loot.stone),
                food: Math.round(entry.loot.food),
                iron: Math.round(entry.loot.iron),
              })
            }}
          </td>
          <td class="position">({{ entry.army.position.q }}, {{ entry.army.position.r }}) — {{ where(entry) }}</td>
          <td>
            <button type="button" @click="toggle(entry)">
              {{ openId === entry.army.id ? $t('armyEditor.close') : $t('armyEditor.edit') }}
            </button>
          </td>
        </tr>

        <tr v-if="openId === entry.army.id && drafts[entry.army.id]" class="edit-row">
          <td colspan="6">
            <div class="edit">
              <div class="stacks">
                <label v-for="(stack, index) in drafts[entry.army.id].stacks" :key="stack.unit">
                  {{ stack.unit }}
                  <input v-model.number="drafts[entry.army.id].stacks[index].count" type="number" min="0" step="1" />
                </label>
                <label>
                  {{ $t('armyEditor.provisions') }}
                  <input v-model.number="drafts[entry.army.id].provisions" type="number" min="0" step="1" />
                </label>
              </div>

              <div class="controls">
                <label>
                  {{ $t('armyEditor.arriveInMinutes') }}
                  <input v-model="drafts[entry.army.id].arriveInMinutes" type="number" min="0" step="1" />
                </label>
                <button
                  type="button"
                  :disabled="drafts[entry.army.id].saving"
                  @click="save(entry, { move: false, retime: true })"
                >
                  {{ $t('armyEditor.speedUp') }}
                </button>
              </div>

              <div class="controls">
                <label>
                  {{ $t('armyEditor.coordQ') }}
                  <input v-model="drafts[entry.army.id].q" type="number" step="1" />
                </label>
                <label>
                  {{ $t('armyEditor.coordR') }}
                  <input v-model="drafts[entry.army.id].r" type="number" step="1" />
                </label>
                <button
                  type="button"
                  :disabled="drafts[entry.army.id].saving"
                  @click="save(entry, { move: true, retime: false })"
                >
                  {{ $t('armyEditor.moveHere') }}
                </button>
              </div>

              <button
                type="button"
                :disabled="drafts[entry.army.id].saving"
                @click="save(entry, { move: false, retime: false })"
              >
                {{ drafts[entry.army.id].saving ? $t('armyEditor.saving') : $t('armyEditor.saveUnitsAndFood') }}
              </button>

              <p v-if="drafts[entry.army.id].error" class="error">{{ drafts[entry.army.id].error }}</p>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
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
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.armies th,
.armies td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid var(--panel-border);
  vertical-align: middle;
}
.armies th {
  color: var(--muted);
  font-weight: 600;
}
.armies .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.mission {
  font-weight: 600;
}
.position {
  color: var(--muted);
}
.edit-row td {
  padding: 0;
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
