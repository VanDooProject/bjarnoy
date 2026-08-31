<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, ApiError } from '../../api/client';
import type {
  AdminSettlementHexResponse,
  AdminSettlementLayoutResponse,
  SettlementResponse,
} from '../../api/types';

// The graphical half of the admin settlement editor (issue #105): the
// settlement's claimed hexes drawn as a real hex grid, click one to place,
// re-level or raze what stands on it, with the instant-build control on the
// same panel — those are the two things one reaches for together.
const props = defineProps<{ settlementId: string; settlement: SettlementResponse }>();
const emit = defineEmits<{ changed: [settlement: SettlementResponse] }>();

const layout = ref<AdminSettlementLayoutResponse | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);

const selected = ref<AdminSettlementHexResponse | null>(null);
const building = ref('');
const level = ref(1);
const saving = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

/** Pointy-top axial layout; the grid is small enough to draw every hex up front. */
const HEX_SIZE = 26;
const SQRT3 = Math.sqrt(3);

function centreOf(hex: { q: number; r: number }): { x: number; y: number } {
  return {
    x: HEX_SIZE * SQRT3 * (hex.q + hex.r / 2),
    y: HEX_SIZE * 1.5 * hex.r,
  };
}

function pointsFor(hex: { q: number; r: number }): string {
  const { x, y } = centreOf(hex);
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return `${(x + HEX_SIZE * Math.cos(angle)).toFixed(2)},${(y + HEX_SIZE * Math.sin(angle)).toFixed(2)}`;
  }).join(' ');
}

/** The grid is centred on the settlement, so the viewBox follows the hexes rather than assuming a size. */
const viewBox = computed(() => {
  const hexes = layout.value?.hexes ?? [];
  if (hexes.length === 0) return '0 0 100 100';

  const centres = hexes.map(centreOf);
  const minX = Math.min(...centres.map((c) => c.x)) - HEX_SIZE * 1.2;
  const maxX = Math.max(...centres.map((c) => c.x)) + HEX_SIZE * 1.2;
  const minY = Math.min(...centres.map((c) => c.y)) - HEX_SIZE * 1.2;
  const maxY = Math.max(...centres.map((c) => c.y)) + HEX_SIZE * 1.2;
  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
});

const pending = computed(
  () => props.settlement.queue.length + props.settlement.trainingQueue.length,
);

function keyOf(hex: { q: number; r: number }): string {
  return `${hex.q},${hex.r}`;
}

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    layout.value = await api.adminGetSettlementLayout(props.settlementId);
    if (selected.value) {
      selected.value =
        layout.value.hexes.find((h) => keyOf(h) === keyOf(selected.value!)) ?? null;
    }
  } catch {
    loadError.value = 'Could not load the settlement layout.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.settlementId, load, { immediate: true });

function select(hex: AdminSettlementHexResponse) {
  selected.value = hex;
  error.value = null;
  notice.value = null;
  building.value = hex.building ?? layout.value?.buildingTypes[0] ?? '';
  level.value = hex.level ?? 1;
}

/** Applies a settlement the backend just returned, then refreshes the grid it was drawn from. */
async function applied(updated: SettlementResponse, message: string) {
  emit('changed', updated);
  notice.value = message;
  await load();
}

async function place() {
  const hex = selected.value;
  if (!hex || saving.value || !building.value) return;

  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    const updated = await api.adminPlaceBuilding(props.settlementId, hex.q, hex.r, {
      building: building.value,
      level: level.value,
    });
    await applied(updated, `${building.value} set to level ${level.value}.`);
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not place the building.';
  } finally {
    saving.value = false;
  }
}

async function raze() {
  const hex = selected.value;
  if (!hex || saving.value || !hex.building) return;

  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    const updated = await api.adminRazeBuilding(props.settlementId, hex.q, hex.r);
    await applied(updated, 'Razed.');
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not raze the building.';
  } finally {
    saving.value = false;
  }
}

