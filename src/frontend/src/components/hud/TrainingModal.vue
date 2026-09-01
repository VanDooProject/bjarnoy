<script setup lang="ts">
// Issue #40 phase 1: "build units in longhouse" — opened from SettlementView
// the same way BuildingModal is (a ring action), but as its own modal since
// training isn't a per-hex build/upgrade action: it lists the whole unit
// roster at once with a quantity picker, rather than BuildingModal's
// single-target cost/duration/action layout.
import { computed, onMounted, ref } from 'vue';
import { ApiError } from '../../api/client';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { DEMO_MODE } from '../../config';
import {
  canAfford,
  formatCostLine,
  formatTrainingDuration,
  isUnitAvailable,
  totalTrainingCost,
} from '../../lib/units/trainingEconomy';
import { claimDiscs, hasShorelineInTerritory } from '../../lib/map/shoreline';

const emit = defineEmits<{ close: []; trained: [] }>();

const world = useWorldStore();
const catalogue = useUnitCatalogueStore();

onMounted(() => {
  void catalogue.load();
});

// One quantity input per unit type, defaulting to 1 — keyed by wire type
// name so it survives the catalogue's own array ordering.
const quantities = ref<Record<string, number>>({});
function quantityFor(type: string): number {
  return quantities.value[type] ?? 1;
}
function setQuantity(type: string, value: string) {
  const n = Math.floor(Number(value));
  quantities.value[type] = Number.isFinite(n) && n > 0 ? n : 1;
}

const longhouseLevel = computed(() => world.hud.level);

// Issue #40 phase 6 §4: whether this settlement's own claimed territory
// touches the sea — Ship-class units (Karve, Longship) need it, mirroring
// `Settlement.PlanTrain`'s `hasShoreline` gate (`TrainRejection.SettlementNotCoastal`).
// Computed client-side from the same deterministic terrain the map already
// renders (see `lib/map/shoreline.ts`'s own comment on why that's safe)
// rather than a new backend flag. Checks the settlement's *full* claimed
// territory — the centre disc plus every placed Tower's own satellite disc
// (see `claimDiscs`) — not just the centre disc, since a Tower can reach the
// coast even when the centre disc alone never does; the player's own Tower
// positions/levels are already available via `world.hud.buildings`
// (`PlacedBuildingResponse`, refreshed alongside everything else in
// `refreshLiveSettlement`), so this needs no extra backend field. `null` (no
// settlement selected yet, e.g. demo mode's landing page) reads as "unknown"
// — treated as available below so a Ship row isn't wrongly greyed out before
// there's anything to check against; the Train button still enforces the
// real rule server-side either way.
const isCoastal = computed<boolean | null>(() => {
  const settlement = world.selectedSettlementId ? world.model.getSettlement(world.selectedSettlementId) : undefined;
  if (!settlement) return null;
  const towers = world.hud.buildings
    .filter((b) => b.type === 'tower')
    .map((b) => ({ q: b.q, r: b.r, level: b.level }));
  const discs = claimDiscs({ q: settlement.q, r: settlement.r }, longhouseLevel.value, towers);
  return hasShorelineInTerritory(discs, world.model);
});

const rows = computed(() =>
  catalogue.definitions.map((definition) => {
    const count = quantityFor(definition.type);
    const cost = totalTrainingCost(definition, count);
    const meetsLevel = isUnitAvailable(definition.type, longhouseLevel.value, catalogue.byType);
    const needsCoast = definition.class === 'ship';
    const coastal = isCoastal.value !== false; // unknown (null) treated as coastal, see isCoastal's comment
    const available = meetsLevel && (!needsCoast || coastal);
    const affordable = canAfford(cost, world.hud.resources);
    return {
      definition,
      count,
      cost,
      costText: formatCostLine(cost),
      durationText: formatTrainingDuration(definition.trainingSeconds, count),
      available,
      // Only true once the *other* requirements are already met — no point
      // telling the player "also, no shoreline" on a unit whose longhouse
      // level they haven't reached yet either.
      needsCoastReason: meetsLevel && needsCoast && !coastal,
      affordable,
      // Training only works against the live backend; demo mode has no
      // TrainingOrder/garrison concept in the local WorldModel yet.
      trainable: available && affordable && !DEMO_MODE,
    };
  }),
);

