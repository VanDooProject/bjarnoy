<script setup lang="ts">
// Issue #40 phase 2: dispatching an army (move mission only) and tracking
// armies already on the road. Deliberately separate from
// TrainingQueuePanel.vue's garrison list: that panel shows "who's standing
// at home" (Settlement.Garrison — never an Army record, see stores/world.ts's
// `armies` comment), this one is specifically about dispatched bodies
// (in transit / returning / supporting) plus the flow for creating a new one.
//
// Bottom-right HUD corner: BuildQueuePanel is top-left, TrainingQueuePanel
// top-right, RealmPanel bottom-left (see each panel's own `position:
// absolute` in their <style>) — this is the one open corner.
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useAuthStore } from '../../stores/auth';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { DEMO_MODE } from '../../config';
import type { MessageSchema } from '../../i18n/schema';
import { missionName, unitName } from '../../i18n/catalogueNames';
import {
  armyStatusLabel,
  canFieldOrderArmy,
  classifyUnitSelection,
  formatEta,
  hasCatapultSelected,
  isFieldOrderMidMarch,
  isUnitSelectableFor,
  maxAffordableProvisions,
} from '../../lib/units/armyDispatch';
import { buildingLabel } from '../../lib/units/battleReports';

const world = useWorldStore();
const auth = useAuthStore();
const catalogue = useUnitCatalogueStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

onMounted(() => {
  void catalogue.load();
});

const draft = computed(() => world.dispatchDraft);

// Only garrison units can be sent — the wire-name -> count map the quantity
// inputs below read/write against, filtered to what's actually standing here.
const garrisonRows = computed(() =>
  world.hud.garrison
    .filter((g) => g.count > 0)
    .map((g) => ({ unit: g.unit, label: unitName(g.unit), available: g.count })),
);

// Issue #40 phase 6 §1: which class family the current selection has
// committed to (if any) — drives greying out the other class's rows below,
// so the player can't build a `MixedFleetAndLandUnits`-rejected request in
// the first place. See `classifyUnitSelection`'s own comment for why
// `'mixed'` is handled defensively rather than assumed unreachable.
const selectionKind = computed(() => classifyUnitSelection(draft.value?.unitCounts ?? {}, catalogue.byType));
function isRowSelectable(unit: string): boolean {
  return isUnitSelectableFor(unit, selectionKind.value, catalogue.byType);
}
// Whether the garrison actually holds units of the class the current
// selection has locked out — only worth telling the player "ships and land
// units can't mix" when there's something of the other class sitting right
// there, greyed out, for them to wonder about.
const hasLockedOutUnits = computed(() =>
  selectionKind.value !== 'none' && selectionKind.value !== 'mixed'
    ? garrisonRows.value.some((row) => !isRowSelectable(row.unit))
    : false,
);

function quantityFor(unit: string): number {
  return draft.value?.unitCounts[unit] ?? 0;
}
function setQuantity(unit: string, value: string, max: number) {
  const n = Math.floor(Number(value));
  const clamped = Number.isFinite(n) ? Math.max(0, Math.min(n, max)) : 0;
  world.setDispatchUnitCount(unit, clamped);
  // Re-propose a default provisions amount whenever the selection changes,
  // rather than leaving whatever was typed before a unit count changed the
  // carry capacity out from under it — the player can still edit it after.
  if (draft.value) {
    // Issue #158: provisions come out of `available`, not raw stock — food
    // reserved for the waiting build queue is not free to load onto an army.
    world.setDispatchProvisions(
      maxAffordableProvisions(draft.value.unitCounts, catalogue.byType, world.hud.available.food),
    );
  }
}

