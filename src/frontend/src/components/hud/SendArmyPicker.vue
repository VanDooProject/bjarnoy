<script setup lang="ts">
// The source picker behind the ring's "Send army here" / Attack / Support / Hunt bubbles: lists the home garrison and every army already
// out in the field, home first and then the armies that can go, quickest first; the ones that cannot stay in the list, dimmed, with
// the reason. One component for both surfaces: ArmyPanel.vue on desktop and MobileDispatchSheet.vue on phones. Tapping a row (or the
// army's marker on the map, MapView) selects it: the map frames the target and the armies that can go and draws the route, and the row
// expands to pick the units (a standing army can be split) and send. Home hands over to the dispatch form for the garrison.
// Which sources can go is decided in lib/units/sendSources.ts, the same answer the ring menu used to enable its bubble.
import { computed, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useWorldStore } from '../../stores/world';
import { useUnitCatalogueStore } from '../../stores/unitCatalogue';
import { DEMO_MODE } from '../../config';
import type { MessageSchema } from '../../i18n/schema';
import { campName, missionName, unitName } from '../../i18n/catalogueNames';
import { motionEnabled } from '../../lib/motion';
import { fleetLacksLandTroops, isHuntUnit } from '../../lib/units/armyDispatch';
import { stackCounts } from '../../lib/units/fieldOrderFeasibility';
import type { SendSource } from '../../lib/units/sendSources';
import { useSendBlockText, useSendPickerRows } from '../../composables/useSendSources';
import { useDispatchTargetBuilding } from '../../composables/useDispatchTargetBuilding';
import DispatchTargetBuildingPicker from './DispatchTargetBuildingPicker.vue';
import flagIconUrl from '../../assets/icons/flag.svg?url';
import shipIconUrl from '../../assets/icons/ship.svg?url';

const world = useWorldStore();
const catalogue = useUnitCatalogueStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// The home row's icon: a house glyph, no art needed.
const HOME_GLYPH = '\u2302';

const picker = computed(() => world.sendPicker);
const { target, rows, verdictFor } = useSendPickerRows();
const draft = computed(() => world.fieldOrderDraft);
const buildingPicker = useDispatchTargetBuilding(computed(() => !!picker.value?.targetSettlementId));

const targetName = computed(() => {
  const p = picker.value;
  if (!p) return '';
  if (p.targetSettlementId) return world.model.getSettlement(p.targetSettlementId)?.name ?? '';
  if (p.mission === 'hunt') {
    const camp = world.model.campAt(p.coord);
    if (camp) return campName(camp.family);
  }
  return t('hud.sendPicker.hex', { q: p.coord.q, r: p.coord.r });
});
const title = computed(() => t('hud.sendPicker.title', { mission: missionName(picker.value?.mission ?? 'move'), target: targetName.value }));

function countUnits(stacks: ReadonlyArray<{ count: number }>): number {
  return stacks.reduce((sum, s) => sum + Math.max(0, s.count), 0);
}
function unitsLabel(n: number): string {
  return t('hud.sendPicker.units', { count: n }, n);
}
function formatTravel(minutes: number): string {
  return minutes < 60
    ? t('hud.sendPicker.etaMinutes', { minutes })
    : t('hud.sendPicker.etaHours', { hours: Math.floor(minutes / 60), minutes: String(minutes % 60).padStart(2, '0') });
}

const blockText = useSendBlockText();
function reasonFor(source: SendSource): string {
  return blockText(source, target.value);
}

interface PickerRow {
  source: SendSource;
  title: string;
  sub: string;
  eta: string | null;
  icon: string | null;
  selected: boolean;
}
const pickerRows = computed<PickerRow[]>(() =>
  rows.value.map((source) => {
    const army = source.army;
    const home = source.kind === 'home';
    const isFleet = !!army && army.stacks.some((s) => s.count > 0 && catalogue.byType[s.unit]?.class === 'ship');
    const standingAt = army?.movement ? army.movement.path[army.movement.path.length - 1]! : army?.position;
    const sub = source.ok
      ? home
        ? t('hud.sendPicker.garrison')
        : t(source.standing ? 'hud.sendPicker.standingAt' : 'hud.sendPicker.marchingTo', { q: standingAt?.q ?? 0, r: standingAt?.r ?? 0 })
      : reasonFor(source);
    return {
      source,
      title: home ? t('hud.sendPicker.home') : unitsLabel(countUnits(army?.stacks ?? [])),
      sub,
      eta: source.travelMinutes !== null && (source.ok || source.locked) ? formatTravel(source.travelMinutes) : null,
      icon: home ? null : isFleet ? shipIconUrl : flagIconUrl,
      selected: picker.value?.selectedId === source.id,
    };
  }),
);

