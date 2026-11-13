<script setup lang="ts">
// A building's training window, opened from the building's ring ('train'
// action) the same way BuildingModal is: training belongs to a building (it
// trains one order at a time, the rest wait behind it), so this lists only the
// units that building type trains. Several unit types can be picked per visit
// (quantity stepper per row); one button places one order per picked type and
// the window stays open. It also shows this building's own queue (with cancel)
// and its unlock ladder, and names exactly what a locked unit still misses.
// With several buildings of the type the order can also be distributed over all of them.
import { usePhoneLayer, vPhoneHidden } from '../../composables/usePhoneLayer';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { buildingName, shipGroupName, unitName } from '../../i18n/catalogueNames';
import { groupByShipGroup } from '../../lib/units/shipGroups';
import { apiErrorMessage } from '../../i18n/apiErrors';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { useAuthStore } from '../../stores/auth';
import { useTrainingOrders } from '../../composables/useQueueOrders';
import { DEMO_MODE } from '../../config';
import {
  MAX_TRAINING_ORDERS_PER_BUILDING,
  canAfford,
  distributedTrainingSeconds,
  formatTrainingDuration,
  maxAffordableCount,
  subtractCost,
  totalTrainingCost,
  trainingBonusPercent,
  trainingBuildingsOfType,
  trainingCancelRefund,
  unitRequirements,
  unitTrainingSeconds,
  unlockLadder,
  type TrainingSplit,
  type UnitRequirement,
} from '../../lib/units/trainingEconomy';
import ResourceCost from '../ResourceCost.vue';
import type { ResourceLine, UnitDefinitionResponse } from '../../api/types';
import { hasShorelineInTerritory } from '../../lib/map/shoreline';

/** The building whose window this is: its type picks the units, its hex is where the order goes. */
const props = defineProps<{ building: { type: string; q: number; r: number; level: number } }>();
const emit = defineEmits<{ close: [] }>();

// A layer on the phone stack: shows alone while mounted, hides under a layer opened above it.
const layer = usePhoneLayer();

const world = useWorldStore();
const auth = useAuthStore();
const catalogue = useUnitCatalogueStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

onMounted(() => {
  void catalogue.load();
});

// One quantity per unit type, 0 until picked — keyed by wire type name so it survives the catalogue's own array ordering.
const quantities = ref<Record<string, number>>({});
function quantityFor(type: string): number {
  return quantities.value[type] ?? 0;
}
function setQuantity(type: string, value: number) {
  const n = Math.floor(value);
  quantities.value[type] = Number.isFinite(n) && n > 0 ? n : 0;
}
function onQuantityInput(type: string, event: Event) {
  setQuantity(type, Number((event.target as HTMLInputElement).value));
}

const longhouseLevel = computed(() => world.hud.level);

// The window stays open while buildings finish: read the open building's level live, the prop is only the level it opened with.
const openLevel = computed(
  () => world.hud.buildings.find((b) => b.q === props.building.q && b.r === props.building.r)?.level ?? props.building.level,
);

// The settlement's functioning buildings of this type (standing, inside the realm) — what "Distribute" spreads an order over.
const siblings = computed(() => trainingBuildingsOfType(world.hud.buildings, props.building.type));
// With only one such building there is nothing to choose, so no selector is shown.
const canDistribute = computed(() => siblings.value.length > 1);
const mode = ref<'here' | 'distribute'>('here');
const distributeSplit = ref<'evenly' | 'fastest'>('evenly');
const split = computed<TrainingSplit>(() => (canDistribute.value && mode.value === 'distribute' ? distributeSplit.value : 'here'));
// Fastest splits by time — premium only; shown locked for everyone else (docs/design/premium-gating-ux.md).
const fastestLocked = computed(() => !auth.isPremium);

