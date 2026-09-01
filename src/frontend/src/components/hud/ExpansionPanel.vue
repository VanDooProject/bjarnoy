<script setup lang="ts">
// Settlement expansion (issue #55): renown, training settler crews, and
// dispatching/recalling/retargeting a founding convoy.
//
// Deliberately a small, self-contained panel that polls the API directly
// rather than being woven into `stores/world.ts`'s existing WorldModel/HUD
// sync loop (`syncHud`) the way BuildQueuePanel/ResourceBar are: this repo's
// troop system (issue #40, phases 1-7) shipped its domain/persistence/API
// layers but never got a frontend at all — no unit-training UI, no army-
// dispatch UI, no garrison display existed anywhere in `src/frontend`
// before this file. Rather than first building a whole general-purpose
// army/garrison UI this issue doesn't ask for, this panel talks to the
// settler-specific and generic-but-reusable endpoints directly. A future
// pass that builds out the rest of the troop system's frontend (raids,
// support, the world map's army markers) should fold this panel's polling
// into that same live-sync mechanism rather than leave two parallel ones.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useWorldStore } from '../../stores/world';
import { usePlayerStore } from '../../stores/player';
import { useAuthStore } from '../../stores/auth';
import { api, ApiError } from '../../api/client';
import { DEMO_MODE } from '../../config';
import type { ArmySummary, RenownResponse, SettlementResponse } from '../../api/types';

const world = useWorldStore();
const player = usePlayerStore();
const auth = useAuthStore();

const visible = computed(() => !DEMO_MODE && auth.isAuthenticated && !!world.selectedSettlementId);

const renown = ref<RenownResponse | null>(null);
const settlement = ref<SettlementResponse | null>(null);
const convoys = ref<ArmySummary[]>([]);
const error = ref<string | null>(null);
const busy = ref(false);

const settlerCrewCount = computed(
  () => settlement.value?.garrison.find((g) => g.unit === 'settlercrew')?.count ?? 0,
);
const foundingConvoys = computed(() => convoys.value.filter((a) => a.mission === 'found'));

// Founding-dispatch form.
const destQ = ref(0);
const destR = ref(0);
const provisions = ref(200);
const retargetFor = ref<string | null>(null);