const routeLength = computed(() => draft.value?.route.length ?? 0);
// Issue #93: the plotted route as an editable list. "Undo waypoint" can only
// ever pop the newest one, so a mis-clicked hex in the middle of a route
// previously meant clearing everything after it and re-plotting; this (plus
// dragging the pin on the map itself) makes any waypoint editable in place.
const routeRows = computed(() =>
  (draft.value?.route ?? []).map((c, i) => ({
    index: i,
    label: `${i + 1}. (${c.q}, ${c.r})`,
    isDestination: draft.value?.mission === 'move' && i === (draft.value?.route.length ?? 0) - 1,
  })),
);
const hasUnitsSelected = computed(() =>
  !!draft.value && Object.values(draft.value.unitCounts).some((c) => c > 0),
);
// A move dispatch needs a plotted route (the last click is the destination);
// an attack/support dispatch needs a target settlement instead — a route is
// optional waypoints along the way (see buildAttackDispatchRequest's own
// comment; buildSupportDispatchRequest mirrors it exactly).
const hasDestination = computed(() =>
  draft.value?.mission === 'attack' || draft.value?.mission === 'support'
    ? !!draft.value.targetSettlementId
    : routeLength.value > 0,
);
const canConfirm = computed(
  () => hasUnitsSelected.value && hasDestination.value && !draft.value?.submitting,
);

function beginDispatch() {
  world.startDispatch();
}

function setMission(mission: 'move' | 'attack' | 'support') {
  world.setDispatchMission(mission);
}

// Target-settlement picker for an Attack/Support dispatch: a searchable list
// rather than a world-map click — see the PR notes for why (WorldMapCanvas's
// hex-click only carries a coordinate, not a settlement id, and teaching the
// renderer a "pick a settlement" selection mode would be a bigger change
// than reusing the settlement list `refreshWorldSettlements` already
// maintains client-side). Support needs a target settlement just like Attack
// does (issue #40 phase 4) — same list, same search box.
const targetSearch = ref('');
const attackTargets = computed(() => {
  const all = world.listAttackableSettlements();
  const query = targetSearch.value.trim().toLowerCase();
  const filtered = query
    ? all.filter(
        (s) => s.name.toLowerCase().includes(query) || s.ownerName.toLowerCase().includes(query),
      )
    : all;
  return filtered.slice(0, 25);
});
const selectedTarget = computed(() =>
  draft.value?.targetSettlementId
    ? world.listAttackableSettlements().find((s) => s.id === draft.value?.targetSettlementId) ?? null
    : null,
);
function pickTarget(settlementId: string) {
  world.setDispatchTarget(settlementId);
}
function clearTarget() {
  world.setDispatchTarget(null);
}

// Catapult target-building picker (issue #40 phase 5): only worth showing
// once a target settlement is chosen *and* the selection actually includes a
// Catapult — a catapult-free attack does no siege damage regardless of what's
// requested (see `hasCatapultSelected`'s own comment), so there is nothing
// for a preference to apply to. `GET /api/v1/settlements/{id}` carries no
// ownership check (confirmed from SettlementEndpoints.cs — see the PR notes),
// so the enemy's real layout can be fetched and offered as specific hexes to
// pick from, rather than falling back to a mere building-type preference.
const showBuildingPicker = computed(
  () => draft.value?.mission === 'attack' && !!selectedTarget.value && hasCatapultSelected(draft.value.unitCounts),
);
const targetBuildingRows = computed(() => {
  if (!draft.value?.targetSettlementId) return [];
  if (world.dispatchTargetBuildingsFor !== draft.value.targetSettlementId) return [];
  return (world.dispatchTargetBuildings ?? []).map((b) => ({
    q: b.q,
    r: b.r,
    label: buildingLabel(b.type),
    level: b.level,
  }));
});
const selectedBuildingLabel = computed(() => {
  const coord = draft.value?.targetBuildingCoord;
  if (!coord) return null;
  const row = targetBuildingRows.value.find((b) => b.q === coord.q && b.r === coord.r);
  return row ? `${row.label} (${t('hud.armyPanel.buildingLevelCoord', { level: row.level, q: coord.q, r: coord.r })})` : `(${coord.q}, ${coord.r})`;
});
function pickBuildingTarget(q: number, r: number) {
  world.setDispatchTargetBuilding({ q, r });
}
function clearBuildingTarget() {
  world.setDispatchTargetBuilding(null);
}

