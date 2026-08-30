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
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { DEMO_MODE } from '../../config';
import {
  armyStatusLabel,
  classifyUnitSelection,
  formatEta,
  hasCatapultSelected,
  isUnitSelectableFor,
  maxAffordableProvisions,
} from '../../lib/units/armyDispatch';
import { buildingLabel } from '../../lib/units/battleReports';

const world = useWorldStore();
const catalogue = useUnitCatalogueStore();

onMounted(() => {
  void catalogue.load();
});

const UNIT_LABELS: Record<string, string> = {
  thrall: 'Thrall',
  spearman: 'Spearman',
  axeman: 'Axeman',
  bowman: 'Bowman',
  berserker: 'Berserker',
  provisioner: 'Provisioner',
  catapult: 'Catapult',
  karve: 'Karve',
  longship: 'Longship',
};
function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}

// A row's mission tag: unlike battleReports.ts's `missionLabel` (which only
// ever sees 'attack'/'raid' — the two missions a battle report can be for),
// an army row can be 'attack'/'support'/'raid' (never 'move' — see the
// `!== 'move'` guard below), so this just title-cases the wire value rather
// than special-casing two of the four.
function missionTagLabel(mission: string): string {
  return mission.charAt(0).toUpperCase() + mission.slice(1);
}

const draft = computed(() => world.dispatchDraft);