// This building's own part of the training queue, in the shared row format the HUD panels use.
const allOrders = useTrainingOrders();
const hereOrders = computed(() =>
  allOrders.value.filter((o) => o.coord.q === props.building.q && o.coord.r === props.building.r),
);
const ordersHere = computed(() => hereOrders.value.length);
const slotsFreeHere = computed(() => Math.max(0, MAX_TRAINING_ORDERS_PER_BUILDING - ordersHere.value));
// Orders waiting in the building on a hex, from the live queue.
function ordersAt(b: { q: number; r: number }): number {
  return world.hud.trainingQueue.filter((o) => o.q === b.q && o.r === b.r).length;
}
// The siblings a unit's distributed order can go to: only buildings that have the unit's building level.
function siblingsFor(definition: UnitDefinitionResponse) {
  return siblings.value.filter((b) => b.level >= definition.requiredBuildingLevel);
}
// "This building" needs room here; a distributed order needs room in at least one building that has the unit's level.
function freeSlotsFor(definition: UnitDefinitionResponse): number {
  if (split.value === 'here') return slotsFreeHere.value;
  return Math.max(0, ...siblingsFor(definition).map((b) => MAX_TRAINING_ORDERS_PER_BUILDING - ordersAt(b)));
}

// Issue #40 phase 6 §4: whether this settlement's own claimed territory touches the sea — Ship-class units need it, mirroring
// `Settlement.PlanTrain`'s `hasShoreline` gate (`TrainRejection.SettlementNotCoastal`). Computed client-side from the same
// deterministic terrain the map already renders (see `lib/map/shoreline.ts`), over the settlement's *full* claimed territory
// (centre disc plus tower discs, giant-aware like `WorldModel`'s territory painting). `null` (no settlement selected yet, e.g.
// demo mode's landing page) reads as "unknown" — treated as coastal so a ship row isn't wrongly locked before there is anything to check.
const isCoastal = computed<boolean | null>(() => {
  const settlement = world.selectedSettlementId ? world.model.getSettlement(world.selectedSettlementId) : undefined;
  if (!settlement) return null;
  // `model` is markRaw, so the buildings and level are read here only to re-run this when a poll changes them.
  void world.hud.buildings;
  void longhouseLevel.value;
  const discs = world.model.claimDiscsOf(settlement.id);
  return hasShorelineInTerritory(discs, world.model, (c) => world.model.giantAnchorAt(c));
});

// The level of the settlement's best functioning building of a type: only for prerequisite units, which unlock settlement-wide.
// The unit's own building level is the opened building's (`openLevel`), as `Settlement.PlanTrain` checks it for "This building"; a distributed order goes to the siblings that have the level.
function bestBuildingLevelOf(buildingType: string): number {
  return Math.max(0, ...trainingBuildingsOfType(world.hud.buildings, buildingType).map((b) => b.level));
}

// What is left to spend after the other rows' picks, so Max on one row doesn't promise what another pick already claims.
function stockWithout(type: string) {
  let stock = { ...world.hud.available };
  for (const d of catalogue.definitions) {
    if (d.requiredBuildingType !== props.building.type || d.type === type) continue;
    stock = subtractCost(stock, totalTrainingCost(d, quantityFor(d.type)));
  }
  return stock;
}

const rows = computed(() =>
  catalogue.definitions.filter((d) => d.requiredBuildingType === props.building.type).map((definition) => {
    const count = quantityFor(definition.type);
    const missing = unitRequirements(definition.type, {
      longhouseLevel: longhouseLevel.value,
      byType: catalogue.byType,
      // A distributed order goes to the siblings that have the level, so the best one counts; "This building" needs the open one's.
      orderingLevel: split.value === 'here' ? openLevel.value : bestBuildingLevelOf(props.building.type),
      bestBuildingLevelOf,
      coastal: isCoastal.value,
    });
    const locked = missing.length > 0;
    // Issue #158: available (stock minus what the waiting build queue has reserved), not raw stock. `hud.available` mirrors
    // `hud.resources` in demo mode (no reservation concept there).
    const max = locked ? 0 : maxAffordableCount(definition, stockWithout(definition.type));
    const unitCost = totalTrainingCost(definition, 1);
    return {
      definition,
      count,
      missing,
      locked,
      max,
      cost: totalTrainingCost(definition, count),
      unitCost,
      durationText: formatTrainingDuration(
        split.value === 'here'
          ? unitTrainingSeconds(definition, openLevel.value, world.worldSpeedFactor)
          : distributedTrainingSeconds(
              definition,
              Math.max(1, count),
              siblingsFor(definition).map((b) => b.level),
              split.value,
              world.worldSpeedFactor,
            ),
        1,
      ),
    };
  }),
);