async function confirm() {
  await world.confirmDispatch();
}

// Armies already dispatched — never AtHome persistently (see stores/world.ts).
// A Supporting army's row (issue #40 phase 4, "armies abroad") shows
// "Supporting <settlement name>" rather than the bare status, and still
// offers Recall — same button, same endpoint, just no active Movement to
// gate it on (see world.model.getSettlement for the name lookup).
const armyRows = computed(() => {
  void world.hud.tick; // reactive dependency so ETA countdowns tick every second
  const now = Date.now();
  return world.armies.map((army) => {
    const composition = army.stacks
      .filter((s) => s.count > 0)
      .map((s) => `${s.count}× ${unitName(s.unit)}`)
      .join(', ');
    const targetName = army.targetSettlementId
      ? world.model.getSettlement(army.targetSettlementId)?.name ?? null
      : null;
    const status = armyStatusLabel(army, army.supporting ? targetName : null);
    const eta = army.movement
      ? formatEta(army.movement.isReturning ? army.movement.returnArrivesAt : army.movement.arrivesAt, now)
      : null;
    const canRecall = !army.atHome && (army.supporting || (army.movement !== null && !army.movement.isReturning));
    // Issue #156 phase 1: "Move on" once standing, "Append goal" while still
    // travelling — Army.PlanFieldOrder's rule table has no free cell for the
    // latter (see isFieldOrderMidMarch's own doc comment), so a non-premium
    // account never gets past this button greyed-and-locked rather than
    // finding out only after a doomed request.
    const midMarch = isFieldOrderMidMarch(army, now);
    return {
      id: army.id,
      composition: composition || '—',
      status,
      eta,
      canRecall,
      canFieldOrder: canFieldOrderArmy(army),
      fieldOrderLocked: midMarch && !auth.isPremium,
      fieldOrderLabel: midMarch ? t('hud.armyPanel.appendGoal') : t('hud.armyPanel.moveOn'),
      selected: army.id === world.selectedArmyId,
      mission: army.mission !== 'move' ? missionName(army.mission) : null,
    };
  });
});

function toggleSelect(armyId: string) {
  if (world.selectedArmyId === armyId) {
    world.clearSelectedArmy();
  } else {
    world.selectArmy(armyId);
  }
}

const recallingId = ref<string | null>(null);
const recalling = computed(() => (id: string) => recallingId.value === id);
async function recall(armyId: string) {
  recallingId.value = armyId;
  try {
    await world.recallArmyLive(armyId);
  } finally {
    recallingId.value = null;
  }
}

// Issue #156 phase 1: field-order composing — a separate, lighter draft from
// the dispatch one above (no unit picker, just a plotted route against an
// already-existing armyId). See stores/world.ts's `fieldOrderDraft` comment
// for why this shares the same click-to-plot canvas rather than reusing
// `dispatchDraft` outright.
const fieldDraft = computed(() => world.fieldOrderDraft);
const fieldOrderRouteLength = computed(() => fieldDraft.value?.route.length ?? 0);
const fieldOrderRouteRows = computed(() =>
  (fieldDraft.value?.route ?? []).map((c, i) => ({
    index: i,
    label: `${i + 1}. (${c.q}, ${c.r})`,
    isDestination: i === (fieldDraft.value?.route.length ?? 0) - 1,
  })),
);
function beginFieldOrder(armyId: string) {
  world.startFieldOrder(armyId);
}
async function confirmFieldOrderClick() {
  await world.confirmFieldOrder();
}
</script>