// Only garrison units can be sent — the wire-name -> count map the quantity
// inputs below read/write against, filtered to what's actually standing here.
const garrisonRows = computed(() =>
  world.hud.garrison
    .filter((g) => g.count > 0)
    .map((g) => ({ unit: g.unit, label: unitLabel(g.unit), available: g.count })),
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
    world.setDispatchProvisions(
      maxAffordableProvisions(draft.value.unitCounts, catalogue.byType, world.hud.resources.food),
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
  return row ? `${row.label} (Lv ${row.level})` : `(${coord.q}, ${coord.r})`;
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
      .map((s) => `${s.count}× ${unitLabel(s.unit)}`)
      .join(', ');
    const targetName = army.targetSettlementId
      ? world.model.getSettlement(army.targetSettlementId)?.name ?? null
      : null;
    const status = armyStatusLabel(army, army.supporting ? targetName : null);
    const eta = army.movement
      ? formatEta(army.movement.isReturning ? army.movement.returnArrivesAt : army.movement.arrivesAt, now)
      : null;
    const canRecall = !army.atHome && (army.supporting || (army.movement !== null && !army.movement.isReturning));
    return {
      id: army.id,
      composition: composition || '—',
      status,
      eta,
      canRecall,
      selected: army.id === world.selectedArmyId,
      mission: army.mission !== 'move' ? missionTagLabel(army.mission) : null,
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
</script>

<template>
  <div class="status-card army-panel">
    <div class="status-card-header">
      <span class="status-card-title">Armies</span>
      <span class="status-card-count">{{ armyRows.length }}</span>
    </div>

    <p v-if="DEMO_MODE" class="status-subtext demo-note">
      Dispatching armies requires the live backend and isn't wired up in demo mode yet.
    </p>

    <template v-if="!draft">
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
          <button
            v-if="row.canRecall"
            class="recall"
            :disabled="recalling(row.id)"
            @click.stop="recall(row.id)"
          >
            {{ recalling(row.id) ? 'Recalling…' : 'Recall' }}
          </button>
        </div>
      </div>
      <div v-else class="status-subtext garrison-empty">No armies on the road.</div>

      <button
        class="primary dispatch-btn"
        :disabled="DEMO_MODE || garrisonRows.length === 0"
        @click="beginDispatch"
      >
        Dispatch army
      </button>
    </template>

    <template v-else>
      <div class="dispatch-form">
        <p v-if="draft.error" class="status-subtext error-note">{{ draft.error }}</p>

        <div class="mission-tabs">
          <button
            type="button"
            class="mission-tab"
            :class="{ active: draft.mission === 'move' }"
            @click="setMission('move')"
          >
            Move
          </button>
          <button
            type="button"
            class="mission-tab attack"
            :class="{ active: draft.mission === 'attack' }"
            @click="setMission('attack')"
          >
            Attack
          </button>
          <button
            type="button"
            class="mission-tab support"
            :class="{ active: draft.mission === 'support' }"
            @click="setMission('support')"
          >
            Support
          </button>
        </div>

        <p v-if="draft.mission === 'move'" class="status-subtext instructions">
          Click hexes on the map to plot a route — the last click is the
          destination. {{ routeLength }} hex{{ routeLength === 1 ? '' : 'es' }} plotted.
        </p>
        <template v-else>
          <p class="status-subtext instructions">
            Choose a settlement to {{ draft.mission }}, then optionally click hexes on the
            map to plot a route there. {{ routeLength }} waypoint{{ routeLength === 1 ? '' : 's' }} plotted.
          </p>

          <div v-if="selectedTarget" class="target-selected">
            <span>Target: <strong>{{ selectedTarget.name }}</strong> ({{ selectedTarget.ownerName }})</span>
            <button type="button" class="secondary change-target" @click="clearTarget">Change</button>
          </div>
          <div v-else class="target-picker">
            <input
              v-model="targetSearch"
              type="text"
              class="target-search"
              :placeholder="`Search settlements to ${draft.mission}…`"
            />
            <div v-if="attackTargets.length" class="target-list">
              <button
                v-for="t in attackTargets"
                :key="t.id"
                type="button"
                class="target-row"
                @click="pickTarget(t.id)"
              >
                <span class="target-name">{{ t.name }}</span>
                <span class="target-owner">{{ t.ownerName }}</span>
              </button>
            </div>
            <p v-else class="status-subtext">No other settlements found yet.</p>
          </div>

          <p v-if="draft.mission === 'support'" class="status-subtext support-note">
            Support needs less food than an attack or long march — the host
            feeds your troops once they arrive.
          </p>

          <div v-if="showBuildingPicker" class="building-picker">
            <p class="status-subtext building-picker-hint">
              Preferred catapult target — may change if it's no longer there
              by the time your army arrives.
            </p>
            <div v-if="selectedBuildingLabel" class="target-selected">
              <span>Target: <strong>{{ selectedBuildingLabel }}</strong></span>
              <button type="button" class="secondary change-target" @click="clearBuildingTarget">Clear</button>
            </div>
            <template v-else>
              <p v-if="world.dispatchTargetBuildingsLoading" class="status-subtext">Loading enemy layout…</p>
              <p v-else-if="world.dispatchTargetBuildingsError" class="status-subtext">
                Couldn't load this settlement's layout — target will be chosen at random on arrival.
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
                  <span class="target-owner">Lv {{ b.level }} · ({{ b.q }}, {{ b.r }})</span>
                </button>
              </div>
              <p v-else class="status-subtext">No preference — target will be chosen at random on arrival.</p>
            </template>
          </div>
        </template>

        <div v-if="routeRows.length" class="waypoint-list">
          <p class="status-subtext waypoint-hint">Drag a pin on the map to move a waypoint.</p>
          <div v-for="row in routeRows" :key="row.index" class="waypoint-row">
            <span class="waypoint-label">
              {{ row.label }}<span v-if="row.isDestination" class="waypoint-tag"> · destination</span>
            </span>
            <button
              type="button"
              class="waypoint-remove"
              :aria-label="`Remove waypoint ${row.index + 1}`"
              @click="world.removeWaypoint(row.index)"
            >
              ✕
            </button>
          </div>
        </div>

        <p v-if="hasLockedOutUnits" class="status-subtext fleet-note">
          {{ selectionKind === 'fleet' ? 'Ships' : 'Land units' }} only — ships and land
          units can't be dispatched together.
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
          <div v-if="!garrisonRows.length" class="status-subtext">No units available to send.</div>
        </div>

        <label class="provisions-field">
          <span>Provisions</span>
          <input
            type="number"
            min="0"
            :value="draft.provisions"
            @input="world.setDispatchProvisions(Number(($event.target as HTMLInputElement).value))"
          />
        </label>

        <div class="dispatch-actions">
          <button class="secondary" @click="world.removeLastWaypoint()" :disabled="routeLength === 0">
            Undo waypoint
          </button>
          <button class="secondary" @click="world.clearWaypoints()" :disabled="routeLength === 0">
            Clear route
          </button>
        </div>
        <div class="dispatch-actions">
          <button class="secondary" @click="world.cancelDispatch()">Cancel</button>
          <button class="primary" :disabled="!canConfirm" @click="confirm">
            {{ draft.submitting ? 'Dispatching…' : 'Confirm dispatch' }}
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