function toggle(row: PickerRow) {
  if (!row.source.ok) return;
  if (row.selected) {
    world.selectSendSource(null);
    return;
  }
  world.selectSendSource(row.source.id);
}
const selectedRow = computed(() => pickerRows.value.find((r) => r.selected) ?? null);
const selectedArmy = computed(() => selectedRow.value?.source.army ?? null);
const leaving = computed<Record<string, number>>(() => {
  const army = selectedArmy.value;
  if (!army) return {};
  return draft.value?.units ?? stackCounts(army.stacks);
});
const leavingCount = computed(() => Object.values(leaving.value).reduce((sum, c) => sum + Math.max(0, c), 0));
const wholeCount = computed(() => countUnits(selectedArmy.value?.stacks ?? []));
const canSplit = computed(() => !!draft.value?.units);
// What the order would cost with the units chosen now: the pace is the slowest leaving unit's, the food share is theirs.
const verdict = computed(() => {
  const army = selectedArmy.value;
  if (!army || !target.value || leavingCount.value === 0) return null;
  return verdictFor(army, target.value, canSplit.value ? leaving.value : undefined);
});
const splitNote = computed(() => {
  if (!canSplit.value) return t('hud.sendPicker.wholeArmy');
  if (leavingCount.value === 0) return t('hud.sendPicker.pickOne');
  if (leavingCount.value >= wholeCount.value) return t('hud.sendPicker.wholeArmy');
  return t('hud.sendPicker.splits', { go: leavingCount.value, stay: wholeCount.value - leavingCount.value });
});
// A hunt at a sand camp with ships leaving and no land troops aboard: the ships do not fight there (`HuntRequiresLandUnits`).
const sandHuntLacksTroops = computed(
  () => draft.value?.mission === 'hunt' && !!target.value?.campOnSand && fleetLacksLandTroops(leaving.value, catalogue.byType),
);
const verdictNote = computed(() => {
  if (sandHuntLacksTroops.value) return t('apiErrors.rejections.HuntRequiresLandUnits');
  const v = verdict.value;
  if (!v || v.ok) return '';
  return v.reason === 'noFood' ? t('hud.sendPicker.reasons.noFood') : v.reason === 'unreachable' ? t('hud.sendPicker.reasons.unreachable') : '';
});
const canSend = computed(
  () =>
    !DEMO_MODE &&
    !!draft.value &&
    !draft.value.submitting &&
    leavingCount.value > 0 &&
    !!verdict.value?.ok &&
    !sandHuntLacksTroops.value &&
    !buildingPicker.isMissingRequiredPick.value,
);
// A hunt on a land camp other than sand cannot take ships along: their rows are locked at 0 (see trimToHuntUnits).
function unitLocked(unit: string): boolean {
  return draft.value?.mission === 'hunt' && !isHuntUnit(unit, catalogue.byType, !!target.value?.campAtSea, !!target.value?.campOnSand);
}
const sendLabel = computed(() => {
  if (draft.value?.submitting) return t('hud.dispatchSheet.starting');
  const time = verdict.value?.ok ? ` · ${formatTravel(verdict.value.travelMinutes)}` : '';
  return `${missionName(picker.value?.mission ?? 'move')} · ${unitsLabel(leavingCount.value)}${time}`;
});

function step(max: number): number {
  return max > 10 ? 5 : 1;
}
function change(unit: string, delta: number) {
  world.setFieldOrderUnitCount(unit, (leaving.value[unit] ?? 0) + delta);
}

async function send() {
  await world.confirmFieldOrder();
}
function close() {
  world.closeSendPicker();
}

// A marker tap on the map selects the row too: bring it into view.
watch(
  () => picker.value?.selectedId,
  async (id) => {
    if (!id) return;
    await nextTick();
    const el = document.querySelector('.send-picker .send-row.is-selected');
    el?.scrollIntoView?.({ block: 'nearest', behavior: motionEnabled() ? 'smooth' : 'auto' });
  },
);
</script>

