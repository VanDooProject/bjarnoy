<script setup lang="ts">
// Issue: mobile army dispatch. Phones hide ArmyPanel entirely (a 260px card
// eats too much of a small screen), so this bottom sheet is the only way to
// compose or edit a dispatch/field-order draft there — mounted by MapView
// whenever `world.dispatchDraft` or `world.fieldOrderDraft` is set. Reuses
// the same store actions and derived-state helpers ArmyPanel.vue does (unit
// class lock-out, target/building pickers, waypoint rows); it does not
// duplicate their rules, just their presentation as a compact sheet instead
// of a right-anchored card.
//
// Units are picked manually here — no default selection (see the PR's own
// notes): the common path is tap tile -> pick units -> Start, not tap ->
// Start.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { useAuthStore } from '../../stores/auth';
import { DEMO_MODE } from '../../config';
import type { MessageSchema } from '../../i18n/schema';
import { missionName, unitName } from '../../i18n/catalogueNames';
import {
  classifyUnitSelection,
  hasCatapultSelected,
  isUnitSelectableFor,
  maxAffordableProvisions,
} from '../../lib/units/armyDispatch';
import { buildingLabel } from '../../lib/units/battleReports';

const world = useWorldStore();
const auth = useAuthStore();
const catalogue = useUnitCatalogueStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const draft = computed(() => world.dispatchDraft);
const fieldDraft = computed(() => world.fieldOrderDraft);
// A dispatch draft always wins if somehow both are set (they're mutually
// exclusive at the store level — see startDispatch/startFieldOrder — this
// is just a defensive tie-break for the template below).
const isFieldOrder = computed(() => !draft.value && !!fieldDraft.value);

// Dispatch opens the sheet expanded (units still need picking); a field
// order opens collapsed (route only, and the free "move on" hex is usually
// already plotted by the tap that started it).
const expanded = ref(!!world.dispatchDraft);
function toggleExpanded() {
  expanded.value = !expanded.value;
}

const garrisonRows = computed(() =>
  world.hud.garrison
    .filter((g) => g.count > 0)
    .map((g) => ({ unit: g.unit, label: unitName(g.unit), available: g.count })),
);
const selectionKind = computed(() => classifyUnitSelection(draft.value?.unitCounts ?? {}, catalogue.byType));
function isRowSelectable(unit: string): boolean {
  return isUnitSelectableFor(unit, selectionKind.value, catalogue.byType);
}
const hasLockedOutUnits = computed(() =>
  selectionKind.value !== 'none' && selectionKind.value !== 'mixed'
    ? garrisonRows.value.some((row) => !isRowSelectable(row.unit))
    : false,
);
function quantityFor(unit: string): number {
  return draft.value?.unitCounts[unit] ?? 0;
}
function applyQuantity(unit: string, value: number, max: number) {
  const clamped = Number.isFinite(value) ? Math.max(0, Math.min(Math.floor(value), max)) : 0;
  world.setDispatchUnitCount(unit, clamped);
  // Same re-proposal ArmyPanel's setQuantity does — the carry capacity
  // changed, so the previous provisions figure may no longer be the
  // sensible default (the player can still edit it after).
  if (draft.value) {
    world.setDispatchProvisions(
      maxAffordableProvisions(draft.value.unitCounts, catalogue.byType, world.hud.available.food),
    );
  }
}
function decrement(unit: string, max: number) {
  applyQuantity(unit, quantityFor(unit) - 1, max);
}
function increment(unit: string, max: number) {
  applyQuantity(unit, quantityFor(unit) + 1, max);
}
function setAll(unit: string, max: number) {
  applyQuantity(unit, max, max);
}

const routeLength = computed(() => draft.value?.route.length ?? 0);
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
const hasDestination = computed(() =>
  draft.value?.mission === 'attack' || draft.value?.mission === 'support'
    ? !!draft.value.targetSettlementId
    : routeLength.value > 0,
);
const canConfirm = computed(
  () => !DEMO_MODE && hasUnitsSelected.value && hasDestination.value && !draft.value?.submitting,
);