async function instantBuild() {
  if (saving.value) return;

  saving.value = true;
  error.value = null;
  notice.value = null;
  try {
    const result = await api.adminCompleteQueues(props.settlementId, { builds: true, training: true });
    await applied(
      result.settlement,
      `Finished ${result.completedBuilds} build(s) and ${result.completedTraining} training batch(es).`,
    );
  } catch (err) {
    error.value = err instanceof ApiError ? err.message : 'Could not finish the queue.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="layout-editor">
    <header>
      <h3>Settlement editor</h3>
      <button class="insta" type="button" :disabled="saving || pending === 0" @click="instantBuild">
        {{ pending === 0 ? 'Nothing queued' : `Instant build (${pending} queued)` }}
      </button>
    </header>

    <p v-if="loading">Loading layout…</p>
    <p v-else-if="loadError" class="error">{{ loadError }}</p>

    <div v-else-if="layout" class="grid-and-form">
      <svg class="grid" :viewBox="viewBox" role="group" aria-label="Settlement hexes">
        <g v-for="hex in layout.hexes" :key="keyOf(hex)">
          <polygon
            :points="pointsFor(hex)"
            :class="[
              'hex',
              `terrain-${hex.terrain}`,
              { occupied: !!hex.building, selected: selected && keyOf(selected) === keyOf(hex) },
            ]"
            :data-hex="keyOf(hex)"
            @click="select(hex)"
          />
          <text
            v-if="hex.building"
            :x="centreOf(hex).x"
            :y="centreOf(hex).y + 4"
            class="label"
            @click="select(hex)"
          >
            {{ hex.building.slice(0, 4) }} {{ hex.level }}
          </text>
        </g>
      </svg>

      <div class="hex-form">
        <p v-if="!selected" class="hint">Pick a hex to edit it.</p>
        <template v-else>
          <h4>({{ selected.q }}, {{ selected.r }}) — {{ selected.terrain }}</h4>
          <p class="standing">
            {{ selected.building ? `${selected.building} level ${selected.level}` : 'Empty' }}
          </p>

          <label>
            Building
            <select v-model="building">
              <option v-for="type in layout.buildingTypes" :key="type" :value="type">{{ type }}</option>
            </select>
          </label>
          <label>
            Level
            <input v-model.number="level" type="number" min="1" :max="layout.maxLevel" step="1" />
          </label>

          <div class="actions">
            <button type="button" :disabled="saving || !building" @click="place">Apply</button>
            <button type="button" class="danger" :disabled="saving || !selected.building" @click="raze">
              Raze
            </button>
          </div>
        </template>

        <p v-if="error" class="error">{{ error }}</p>
        <p v-else-if="notice" class="notice">{{ notice }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.layout-editor header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.layout-editor h3 {
  margin: 0;
  font-size: 15px;
}
.grid-and-form {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
  align-items: flex-start;
}
.grid {
  width: 320px;
  max-width: 100%;
  height: auto;
}
.hex {
  stroke: var(--panel-border);
  stroke-width: 1.5;
  cursor: pointer;
  fill: #3a4a3a;
}
.terrain-grass {
  fill: #3f5a35;
}
.terrain-forest {
  fill: #27401f;
}
.terrain-mountain {
  fill: #4b4b52;
}
.terrain-sand {
  fill: #7b6b45;
}
.terrain-sea {
  fill: #22384f;
}
.hex.occupied {
  stroke: var(--gold);
}
.hex.selected {
  stroke: #fff;
  stroke-width: 3;
}
.label {
  font-size: 9px;
  fill: #fff;
  text-anchor: middle;
  pointer-events: none;
}
.hex-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 200px;
}
.hex-form h4 {
  margin: 0;
  font-size: 14px;
}
.standing,
.hint {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}
.hex-form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}
.actions {
  display: flex;
  gap: 8px;
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
button.danger {
  background: var(--rival);
  color: #fff;
}
button:disabled {
  opacity: 0.6;
  cursor: default;
}
.error {
  color: var(--rival);
  font-size: 13px;
}
.notice {
  color: var(--muted);
  font-size: 13px;
}
</style>