const training = ref<string | null>(null);
const errorText = ref<string | null>(null);

async function train(type: string, count: number) {
  errorText.value = null;
  training.value = type;
  try {
    await world.trainUnitsLive(type, count);
    emit('trained');
  } catch (err) {
    // Mirrors how QueueBuildRequest's 409 rejection is surfaced elsewhere —
    // ApiError.problem.detail carries the backend's human-readable reason
    // (see SettlementEndpoints.DescribeTrain).
    errorText.value = err instanceof ApiError ? (err.problem?.detail ?? err.message) : 'Training failed.';
  } finally {
    training.value = null;
  }
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="modal panel">
      <div class="head">
        <div>
          <div class="name">Train units</div>
          <div class="sub">Longhouse level {{ longhouseLevel }}</div>
        </div>
        <button class="close" @click="emit('close')">✕</button>
      </div>

      <p v-if="DEMO_MODE" class="desc demo-note">
        Training requires the live backend and isn't wired up in demo mode yet.
      </p>
      <p v-if="errorText" class="desc error-note">{{ errorText }}</p>

      <div class="roster">
        <div
          v-for="row in rows"
          :key="row.definition.type"
          class="unit-row"
          :class="{ unavailable: !row.available }"
        >
          <div class="unit-info">
            <div class="unit-name">{{ row.definition.type }}</div>
            <div class="unit-stats">
              Atk {{ row.definition.attack }} · Def {{ row.definition.defense }}
              <span v-if="row.needsCoastReason"> · requires a coastal settlement</span>
              <span v-else-if="!row.available"> · requires longhouse {{ row.definition.requiredLonghouseLevel }}<template v-if="row.definition.requiredUnitType"> and {{ row.definition.requiredUnitType }}</template></span>
            </div>
            <div class="unit-cost" :class="{ unaffordable: row.available && !row.affordable }">
              {{ row.costText }} · {{ row.durationText }}
            </div>
          </div>
          <div class="unit-action">
            <input
              type="number"
              min="1"
              class="qty"
              :disabled="!row.available"
              :value="row.count"
              @input="setQuantity(row.definition.type, ($event.target as HTMLInputElement).value)"
            />
            <button
              class="primary"
              :disabled="!row.trainable || training === row.definition.type"
              @click="train(row.definition.type, row.count)"
            >
              {{ training === row.definition.type ? 'Training…' : 'Train' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: rgba(6, 12, 17, 0.86);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  width: 560px;
  max-width: 94vw;
  max-height: 84vh;
  overflow-y: auto;
  padding: 22px 26px;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.name {
  font-size: 24px;
  font-weight: 700;
  color: var(--text);
}
.sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--muted);
}
.close {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 7px;
  color: var(--muted);
  cursor: pointer;
}
.close:hover {
  color: var(--text);
  border-color: var(--gold);
}
.desc {
  margin: 16px 0 0;
  font-size: 13px;
  line-height: 1.5;
}
.demo-note {
  color: var(--muted);
}
.error-note {
  color: #e08a8a;
}
.roster {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.unit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  border-top: 1px solid var(--panel-border);
}
.unit-row.unavailable {
  opacity: 0.55;
}
.unit-info {
  flex: 1;
  min-width: 0;
}
.unit-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  text-transform: capitalize;
}
.unit-stats {
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted);
}
.unit-cost {
  margin-top: 2px;
  font-size: 12px;
  color: var(--gold);
}
.unit-cost.unaffordable {
  color: #e08a8a;
}
.unit-action {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.qty {
  width: 52px;
  padding: 6px 6px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  text-align: center;
}
.primary {
  padding: 8px 14px;
  background: var(--gold);
  border: none;
  border-radius: 8px;
  color: #20160a;
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.03em;
  cursor: pointer;
  white-space: nowrap;
}
.primary:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