function chipText(req: UnitRequirement): string {
  switch (req.kind) {
    case 'buildingLevel':
      return t('hud.trainingModal.needBuildingLevel', {
        building: buildingName(req.building),
        required: req.required,
        current: req.current,
      });
    case 'longhouse':
      return t('hud.trainingModal.needLonghouse', { required: req.required, current: req.current });
    case 'unit':
      return t('hud.trainingModal.needUnit', { unit: unitName(req.unit) });
    case 'coast':
      return t('hud.trainingModal.needCoast');
  }
}

// Ships are listed under a white heading per job (Scouts, Cargo, ...); land units form one block without a heading.
const rowGroups = computed(() => groupByShipGroup(rows.value, (row) => row.definition.type));

const picks = computed(() => rows.value.filter((r) => !r.locked && r.count > 0));
const pickedCost = computed(() =>
  picks.value.reduce(
    (sum, r) => ({
      wood: sum.wood + r.cost.wood,
      stone: sum.stone + r.cost.stone,
      food: sum.food + r.cost.food,
      iron: sum.iron + r.cost.iron,
    }),
    { wood: 0, stone: 0, food: 0, iron: 0 },
  ),
);
// The orders that fit: the scarcest of the picked rows (each type becomes one order), or the roomiest row when none is picked.
const freeSlots = computed(() =>
  picks.value.length
    ? Math.min(...picks.value.map((r) => freeSlotsFor(r.definition)))
    : Math.max(0, ...rows.value.filter((r) => !r.locked).map((r) => freeSlotsFor(r.definition))),
);
const tooManyOrders = computed(() => picks.value.length > freeSlots.value);
// How many buildings "Distribute" spreads over: those that have the level of every picked unit, else of any unlocked one.
const distributeCount = computed(() =>
  picks.value.length
    ? Math.min(...picks.value.map((r) => siblingsFor(r.definition).length))
    : Math.max(0, ...rows.value.filter((r) => !r.locked).map((r) => siblingsFor(r.definition).length)),
);
const affordable = computed(() => canAfford(pickedCost.value, world.hud.available));
// Which picked resources the stock can't cover: shown red in the footer total, like the ring card's cost.
const shortKeys = computed(() => ({
  wood: pickedCost.value.wood > world.hud.available.wood,
  stone: pickedCost.value.stone > world.hud.available.stone,
  food: pickedCost.value.food > world.hud.available.food,
  iron: pickedCost.value.iron > world.hud.available.iron,
}));
const training = ref(false);
const errorText = ref<string | null>(null);
// Training only works against the live backend; demo mode has no TrainingOrder/garrison concept in the local WorldModel yet.
const canTrain = computed(
  () => picks.value.length > 0 && !tooManyOrders.value && affordable.value && !DEMO_MODE && !training.value,
);

// The unlock ladder of this building: the levels that open units, the ones reached marked.
const ladder = computed(() => {
  const stops = unlockLadder(catalogue.definitions, props.building.type);
  const reached = stops.filter((s) => openLevel.value >= s.level);
  const current = reached.length ? reached[reached.length - 1]!.level : null;
  return stops.map((s) => ({ ...s, reached: openLevel.value >= s.level, current: s.level === current }));
});

// Issue #158: a note when something is actually reserved, so a training rejection that's really "some of that is spoken for"
// reads as expected rather than a mystery insufficient-resources error.
const reservedTotal = computed(() => {
  const r = world.hud.reserved;
  return r.wood + r.stone + r.food + r.iron;
});

/** One order per picked type; the window stays open and the picks reset once they are placed. */
async function trainPicked() {
  errorText.value = null;
  training.value = true;
  try {
    for (const row of [...picks.value]) {
      await world.trainUnitsLive(row.definition.type, row.count, props.building, split.value);
      quantities.value[row.definition.type] = 0;
    }
  } catch (err) {
    errorText.value = apiErrorMessage(err, t('hud.trainingModal.trainingFailed'));
  } finally {
    training.value = false;
  }
}