function setMission(mission: 'move' | 'attack' | 'support') {
  world.setDispatchMission(mission);
}

const targetSearch = ref('');
const attackTargets = computed(() => {
  const all = world.listAttackableSettlements();
  const query = targetSearch.value.trim().toLowerCase();
  const filtered = query
    ? all.filter((s) => s.name.toLowerCase().includes(query) || s.ownerName.toLowerCase().includes(query))
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

async function startDispatch() {
  await world.confirmDispatch();
}

const fieldOrderRouteLength = computed(() => fieldDraft.value?.route.length ?? 0);
const fieldOrderRouteRows = computed(() =>
  (fieldDraft.value?.route ?? []).map((c, i) => ({
    index: i,
    label: `${i + 1}. (${c.q}, ${c.r})`,
    isDestination: i === (fieldDraft.value?.route.length ?? 0) - 1,
  })),
);
const canConfirmFieldOrder = computed(
  () => !DEMO_MODE && fieldOrderRouteLength.value > 0 && !fieldDraft.value?.submitting,
);
async function startFieldOrder() {
  await world.confirmFieldOrder();
}

function cancel() {
  if (isFieldOrder.value) world.cancelFieldOrder();
  else world.cancelDispatch();
}
function undo() {
  if (isFieldOrder.value) world.removeLastFieldOrderWaypoint();
  else world.removeLastWaypoint();
}

const summaryText = computed(() => {
  if (isFieldOrder.value) {
    const n = fieldOrderRouteLength.value;
    return t('hud.dispatchSheet.stopsSummary', { count: n, stopWord: t('hud.dispatchSheet.stopWord', n) });
  }
  if (!draft.value) return '';
  if (draft.value.mission !== 'move' && selectedTarget.value) {
    return t('hud.dispatchSheet.toTarget', { name: selectedTarget.value.name });
  }
  const n = routeLength.value;
  return t('hud.dispatchSheet.stopsSummary', { count: n, stopWord: t('hud.dispatchSheet.stopWord', n) });
});
const missionLabel = computed(() =>
  isFieldOrder.value ? t('hud.dispatchSheet.fieldOrderTitle') : missionName(draft.value?.mission ?? 'move'),
);
const undoDisabled = computed(() =>
  isFieldOrder.value ? fieldOrderRouteLength.value === 0 : routeLength.value === 0,
);
const middleButtonLabel = computed(() =>
  isFieldOrder.value
    ? t('hud.dispatchSheet.stops', { count: fieldOrderRouteLength.value })
    : t('hud.dispatchSheet.units', { count: Object.values(draft.value?.unitCounts ?? {}).filter((c) => c > 0).length }),
);
const startLabel = computed(() => {
  if (isFieldOrder.value) return fieldDraft.value?.submitting ? t('hud.dispatchSheet.starting') : t('hud.dispatchSheet.start');
  return draft.value?.submitting ? t('hud.dispatchSheet.starting') : t('hud.dispatchSheet.start');
});
const startDisabled = computed(() => (isFieldOrder.value ? !canConfirmFieldOrder.value : !canConfirm.value));
function onStart() {
  if (isFieldOrder.value) void startFieldOrder();
  else void startDispatch();
}
const errorMessage = computed(() => (isFieldOrder.value ? fieldDraft.value?.error : draft.value?.error));
</script>

<template>
  <div class="dispatch-sheet" :class="{ 'is-expanded': expanded }">
    <div class="dispatch-sheet-collapsed">
      <div class="dispatch-sheet-row1">
        <span class="mission-chip">{{ missionLabel }}</span>
        <span class="summary-text">{{ summaryText }}</span>
        <button type="button" class="sheet-cancel" :aria-label="t('hud.dispatchSheet.cancel')" @click="cancel">✕</button>
      </div>
      <p v-if="errorMessage" class="status-subtext error-note">{{ errorMessage }}</p>
      <p v-if="DEMO_MODE" class="status-subtext demo-note">{{ t('hud.armyPanel.demoNote') }}</p>
      <div class="dispatch-sheet-row2">
        <button type="button" class="secondary" :disabled="undoDisabled" @click="undo">
          {{ t('hud.armyPanel.undoWaypoint') }}
        </button>
        <button type="button" class="secondary grip" :aria-label="expanded ? t('hud.dispatchSheet.collapse') : t('hud.dispatchSheet.expand')" @click="toggleExpanded">
          {{ middleButtonLabel }}
        </button>
        <button type="button" class="primary" :disabled="startDisabled" @click="onStart">
          {{ startLabel }}
        </button>
      </div>
    </div>

    <div v-if="expanded" class="dispatch-sheet-expanded">
      <template v-if="!isFieldOrder && draft">
        <div class="mission-tabs">
          <button type="button" class="mission-tab" :class="{ active: draft.mission === 'move' }" @click="setMission('move')">
            {{ missionName('move') }}
          </button>
          <button type="button" class="mission-tab attack" :class="{ active: draft.mission === 'attack' }" @click="setMission('attack')">
            {{ missionName('attack') }}
          </button>
          <button type="button" class="mission-tab support" :class="{ active: draft.mission === 'support' }" @click="setMission('support')">
            {{ missionName('support') }}
          </button>
        </div>

        <template v-if="draft.mission !== 'move'">
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
              <button v-for="target in attackTargets" :key="target.id" type="button" class="target-row" @click="pickTarget(target.id)">
                <span class="target-name">{{ target.name }}</span>
                <span class="target-owner">{{ target.ownerName }}</span>
              </button>
            </div>
            <p v-else class="status-subtext">{{ t('hud.armyPanel.noSettlementsFound') }}</p>
          </div>

          <div v-if="showBuildingPicker" class="building-picker">
            <p class="status-subtext">{{ t('hud.armyPanel.buildingPickerHint') }}</p>
            <div v-if="selectedBuildingLabel" class="target-selected">
              <span>{{ t('hud.armyPanel.target') }} <strong>{{ selectedBuildingLabel }}</strong></span>
              <button type="button" class="secondary change-target" @click="clearBuildingTarget">{{ t('hud.armyPanel.clear') }}</button>
            </div>
            <template v-else>
              <p v-if="world.dispatchTargetBuildingsLoading" class="status-subtext">{{ t('hud.armyPanel.loadingEnemyLayout') }}</p>
              <p v-else-if="world.dispatchTargetBuildingsError" class="status-subtext">{{ t('hud.armyPanel.layoutLoadError') }}</p>
              <div v-else-if="targetBuildingRows.length" class="target-list building-list">
                <button v-for="b in targetBuildingRows" :key="`${b.q},${b.r}`" type="button" class="target-row" @click="pickBuildingTarget(b.q, b.r)">
                  <span class="target-name">{{ b.label }}</span>
                  <span class="target-owner">{{ t('hud.armyPanel.buildingLevelCoord', { level: b.level, q: b.q, r: b.r }) }}</span>
                </button>
              </div>
              <p v-else class="status-subtext">{{ t('hud.armyPanel.noPreference') }}</p>
            </template>
          </div>
        </template>

        <div v-if="routeRows.length" class="waypoint-list">
          <div v-for="row in routeRows" :key="row.index" class="waypoint-row">
            <span class="waypoint-label">
              {{ row.label }}<span v-if="row.isDestination" class="waypoint-tag"> · {{ t('hud.armyPanel.destinationTag') }}</span>
            </span>
            <button type="button" class="waypoint-remove" :aria-label="t('hud.armyPanel.removeWaypoint', { n: row.index + 1 })" @click="world.removeWaypoint(row.index)">✕</button>
          </div>
        </div>

        <p v-if="hasLockedOutUnits" class="status-subtext fleet-note">
          {{ t('hud.armyPanel.fleetNote', { kind: selectionKind === 'fleet' ? t('hud.armyPanel.shipsOnly') : t('hud.armyPanel.landUnitsOnly') }) }}
        </p>
        <div class="unit-steppers">
          <div v-for="row in garrisonRows" :key="row.unit" class="unit-stepper-row" :class="{ 'is-locked-out': !isRowSelectable(row.unit) }">
            <span class="unit-stepper-name">{{ row.label }}</span>
            <div class="unit-stepper-controls">
              <button type="button" class="stepper-btn" :disabled="!isRowSelectable(row.unit) || quantityFor(row.unit) === 0" @click="decrement(row.unit, row.available)">{{ t('hud.dispatchSheet.decrement') }}</button>
              <span class="stepper-count">{{ quantityFor(row.unit) }} / {{ row.available }}</span>
              <button type="button" class="stepper-btn" :disabled="!isRowSelectable(row.unit) || quantityFor(row.unit) >= row.available" @click="increment(row.unit, row.available)">{{ t('hud.dispatchSheet.increment') }}</button>
              <button type="button" class="stepper-all" :disabled="!isRowSelectable(row.unit)" @click="setAll(row.unit, row.available)">{{ t('hud.dispatchSheet.allButton') }}</button>
            </div>
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
      </template>

      <template v-else-if="isFieldOrder && fieldDraft">
        <p v-if="!auth.isPremium" class="status-subtext waypoint-hint">
          {{ t('hud.armyPanel.freeAccountWaypoints') }}
          <strong>{{ t('hud.armyPanel.premium') }}</strong> {{ t('hud.armyPanel.premiumWaypointsNeeded') }}
        </p>
        <div v-if="fieldOrderRouteRows.length" class="waypoint-list">
          <div v-for="row in fieldOrderRouteRows" :key="row.index" class="waypoint-row">
            <span class="waypoint-label">
              {{ row.label }}<span v-if="row.isDestination" class="waypoint-tag"> · {{ t('hud.armyPanel.destinationTag') }}</span>
            </span>
            <button type="button" class="waypoint-remove" :aria-label="t('hud.armyPanel.removeWaypoint', { n: row.index + 1 })" @click="world.removeFieldOrderWaypoint(row.index)">✕</button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.dispatch-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(var(--hud-inset-bottom, 0px) + env(safe-area-inset-bottom, 0px));
  z-index: 36;
  background: var(--panel-bg);
  border-top: 1px solid var(--panel-border);
  padding: 10px 14px calc(10px + env(safe-area-inset-bottom, 0px));
}
.dispatch-sheet-collapsed {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dispatch-sheet-row1 {
  display: flex;
  align-items: center;
  gap: 8px;
}
.mission-chip {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--gold);
  border-radius: 10px;
  color: var(--gold);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.summary-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text);
}
.sheet-cancel {
  flex: none;
  width: 26px;
  height: 26px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
}
.dispatch-sheet-row2 {
  display: flex;
  gap: 8px;
}
.dispatch-sheet-row2 > * {
  flex: 1;
}
.dispatch-sheet-expanded {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--panel-border);
  max-height: 55dvh;
  overflow-y: auto;
}
.error-note {
  color: #e08a8a;
}
.demo-note {
  margin: 0;
}
.status-subtext {
  font-size: 11px;
  color: var(--muted);
}
.primary {
  padding: 9px 14px;
  background: var(--gold);
  border: none;
  border-radius: 8px;
  color: #20160a;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.5;
  cursor: default;
}
.secondary {
  padding: 8px 10px;
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
  padding: 8px;
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
  padding: 6px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
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
.building-list {
  max-height: 120px;
}
.fleet-note {
  color: #e0b25a;
}
.waypoint-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-top: 1px solid var(--panel-border);
  padding-top: 6px;
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
  padding: 0 8px;
  min-height: 28px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
}
.waypoint-hint {
  margin: 0;
}
.unit-steppers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.unit-stepper-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.unit-stepper-row.is-locked-out {
  opacity: 0.4;
}
.unit-stepper-name {
  flex: 1;
  font-size: 12px;
  color: var(--text);
}
.unit-stepper-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.stepper-btn {
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--text);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.stepper-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.stepper-count {
  min-width: 52px;
  text-align: center;
  font-size: 12px;
  color: var(--text);
}
.stepper-all {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--muted);
  font-size: 11px;
  cursor: pointer;
}
.stepper-all:disabled {
  opacity: 0.4;
  cursor: default;
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
  padding: 6px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--text);
  font: inherit;
  text-align: center;
}
</style>