<template>
  <div class="status-card army-panel">
    <div class="status-card-header">
      <span class="status-card-title">{{ t('hud.armyPanel.title') }}</span>
      <span class="status-card-count">{{ armyRows.length }}</span>
    </div>

    <p v-if="DEMO_MODE" class="status-subtext demo-note">
      {{ t('hud.armyPanel.demoNote') }}
    </p>

    <template v-if="!draft && !fieldDraft">
      <div v-if="armyRows.length" class="army-list">
        <div
          v-for="row in armyRows"
          :key="row.id"
          class="status-row army-row"
          :class="{ 'is-selected': row.selected }"
          @click="toggleSelect(row.id)"
        >
          <div class="status-row-top">
            <span class="status-row-name">{{ row.composition }}</span>
            <span class="status-row-time">{{ row.eta ?? '—' }}</span>
          </div>
          <div class="status-subtext">
            {{ row.status }}<span v-if="row.mission" class="mission-tag"> · {{ row.mission }}</span>
          </div>
          <div class="army-row-actions">
            <button
              v-if="row.canFieldOrder"
              class="secondary field-order"
              :disabled="row.fieldOrderLocked"
              :title="row.fieldOrderLocked ? t('hud.armyPanel.premiumRedirectTitle') : undefined"
              @click.stop="beginFieldOrder(row.id)"
            >
              <span v-if="row.fieldOrderLocked" aria-hidden="true">🔒</span> {{ row.fieldOrderLabel }}
            </button>
            <button
              v-if="row.canRecall"
              class="recall"
              :disabled="recalling(row.id)"
              @click.stop="recall(row.id)"
            >
              {{ recalling(row.id) ? t('hud.armyPanel.recalling') : t('hud.armyPanel.recall') }}
            </button>
          </div>
        </div>
      </div>
      <div v-else class="status-subtext garrison-empty">{{ t('hud.armyPanel.noArmies') }}</div>

      <button
        class="primary dispatch-btn"
        :disabled="DEMO_MODE || garrisonRows.length === 0"
        @click="beginDispatch"
      >
        {{ t('hud.armyPanel.dispatchArmy') }}
      </button>
    </template>

    <template v-else-if="fieldDraft">
      <div class="dispatch-form">
        <p v-if="fieldDraft.error" class="status-subtext error-note">{{ fieldDraft.error }}</p>
        <p class="status-subtext instructions">
          {{ t('hud.armyPanel.fieldOrderInstructions', {
            count: fieldOrderRouteLength,
            hexWord: fieldOrderRouteLength === 1 ? t('hud.armyPanel.hex') : t('hud.armyPanel.hexes'),
          }) }}
        </p>
        <p v-if="!auth.isPremium" class="status-subtext waypoint-hint">
          {{ t('hud.armyPanel.freeAccountWaypoints') }}
          <strong>{{ t('hud.armyPanel.premium') }}</strong> {{ t('hud.armyPanel.premiumWaypointsNeeded') }}
        </p>

        <div v-if="fieldOrderRouteRows.length" class="waypoint-list">
          <p class="status-subtext waypoint-hint">{{ t('hud.armyPanel.dragPinHint') }}</p>
          <div v-for="row in fieldOrderRouteRows" :key="row.index" class="waypoint-row">
            <span class="waypoint-label">
              {{ row.label }}<span v-if="row.isDestination" class="waypoint-tag"> · {{ t('hud.armyPanel.destinationTag') }}</span>
            </span>
            <button
              type="button"
              class="waypoint-remove"
              :aria-label="t('hud.armyPanel.removeWaypoint', { n: row.index + 1 })"
              @click="world.removeFieldOrderWaypoint(row.index)"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="dispatch-actions">
          <button
            class="secondary"
            @click="world.removeLastFieldOrderWaypoint()"
            :disabled="fieldOrderRouteLength === 0"
          >
            {{ t('hud.armyPanel.undoWaypoint') }}
          </button>
          <button
            class="secondary"
            @click="world.clearFieldOrderWaypoints()"
            :disabled="fieldOrderRouteLength === 0"
          >
            {{ t('hud.armyPanel.clearRoute') }}
          </button>
        </div>
        <div class="dispatch-actions">
          <button class="secondary" @click="world.cancelFieldOrder()">{{ t('hud.armyPanel.cancel') }}</button>
          <button
            class="primary"
            :disabled="fieldOrderRouteLength === 0 || fieldDraft.submitting"
            @click="confirmFieldOrderClick"
          >
            {{ fieldDraft.submitting ? t('hud.armyPanel.sending') : t('hud.armyPanel.confirmOrder') }}
          </button>
        </div>
      </div>
    </template>

    <template v-else-if="draft">
      <div class="dispatch-form">
        <p v-if="draft.error" class="status-subtext error-note">{{ draft.error }}</p>

        <div class="mission-tabs">
          <button
            type="button"
            class="mission-tab"
            :class="{ active: draft.mission === 'move' }"
            @click="setMission('move')"
          >
            {{ missionName('move') }}
          </button>
          <button
            type="button"
            class="mission-tab attack"
            :class="{ active: draft.mission === 'attack' }"
            @click="setMission('attack')"
          >
            {{ missionName('attack') }}
          </button>
          <button
            type="button"
            class="mission-tab support"
            :class="{ active: draft.mission === 'support' }"
            @click="setMission('support')"
          >
            {{ missionName('support') }}
          </button>
        </div>

        <p v-if="draft.mission === 'move'" class="status-subtext instructions">
          {{ t('hud.armyPanel.dispatchInstructions', {
            count: routeLength,
            hexWord: routeLength === 1 ? t('hud.armyPanel.hex') : t('hud.armyPanel.hexes'),
          }) }}
        </p>
        <template v-else>
          <p class="status-subtext instructions">
            {{ t('hud.armyPanel.targetInstructions', {
              mission: draft.mission,
              count: routeLength,
              waypointWord: routeLength === 1 ? t('hud.armyPanel.waypoint') : t('hud.armyPanel.waypoints'),
            }) }}
          </p>

          <div v-if="selectedTarget" class="target-selected">
            <span>{{ t('hud.armyPanel.target') }} <strong>{{ selectedTarget.name }}</strong> ({{ selectedTarget.ownerName }})</span>
            <button type="button" class="secondary change-target" @click="clearTarget">{{ t('hud.armyPanel.change') }}</button>
          </div>
          <div v-else class="target-picker">
            <input
              v-model="targetSearch"
              type="text"
              class="target-search"
              :placeholder="t('hud.armyPanel.searchSettlements', { mission: draft.mission })"
            />
            <div v-if="attackTargets.length" class="target-list">
              <button
                v-for="target in attackTargets"
                :key="target.id"
                type="button"
                class="target-row"
                @click="pickTarget(target.id)"
              >
                <span class="target-name">{{ target.name }}</span>
                <span class="target-owner">{{ target.ownerName }}</span>
              </button>
            </div>
            <p v-else class="status-subtext">{{ t('hud.armyPanel.noSettlementsFound') }}</p>
          </div>

          <p v-if="draft.mission === 'support'" class="status-subtext support-note">
            {{ t('hud.armyPanel.supportNote') }}
          </p>

          <div v-if="showBuildingPicker" class="building-picker">
            <p class="status-subtext building-picker-hint">
              {{ t('hud.armyPanel.buildingPickerHint') }}
            </p>
            <div v-if="selectedBuildingLabel" class="target-selected">
              <span>{{ t('hud.armyPanel.target') }} <strong>{{ selectedBuildingLabel }}</strong></span>
              <button type="button" class="secondary change-target" @click="clearBuildingTarget">{{ t('hud.armyPanel.clear') }}</button>
            </div>
            <template v-else>
              <p v-if="world.dispatchTargetBuildingsLoading" class="status-subtext">{{ t('hud.armyPanel.loadingEnemyLayout') }}</p>
              <p v-else-if="world.dispatchTargetBuildingsError" class="status-subtext">
                {{ t('hud.armyPanel.layoutLoadError') }}
              </p>
              <div v-else-if="targetBuildingRows.length" class="target-list building-list">
                <button
                  v-for="b in targetBuildingRows"
                  :key="`${b.q},${b.r}`"
                  type="button"
                  class="target-row"
                  @click="pickBuildingTarget(b.q, b.r)"
                >
                  <span class="target-name">{{ b.label }}</span>
                  <span class="target-owner">{{ t('hud.armyPanel.buildingLevelCoord', { level: b.level, q: b.q, r: b.r }) }}</span>
                </button>
              </div>
              <p v-else class="status-subtext">{{ t('hud.armyPanel.noPreference') }}</p>
            </template>
          </div>
        </template>

        <div v-if="routeRows.length" class="waypoint-list">
          <p class="status-subtext waypoint-hint">{{ t('hud.armyPanel.dragPinHint') }}</p>
          <div v-for="row in routeRows" :key="row.index" class="waypoint-row">
            <span class="waypoint-label">
              {{ row.label }}<span v-if="row.isDestination" class="waypoint-tag"> · {{ t('hud.armyPanel.destinationTag') }}</span>
            </span>
            <button
              type="button"
              class="waypoint-remove"
              :aria-label="t('hud.armyPanel.removeWaypoint', { n: row.index + 1 })"
              @click="world.removeWaypoint(row.index)"
            >
              ✕
            </button>
          </div>
        </div>

        <p v-if="hasLockedOutUnits" class="status-subtext fleet-note">
          {{ t('hud.armyPanel.fleetNote', { kind: selectionKind === 'fleet' ? t('hud.armyPanel.shipsOnly') : t('hud.armyPanel.landUnitsOnly') }) }}
        </p>
        <div class="unit-picker">
          <div
            v-for="row in garrisonRows"
            :key="row.unit"
            class="unit-picker-row"
            :class="{ 'is-locked-out': !isRowSelectable(row.unit) }"
          >
            <span class="unit-picker-name">{{ row.label }}</span>
            <input
              type="number"
              min="0"
              :max="row.available"
              class="qty"
              :disabled="!isRowSelectable(row.unit)"
              :value="quantityFor(row.unit)"
              @input="setQuantity(row.unit, ($event.target as HTMLInputElement).value, row.available)"
            />
            <span class="unit-picker-max">/ {{ row.available }}</span>
          </div>
          <div v-if="!garrisonRows.length" class="status-subtext">{{ t('hud.armyPanel.noUnitsAvailable') }}</div>
        </div>

        <label class="provisions-field">
          <span>{{ t('hud.armyPanel.provisions') }}</span>
          <input
            type="number"
            min="0"
            :value="draft.provisions"
            @input="world.setDispatchProvisions(Number(($event.target as HTMLInputElement).value))"
          />
        </label>

        <div class="dispatch-actions">
          <button class="secondary" @click="world.removeLastWaypoint()" :disabled="routeLength === 0">
            {{ t('hud.armyPanel.undoWaypoint') }}
          </button>
          <button class="secondary" @click="world.clearWaypoints()" :disabled="routeLength === 0">
            {{ t('hud.armyPanel.clearRoute') }}
          </button>
        </div>
        <div class="dispatch-actions">
          <button class="secondary" @click="world.cancelDispatch()">{{ t('hud.armyPanel.cancel') }}</button>
          <button class="primary" :disabled="!canConfirm" @click="confirm">
            {{ draft.submitting ? t('hud.armyPanel.dispatching') : t('hud.armyPanel.confirmDispatch') }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Mirrors TrainingQueuePanel.vue's `.status-card`/`.status-row` rules
   (scoped styles don't leak across components — see that file's own comment
   for why they're duplicated rather than shared). */
.status-card {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 10;
  width: 260px;
  max-height: 60vh;
  overflow-y: auto;
  padding: 14px 15px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 0;
}
.status-card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--panel-border);
}
.status-card-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text);
}
.status-card-count {
  font-size: 12px;
  color: var(--muted);
}
.status-row {
  padding: 8px 0;
  border-top: 1px solid var(--panel-border);
}
.status-row-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}
.status-row-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.status-row-time {
  font-size: 13px;
  font-weight: 600;
  color: var(--gold);
  white-space: nowrap;
}
.status-subtext {
  margin-top: 4px;
  font-size: 11px;
  color: var(--muted);
}
.demo-note {
  margin-top: 0;
}
.error-note {
  color: #e08a8a;
}
.garrison-empty {
  margin-top: 8px;
}