async function refresh() {
  if (!visible.value || !world.worldId || !world.selectedSettlementId) return;
  try {
    const [r, s, a] = await Promise.all([
      api.getRenown(world.worldId),
      api.getSettlement(world.selectedSettlementId),
      api.getSettlementArmies(world.selectedSettlementId),
    ]);
    renown.value = r;
    settlement.value = s;
    convoys.value = a;
  } catch {
    // Transient/auth hiccups are not worth surfacing every poll tick — the
    // panel just shows whatever it last had.
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  refresh();
  timer = setInterval(refresh, 5000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

async function trainSettlerCrews() {
  if (!world.selectedSettlementId) return;
  busy.value = true;
  error.value = null;
  try {
    await api.trainUnits(world.selectedSettlementId, { unit: 'settlercrew', count: 3 });
    await refresh();
  } catch (e) {
    error.value = e instanceof ApiError ? (e.problem?.detail ?? e.message) : 'Training failed.';
  } finally {
    busy.value = false;
  }
}

async function dispatchFounding() {
  if (!world.selectedSettlementId) return;
  busy.value = true;
  error.value = null;
  try {
    await api.dispatchArmy(world.selectedSettlementId, {
      units: [{ unit: 'settlercrew', count: 3 }],
      destination: { q: destQ.value, r: destR.value },
      provisions: provisions.value,
      mission: 'found',
    });
    await refresh();
  } catch (e) {
    error.value = e instanceof ApiError ? (e.problem?.detail ?? e.message) : 'Dispatch failed.';
  } finally {
    busy.value = false;
  }
}

async function recall(armyId: string) {
  busy.value = true;
  error.value = null;
  try {
    await api.recallArmy(armyId);
    await refresh();
  } catch (e) {
    error.value = e instanceof ApiError ? (e.problem?.detail ?? e.message) : 'Recall failed.';
  } finally {
    busy.value = false;
  }
}

function beginRetarget(armyId: string) {
  retargetFor.value = armyId;
}

async function confirmRetarget() {
  if (!retargetFor.value) return;
  busy.value = true;
  error.value = null;
  try {
    await api.retargetFounding(retargetFor.value, { target: { q: destQ.value, r: destR.value } });
    retargetFor.value = null;
    await refresh();
  } catch (e) {
    error.value = e instanceof ApiError ? (e.problem?.detail ?? e.message) : 'Retarget failed.';
  } finally {
    busy.value = false;
  }
}

async function switchTo(settlementId: string) {
  if (settlementId === world.selectedSettlementId) return;
  player.switchSettlement(settlementId);
  await world.restoreLiveSettlement(player.id, settlementId);
  await refresh();
}

const mySettlements = ref<{ id: string; name: string; q: number; r: number }[]>([]);
async function loadMySettlements() {
  // Same auth gate as refresh() — this hits an authorized endpoint, so an
  // anonymous/demo player must never even attempt the request (it 401s,
  // and the caught error still surfaces as a console error in tests that
  // assert a clean console).
  if (!visible.value || !world.worldId) return;
  try {
    mySettlements.value = await api.listMySettlements(world.worldId);
  } catch {
    // Best-effort — the switcher just shows only the current settlement then.
  }
}
onMounted(loadMySettlements);
watch(visible, (isVisible) => {
  if (isVisible) loadMySettlements();
});
</script>

<template>
  <div v-if="visible" class="status-card expansion-card">
    <div class="status-card-header">
      <span class="status-card-title">Expansion</span>
      <span v-if="renown" class="status-card-count">
        Renown {{ Math.floor(renown.total) }} / {{ Math.round(renown.requiredForNextSettlement) }}
      </span>
    </div>

    <div v-if="mySettlements.length > 1" class="expansion-switcher">
      <label for="settlement-switcher">Settlement</label>
      <select
        id="settlement-switcher"
        :value="world.selectedSettlementId"
        @change="switchTo(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="s in mySettlements" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
    </div>

    <div class="expansion-row">
      <span>Settler crews in garrison</span>
      <strong>{{ settlerCrewCount }}</strong>
    </div>
    <button type="button" class="expansion-button" :disabled="busy" @click="trainSettlerCrews">
      Train 3 settler crews
    </button>

    <template v-if="renown">
      <div class="expansion-row">
        <span>Can found another settlement</span>
        <strong>{{ renown.canFoundAnother ? 'Yes' : 'Not yet' }}</strong>
      </div>
    </template>

    <div v-if="settlerCrewCount >= 3 && renown?.canFoundAnother" class="expansion-form">
      <div class="expansion-form-row">
        <label>Target hex</label>
        <input v-model.number="destQ" type="number" aria-label="Target Q" />
        <input v-model.number="destR" type="number" aria-label="Target R" />
      </div>
      <div class="expansion-form-row">
        <label>Provisions</label>
        <input v-model.number="provisions" type="number" min="0" aria-label="Provisions" />
      </div>
      <button type="button" class="expansion-button" :disabled="busy" @click="dispatchFounding">
        Found settlement here
      </button>
    </div>

    <div v-if="foundingConvoys.length" class="expansion-convoys">
      <div v-for="c in foundingConvoys" :key="c.id" class="status-row">
        <div class="status-row-top">
          <span class="status-row-name">Settler convoy</span>
          <span class="status-row-time">{{ c.position.q }}, {{ c.position.r }}</span>
        </div>
        <div class="expansion-form-row">
          <button type="button" class="expansion-button-small" :disabled="busy" @click="recall(c.id)">
            Recall
          </button>
          <button
            type="button"
            class="expansion-button-small"
            :disabled="busy"
            @click="beginRetarget(c.id)"
          >
            Retarget
          </button>
        </div>
        <div v-if="retargetFor === c.id" class="expansion-form-row">
          <input v-model.number="destQ" type="number" aria-label="New target Q" />
          <input v-model.number="destR" type="number" aria-label="New target R" />
          <button type="button" class="expansion-button-small" :disabled="busy" @click="confirmRetarget">
            Confirm
          </button>
        </div>
      </div>
    </div>

    <p v-if="error" class="expansion-error">{{ error }}</p>
  </div>
</template>

<style scoped>
/* Reuses the .status-card/.status-row convention BuildQueuePanel established. */
.expansion-card {
  top: 340px;
}
.expansion-switcher {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--muted);
}
.expansion-switcher select {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 4px 6px;
}
.expansion-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
  padding: 4px 0;
}
.expansion-row strong {
  color: var(--text);
}
.expansion-button {
  width: 100%;
  margin-top: 6px;
  padding: 6px 8px;
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.expansion-button:hover:not(:disabled) {
  border-color: var(--gold);
  color: var(--gold);
}
.expansion-button:disabled {
  opacity: 0.5;
  cursor: default;
}
.expansion-button-small {
  flex: 1;
  padding: 4px 6px;
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}
.expansion-form {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--panel-border);
}
.expansion-form-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}
.expansion-form-row label {
  font-size: 11px;
  color: var(--muted);
  min-width: 60px;
}
.expansion-form-row input {
  width: 100%;
  min-width: 0;
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 3px 5px;
  font: inherit;
  font-size: 12px;
}
.expansion-convoys {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--panel-border);
}
.expansion-error {
  margin-top: 8px;
  font-size: 11px;
  color: #e6785a;
}
</style>