// Cancelling asks inline in the order's own row: what comes back, what stays.
const cancelAsk = ref<string | null>(null);
const cancelBusy = ref(false);
const cancelRows = computed(() => {
  const map = new Map<string, { refund: ResourceLine | null; kept: number }>();
  for (const o of hereOrders.value) {
    const def = catalogue.byType[o.unit];
    const done = o.waiting ? 0 : o.completedCount;
    const refund = def ? trainingCancelRefund(def, o.count - done) : null;
    map.set(o.key, { refund: refund && Object.values(refund).some((v) => v > 0) ? refund : null, kept: done });
  }
  return map;
});
async function cancelOrder(id: string) {
  errorText.value = null;
  cancelBusy.value = true;
  try {
    await world.cancelTrainingLive(id);
    cancelAsk.value = null;
  } catch (err) {
    errorText.value = apiErrorMessage(err, t('hud.trainingModal.cancelFailed'));
  } finally {
    cancelBusy.value = false;
  }
}
</script>

<template>
  <div v-phone-hidden="layer.hidden.value" class="backdrop" @click.self="emit('close')">
    <div class="modal panel">
      <div class="body">
        <div class="head">
          <div>
            <div class="name">{{ buildingName(building.type) }}</div>
            <div class="sub">
              {{ t('hud.trainingModal.subtitle', { level: openLevel, percent: trainingBonusPercent(openLevel) }) }}
            </div>
          </div>
          <button class="close" @click="emit('close')">{{ t('hud.trainingModal.close') }}</button>
        </div>

        <p v-if="DEMO_MODE" class="desc demo-note">
          {{ t('hud.trainingModal.demoNote') }}
        </p>
        <p v-if="errorText" class="desc error-note">{{ errorText }}</p>
        <p v-if="reservedTotal > 0" class="desc reserved-note">
          {{ t('hud.trainingModal.reservedNote', { amount: reservedTotal.toFixed(0) }) }}
        </p>

        <section class="block queue" data-testid="training-here">
          <div class="block-head">
            <span class="block-title">{{ t('hud.trainingModal.queueTitle') }}</span>
            <span class="pips" :class="{ full: ordersHere >= MAX_TRAINING_ORDERS_PER_BUILDING }">
              <i
                v-for="n in MAX_TRAINING_ORDERS_PER_BUILDING"
                :key="n"
                class="pip"
                :class="{ on: n <= ordersHere }"
                aria-hidden="true"
              />
              <span>{{ t('hud.trainingModal.queueSlots', { used: ordersHere, max: MAX_TRAINING_ORDERS_PER_BUILDING }) }}</span>
            </span>
          </div>
          <div v-if="!hereOrders.length" class="queue-empty">{{ t('hud.trainingModal.queueEmpty') }}</div>
          <div
            v-for="o in hereOrders"
            :key="o.key"
            class="qrow"
            :class="{ running: !o.waiting, confirm: cancelAsk === o.key }"
          >
            <div class="q-main">
              <div class="q-top">
                <span class="q-name">{{ o.name }}</span>
                <span class="q-time">{{ o.remaining }}</span>
              </div>
              <div v-if="!o.waiting" class="bar">
                <i :class="{ done: o.done }" :style="{ width: `${Math.round(o.progress * 100)}%` }" />
              </div>
              <div v-if="!o.waiting" class="q-sub">{{ o.subtext }}</div>
            </div>
            <button
              v-if="cancelAsk !== o.key"
              type="button"
              class="qx"
              :aria-label="t('hud.trainingModal.cancelOrder')"
              :title="t('hud.trainingModal.cancelOrder')"
              @click="cancelAsk = o.key"
            >
              ✕
            </button>
            <div v-else class="cbox">
              <div class="ct">
                {{ t('hud.trainingModal.cancelAsk', { count: o.count, unit: unitName(o.unit) }) }}
                <i18n-t v-if="cancelRows.get(o.key)?.refund" keypath="hud.trainingModal.cancelRefund" tag="em" scope="global">
                  <template #amount><ResourceCost :cost="cancelRows.get(o.key)!.refund!" :size="12" /></template>
                </i18n-t>
                <em v-else>{{ t('hud.trainingModal.cancelNothing') }}</em>
                <em v-if="cancelRows.get(o.key)?.kept">
                  {{ t('hud.trainingModal.cancelKept', { count: cancelRows.get(o.key)!.kept }) }}
                </em>
              </div>
              <button type="button" class="ghost" :disabled="cancelBusy" @click="cancelAsk = null">
                {{ t('hud.trainingModal.cancelKeep') }}
              </button>
              <button type="button" class="danger" :disabled="cancelBusy" @click="cancelOrder(o.key)">
                {{ t('hud.trainingModal.cancelConfirm') }}
              </button>
            </div>
          </div>
        </section>

        <section class="block ladder" data-testid="unlock-ladder">
          <div class="block-head">
            <span class="block-title">{{ t('hud.trainingModal.ladderTitle') }}</span>
          </div>
          <ol class="stops">
            <li v-for="stop in ladder" :key="stop.level" class="stop" :class="{ reached: stop.reached }">
              <span class="stop-level">
                {{ t('hud.trainingModal.ladderLevel', { level: stop.level }) }}
                <b v-if="stop.current" class="now">{{ t('hud.trainingModal.ladderNow') }}</b>
              </span>
              <span class="stop-units">{{ stop.units.map((u) => unitName(u)).join(', ') }}</span>
            </li>
          </ol>
        </section>

        <div v-if="canDistribute" class="selectors">
          <div class="selector" role="group" :aria-label="t('hud.trainingModal.trainIn')">
            <span class="selector-label">{{ t('hud.trainingModal.trainIn') }}</span>
            <button
              type="button"
              class="seg"
              :class="{ active: mode === 'here' }"
              :aria-pressed="mode === 'here'"
              @click="mode = 'here'"
            >
              {{ t('hud.trainingModal.thisBuilding') }}
            </button>
            <button
              type="button"
              class="seg"
              :class="{ active: mode === 'distribute' }"
              :aria-pressed="mode === 'distribute'"
              @click="mode = 'distribute'"
            >
              {{ t('hud.trainingModal.distribute', { count: distributeCount }) }}
            </button>
          </div>
          <div v-if="mode === 'distribute'" class="selector" role="group" :aria-label="t('hud.trainingModal.splitLabel')">
            <span class="selector-label">{{ t('hud.trainingModal.splitLabel') }}</span>
            <button
              type="button"
              class="seg"
              :class="{ active: distributeSplit === 'evenly' }"
              :aria-pressed="distributeSplit === 'evenly'"
              @click="distributeSplit = 'evenly'"
            >
              {{ t('hud.trainingModal.evenly') }}
            </button>
            <button
              type="button"
              class="seg fastest"
              :class="{ active: distributeSplit === 'fastest' }"
              :aria-pressed="distributeSplit === 'fastest'"
              :disabled="fastestLocked"
              @click="distributeSplit = 'fastest'"
            >
              <span v-if="fastestLocked" aria-hidden="true">🔒 </span>{{ t('hud.trainingModal.fastest') }}
            </button>
          </div>
          <i18n-t
            v-if="mode === 'distribute' && fastestLocked"
            keypath="hud.trainingModal.fastestPremium"
            tag="p"
            class="desc premium-note"
          >
            <template #premium><strong>{{ t('hud.trainingModal.premium') }}</strong></template>
          </i18n-t>
        </div>
        <p v-if="split === 'here' && slotsFreeHere === 0" class="desc error-note">
          {{ t('hud.trainingModal.full', { used: ordersHere, max: MAX_TRAINING_ORDERS_PER_BUILDING }) }}
        </p>

        <div class="roster">
          <template v-for="block in rowGroups" :key="block.group ?? 'units'">
          <h3 v-if="block.group" class="group-heading" :data-group="block.group">{{ shipGroupName(block.group) }}</h3>
          <div
            v-for="row in block.rows"
            :key="row.definition.type"
            class="unit-row"
            :class="{ locked: row.locked }"
          >
            <div class="unit-info">
              <div class="unit-name">{{ unitName(row.definition.type) }}</div>
              <div class="unit-stats">
                {{ t('hud.trainingModal.attackDefense', { attack: row.definition.attack, defense: row.definition.defense }) }}
              </div>
              <div class="unit-cost">
                <ResourceCost :cost="row.unitCost" :size="13" />
                <span class="unit-time">{{ row.durationText }}</span>
              </div>
              <div v-if="row.locked" class="need" data-testid="missing">
                <span class="need-label">{{ t('hud.trainingModal.needs') }}</span>
                <span v-for="(req, i) in row.missing" :key="i" class="chip miss">{{ chipText(req) }}</span>
              </div>
            </div>
            <div v-if="!row.locked" class="unit-action">
              <div class="step" role="group" :aria-label="t('hud.trainingModal.quantity', { unit: unitName(row.definition.type) })">
                <button
                  type="button"
                  class="step-btn"
                  :aria-label="t('hud.trainingModal.fewer')"
                  :disabled="row.count <= 0"
                  @click="setQuantity(row.definition.type, row.count - 1)"
                >
                  {{ t('hud.trainingModal.minus') }}
                </button>
                <input
                  type="number"
                  min="0"
                  class="qty"
                  :value="row.count"
                  @input="onQuantityInput(row.definition.type, $event)"
                />
                <button
                  type="button"
                  class="step-btn"
                  :aria-label="t('hud.trainingModal.more')"
                  :disabled="row.count >= row.max"
                  @click="setQuantity(row.definition.type, row.count + 1)"
                >
                  {{ t('hud.trainingModal.plus') }}
                </button>
              </div>
              <button
                type="button"
                class="max"
                :disabled="row.max <= 0"
                @click="setQuantity(row.definition.type, row.max)"
              >
                {{ t('hud.trainingModal.max') }}
              </button>
            </div>
          </div>
          </template>
        </div>
      </div>

      <div class="foot">
        <div class="sum">
          <template v-if="picks.length">
            <b>{{ t('hud.trainingModal.footerOrders', { count: picks.length, free: freeSlots, max: MAX_TRAINING_ORDERS_PER_BUILDING }, picks.length) }}</b>
            <ResourceCost :cost="pickedCost" :size="14" :short="shortKeys" />
            <span v-if="tooManyOrders" class="foot-warn">{{ t('hud.trainingModal.tooManyOrders', { count: picks.length }) }}</span>
            <span v-else-if="!affordable" class="foot-warn">{{ t('hud.trainingModal.cantAfford') }}</span>
          </template>
          <b v-else class="muted">{{ t('hud.trainingModal.pickUnits') }}</b>
        </div>
        <button type="button" class="primary" :disabled="!canTrain" @click="trainPicked">
          {{ training ? t('hud.trainingModal.training') : t('hud.trainingModal.trainOrders', { count: picks.length }, picks.length) }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: absolute;
  inset: 0;
  z-index: 40;
  background: var(--layer-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
}
/* The window scrolls in `.body`; the footer with the Train button stays put. */
.modal {
  width: 600px;
  max-width: 94vw;
  max-height: 84vh;
  max-height: 84dvh;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px 26px 14px;
}
/* Mobile-readiness audit: fit 320px without horizontal overflow — tighter padding, and unit rows wrap their info/action halves
   instead of squeezing the stepper against the row's text. */
@media (max-width: 768px), (max-height: 500px) {
  .modal {
    max-width: 100vw;
  }
  .body {
    padding: 16px 16px 10px;
  }
  .unit-row {
    flex-wrap: wrap;
  }
  .unit-action {
    width: 100%;
    justify-content: flex-end;
  }
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
.reserved-note {
  color: var(--muted);
  font-size: 12px;
}
.block {
  margin-top: 16px;
}
.block-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.block-title {
  font-size: 13px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
}
.pips {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.pip {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  border: 1px solid var(--panel-border);
}
.pip.on {
  background: var(--gold);
  border-color: var(--gold);
}
.pips.full .pip.on {
  background: #e08a8a;
  border-color: #e08a8a;
}
.pips span {
  margin-left: 4px;
}
.queue {
  border: 1px solid var(--panel-border);
  border-radius: 9px;
  padding: 8px 12px;
}
.queue-empty {
  font-size: 13px;
  color: var(--muted);
  padding: 4px 0;
}
.qrow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 0;
  border-top: 1px solid var(--panel-border);
  font-size: 13px;
}
.block-head + .qrow {
  border-top: 0;
}
.qrow:not(.running) {
  opacity: 0.75;
}
.qrow.confirm {
  opacity: 1;
}
.q-main {
  flex: 1;
  min-width: 0;
}
.q-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.q-name {
  font-weight: 600;
  color: var(--text);
}
.q-time {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.qrow.running .q-time {
  color: var(--gold);
}
.q-sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--muted);
}
.bar {
  height: 4px;
  margin-top: 5px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  background: var(--gold);
}
.qx {
  flex: none;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.qx:hover {
  color: #e08a8a;
  border-color: rgba(224, 138, 138, 0.6);
}
.cbox {
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
}
.cbox .ct {
  flex: 1 1 200px;
  min-width: 0;
  color: var(--text);
}
.cbox .ct em {
  display: block;
  font-style: normal;
  color: var(--muted);
  font-size: 12px;
}
.ghost,
.danger {
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.ghost {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
}
.danger {
  background: #c4605a;
  border: none;
  color: #1a0b0a;
  font-weight: 700;
}
.ghost:disabled,
.danger:disabled {
  opacity: 0.5;
  cursor: default;
}
.stops {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
}
.stop {
  display: flex;
  flex-direction: column;
  font-size: 12px;
  color: var(--muted);
}
.stop.reached {
  color: var(--text);
}
.stop-level {
  color: inherit;
}
.stop.reached .stop-level {
  color: var(--gold);
}
.now {
  margin-left: 4px;
  font-weight: 500;
  font-size: 11px;
  color: var(--gold);
  border: 1px solid rgba(255, 197, 92, 0.5);
  border-radius: 4px;
  padding: 0 4px;
}
.selectors {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.selector {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.selector-label {
  flex: none;
  min-width: 64px;
  font-size: 12px;
  color: var(--muted);
}
.seg {
  padding: 6px 10px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 7px;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.seg.active {
  border-color: var(--gold);
  color: var(--gold);
}
.seg:disabled {
  opacity: 0.55;
  cursor: default;
}
.premium-note {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.roster {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
}
.unit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  border-top: 1px solid var(--panel-border);
}
.group-heading {
  margin: 6px 0 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #fff;
}
.unit-row.locked .unit-name {
  color: var(--muted);
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 10px;
  margin-top: 3px;
  font-size: 12px;
}
.unit-time {
  color: var(--muted);
}
.need {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  margin-top: 5px;
}
.need-label {
  font-size: 11.5px;
  color: var(--muted);
}
.chip {
  font-size: 11.5px;
  border-radius: 5px;
  padding: 1px 7px;
  border: 1px solid var(--panel-border);
  white-space: nowrap;
}
.chip.miss {
  border-color: rgba(224, 138, 138, 0.6);
  color: #e08a8a;
}
.unit-action {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.step {
  display: inline-flex;
  align-items: center;
  height: 34px;
  border: 1px solid var(--panel-border);
  border-radius: 7px;
  overflow: hidden;
}
.step-btn {
  width: 34px;
  height: 100%;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 16px;
  cursor: pointer;
}
.step-btn:disabled {
  color: var(--muted);
  opacity: 0.5;
  cursor: default;
}
.qty {
  width: 48px;
  height: 100%;
  padding: 0 4px;
  background: transparent;
  border: none;
  border-left: 1px solid var(--panel-border);
  border-right: 1px solid var(--panel-border);
  color: var(--text);
  font: inherit;
  text-align: center;
  -moz-appearance: textfield;
  appearance: textfield;
}
.qty::-webkit-outer-spin-button,
.qty::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.max {
  height: 34px;
  padding: 0 10px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 7px;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.max:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--gold);
}
.max:disabled {
  opacity: 0.5;
  cursor: default;
}
.foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 26px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--panel-border);
  background: rgba(0, 0, 0, 0.18);
}
@media (max-width: 768px), (max-height: 500px) {
  .foot {
    padding-left: 16px;
    padding-right: 16px;
    flex-wrap: wrap;
  }
  .foot .primary {
    width: 100%;
  }
}
.sum {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  font-size: 12.5px;
}
.sum b {
  font-size: 13.5px;
  color: var(--text);
}
.sum b.muted {
  color: var(--muted);
  font-weight: 500;
}
.sum .foot-warn {
  color: #e08a8a;
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