.army-row {
  cursor: pointer;
}
.army-row.is-selected {
  background: rgba(255, 197, 92, 0.08);
}
.army-row-actions {
  display: flex;
  gap: 6px;
}
.recall {
  margin-top: 6px;
  padding: 5px 10px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: #e08a8a;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.recall:disabled {
  opacity: 0.5;
  cursor: default;
}
.field-order {
  margin-top: 6px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
}

.dispatch-btn {
  margin-top: 10px;
  width: 100%;
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
}
.primary:disabled {
  opacity: 0.5;
  cursor: default;
}
.secondary {
  padding: 7px 12px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}
.secondary:disabled {
  opacity: 0.5;
  cursor: default;
}

.dispatch-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.instructions {
  margin-top: 0;
}
.mission-tag {
  color: var(--gold);
}
.mission-tabs {
  display: flex;
  gap: 6px;
}
.mission-tab {
  flex: 1;
  padding: 6px 10px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  cursor: pointer;
}
.mission-tab.active {
  border-color: var(--gold);
  color: var(--gold);
  background: rgba(255, 197, 92, 0.08);
}
.mission-tab.attack.active {
  border-color: #e08a8a;
  color: #e08a8a;
  background: rgba(224, 138, 138, 0.08);
}
.mission-tab.support.active {
  border-color: #6fbf8a;
  color: #6fbf8a;
  background: rgba(111, 191, 138, 0.08);
}
.support-note {
  margin-top: 0;
}
.target-selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text);
}
.change-target {
  padding: 3px 8px;
  font-size: 11px;
}
.target-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.target-search {
  padding: 6px 8px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  font-size: 12px;
}
.target-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 140px;
  overflow-y: auto;
}
.target-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 6px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.target-row:hover {
  background: rgba(255, 197, 92, 0.08);
}
.target-owner {
  color: var(--muted);
  white-space: nowrap;
}
.building-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.building-picker-hint {
  margin-top: 0;
}
.building-list {
  max-height: 120px;
}
.fleet-note {
  margin-top: 0;
  color: #e0b25a;
}
/* Issue #93: the plotted route, one editable row per waypoint. */
.waypoint-list {
  margin: 8px 0;
  border-top: 1px solid var(--panel-border);
}
.waypoint-hint {
  margin: 6px 0;
}
.waypoint-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 0;
}
.waypoint-label {
  font-size: 11px;
  color: var(--text);
}
.waypoint-tag {
  color: var(--gold);
}
.waypoint-remove {
  padding: 0 6px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  color: var(--muted);
  font-size: 11px;
  line-height: 18px;
  cursor: pointer;
}
.waypoint-remove:hover {
  color: #e08a8a;
}
.unit-picker {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.unit-picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.unit-picker-row.is-locked-out {
  opacity: 0.4;
}
.unit-picker-name {
  flex: 1;
  font-size: 12px;
  color: var(--text);
}
.unit-picker-max {
  font-size: 11px;
  color: var(--muted);
}
.qty {
  width: 56px;
  padding: 4px 6px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  text-align: center;
}
.provisions-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text);
}
.provisions-field input {
  width: 90px;
  padding: 4px 6px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  text-align: center;
}
.dispatch-actions {
  display: flex;
  gap: 8px;
}
.dispatch-actions .secondary,
.dispatch-actions .primary {
  flex: 1;
}
</style>