<template>
  <div v-if="picker" class="send-picker">
    <div class="send-picker-title">
      <span class="send-picker-title-text">{{ title }}</span>
      <button type="button" class="send-picker-close" :aria-label="t('hud.sendPicker.close')" @click="close">✕</button>
    </div>
    <p v-if="DEMO_MODE" class="send-picker-note">{{ t('hud.armyPanel.demoNote') }}</p>

    <div class="send-picker-list">
      <div
        v-for="row in pickerRows"
        :key="row.source.id"
        class="send-row"
        :class="{ 'is-home': row.source.kind === 'home', 'is-selected': row.selected, 'is-off': !row.source.ok }"
        :data-source="row.source.id"
      >
        <button type="button" class="send-row-head" :disabled="!row.source.ok" :aria-pressed="row.selected" @click="toggle(row)">
          <span class="send-row-icon" aria-hidden="true">
            <img v-if="row.icon" :src="row.icon" alt="" />
            <template v-else>{{ HOME_GLYPH }}</template>
          </span>
          <span class="send-row-text">
            <span class="send-row-title"><span v-if="row.source.locked" aria-hidden="true">🔒 </span>{{ row.title }}</span>
            <span class="send-row-sub">{{ row.sub }}</span>
          </span>
          <span class="send-row-eta">{{ row.eta ?? '' }}</span>
        </button>

        <div v-if="row.selected && draft" class="send-row-body">
          <div v-if="canSplit" class="send-steppers">
            <div
              v-for="stack in row.source.army?.stacks.filter((s) => s.count > 0)"
              :key="stack.unit"
              class="send-stepper"
              :class="{ 'is-locked-out': unitLocked(stack.unit) }"
            >
              <span class="send-stepper-name">{{ unitName(stack.unit) }}</span>
              <button
                type="button"
                class="stepper-btn"
                :aria-label="t('hud.dispatchSheet.decrement')"
                :disabled="(leaving[stack.unit] ?? 0) <= 0"
                @click="change(stack.unit, -step(stack.count))"
              >
                {{ t('hud.dispatchSheet.decrement') }}
              </button>
              <span class="stepper-count">{{ leaving[stack.unit] ?? 0 }} / {{ stack.count }}</span>
              <button
                type="button"
                class="stepper-btn"
                :aria-label="t('hud.dispatchSheet.increment')"
                :disabled="(leaving[stack.unit] ?? 0) >= stack.count || unitLocked(stack.unit)"
                @click="change(stack.unit, step(stack.count))"
              >
                {{ t('hud.dispatchSheet.increment') }}
              </button>
              <button
                type="button"
                class="stepper-all"
                :disabled="unitLocked(stack.unit)"
                @click="world.setFieldOrderUnitCount(stack.unit, stack.count)"
              >
                {{ t('hud.dispatchSheet.allButton') }}
              </button>
            </div>
          </div>
          <p class="send-split-note" data-testid="split-note">{{ splitNote }}</p>
          <p v-if="verdictNote" class="send-error">{{ verdictNote }}</p>
          <DispatchTargetBuildingPicker :has-target="!!picker.targetSettlementId" />
          <p v-if="draft.error" class="send-error">{{ draft.error }}</p>
          <button type="button" class="send-go" :disabled="!canSend" @click="send">{{ sendLabel }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.send-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.send-picker-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.send-picker-title-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.send-picker-close {
  flex: none;
  width: 26px;
  height: 26px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
}
.send-picker-note {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}
.send-picker-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 42dvh;
  overflow-y: auto;
}
.send-row {
  border: 1px solid var(--panel-border);
  border-radius: 8px;
}
.send-row.is-selected {
  border-color: var(--gold);
  background: rgba(255, 197, 92, 0.06);
}
.send-row.is-off {
  opacity: 0.55;
}
.send-row-head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 6px 10px;
  background: transparent;
  border: none;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.send-row-head:disabled {
  cursor: default;
}
.send-row-icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--gold);
  border-radius: 50%;
  color: var(--gold);
  font-size: 14px;
}
.send-row-icon img {
  width: 16px;
  height: 16px;
}
.send-row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.send-row-title {
  font-size: 13px;
  font-weight: 700;
}
.send-row-sub {
  font-size: 11px;
  color: var(--muted);
}
.send-row-eta {
  flex: none;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--gold);
}
.send-row-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 10px 10px;
}
.send-steppers {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.send-stepper {
  display: flex;
  align-items: center;
  gap: 6px;
}
.send-stepper.is-locked-out {
  opacity: 0.4;
}
.send-stepper-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text);
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
.stepper-btn:disabled,
.stepper-all:disabled {
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
.send-split-note {
  margin: 0;
  font-size: 11px;
  color: var(--muted);
}
.send-error {
  margin: 0;
  font-size: 11px;
  color: #e08a8a;
}
.send-go {
  padding: 9px 14px;
  background: var(--gold);
  border: none;
  border-radius: 8px;
  color: #20160a;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
}
.send-go:disabled {
  background: rgba(255, 255, 255, 0.08);
  color: var(--muted);
  cursor: default;
}
</style>
