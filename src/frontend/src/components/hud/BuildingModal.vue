<script setup lang="ts">
// zip 9: "Hex interaction | Hover = stats tooltip · Click = full-screen
// building screen" — this is the click half. Replaces the old
// instant-build-on-click in SettlementView.vue with the mockup's full-screen
// hex detail screen (Viking Realm.dc.html's `sel` overlay): art on the left,
// name/level/description/action on the right.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Tile } from '../../lib/map/types';
import type { ResourceLine } from '../../api/types';
import type { MessageSchema } from '../../i18n/schema';
import { buildingName, terrainName, resourceName, runeTypeName, runeRarityName } from '../../i18n/catalogueNames';
import { useWorldStore } from '../../stores/world';
import {
  BOOST_TERRAIN,
  buildingStatsFor,
  buildingUpgradeCost,
  matchingNeighbourCount,
  type BuildingKind,
  type BuildingOutput,
  type BuildingModifier,
} from '../../lib/map/buildingEconomy';

const world = useWorldStore();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

import { buildingArt, terrainArt } from '../../lib/map/buildingArt';
import AtlasSprite from '../AtlasSprite.vue';

const props = defineProps<{
  tile: Tile;
  mine: boolean;
  ownerLabel: string | null;
  busy: boolean;
  // Issue #158: the caller (SettlementView) surfaces a queue rejection's
  // detail text here (NoFreeSlot's premium hint included) rather than this
  // modal reaching into the API layer itself.
  /** Why the last build/upgrade attempt was rejected by the backend, or null once dismissed by a fresh attempt. */
  error?: string | null;
}>();
const emit = defineEmits<{ close: []; build: []; upgrade: [] }>();

// Issue #53: shrine slots by level, mirroring ShrineCatalogue.Slots.cs.
function shrineSlotsFor(level: number): number {
  const clamped = Math.min(Math.max(level, 1), 5);
  if (clamped >= 5) return 3;
  if (clamped >= 3) return 2;
  return 1;
}

const SHRINE_TYPES = new Set(['shrineofthor', 'shrineoffreyja', 'shrineofullr', 'shrineofnjord']);
const isShrine = computed(() => SHRINE_TYPES.has(props.tile.buildingType ?? ''));
// Level 0 is the foundation stub while the shrine is still under
// construction (Enqueue) — it grants no favour and has no slots yet, mirrored
// by Settlement.SlotRune/ActiveEffect rejecting it backend-side.
const shrineBuilt = computed(() => (props.tile.buildingLevel ?? 0) >= 1);
const shrineSlots = computed(() => shrineSlotsFor(props.tile.buildingLevel ?? 1));
const slottedRunes = computed(() =>
  world.hud.runes.filter((r) => r.slottedAtQ === props.tile.q && r.slottedAtR === props.tile.r),
);
// A rune slotted into a *different* shrine can't be slotted here too — only
// storage (slottedAtQ === null) is offered as a candidate for this shrine.
const storedRunes = computed(() => world.hud.runes.filter((r) => r.slottedAtQ === null));

const runeBusy = ref(false);
const runeError = ref<string | null>(null);

async function slotHere(runeId: string) {
  runeBusy.value = true;
  runeError.value = null;
  try {
    await world.slotRuneLive(runeId, { q: props.tile.q, r: props.tile.r });
  } catch {
    runeError.value = t('hud.buildingModal.slotRuneError');
  } finally {
    runeBusy.value = false;
  }
}

async function unslot(runeId: string) {
  runeBusy.value = true;
  runeError.value = null;
  try {
    await world.unslotRuneLive(runeId);
  } catch {
    runeError.value = t('hud.buildingModal.unslotRuneError');
  } finally {
    runeBusy.value = false;
  }
}

const art = computed(() => {
  const { buildingType, buildingLevel, terrain } = props.tile;
  return (buildingType ? buildingArt(buildingType, buildingLevel ?? 1) : undefined) ?? terrainArt(terrain);
});
// Open water is otherwise unbuildable, but a fishing hut already standing
// on a coastal-water tile still has to be inspectable/upgradeable here —
// this only ever sees such a tile with a building on it already (nothing in
// this modal's own `build` flow offers water as a target), so it can't be
// mistaken for turning open water buildable from empty.
const buildable = computed(() => props.tile.terrain !== 'sea' || props.tile.buildingType === 'fishinghut');

const name = computed(() =>
  props.tile.buildingType ? buildingName(props.tile.buildingType) : terrainName(props.tile.terrain),
);
const sub = computed(() => {
  if (!props.tile.buildingType)
    return props.mine ? t('hud.buildingModal.subEmptyClaimed') : (props.ownerLabel ?? t('hud.buildingModal.subUnclaimed'));
  return props.ownerLabel ?? t('hud.buildingModal.subWildRuin');
});
const level = computed(() => props.tile.buildingLevel ?? 0);

// Same terrain-adjacency helper hoverInfoFor/buildingStats uses in
// HexMapRenderer.ts, so the modal's "current stats" match whatever the hover
// tooltip just showed.
const getTile = (q: number, r: number): Tile => world.model.getTile(q, r);
const matchingNeighbours = computed(() => {
  const boostTerrain = props.tile.buildingType ? BOOST_TERRAIN[props.tile.buildingType] : undefined;
  return boostTerrain ? matchingNeighbourCount(props.tile, boostTerrain, getTile) : 0;
});

// Mirrors HexTooltip.vue's formatOutput/formatModifier.
function formatOutput(output: BuildingOutput): string {
  switch (output.kind) {
    case 'resourceRate':
      return t('hud.hoverTooltip.outputResourceRate', { amount: output.amount, resource: resourceName(output.resource) });
    case 'populationCapacity':
      return t('hud.hoverTooltip.outputPopulationCapacity', { amount: output.amount });
    case 'storageCapacity':
      return t('hud.hoverTooltip.outputStorageCapacity', { amount: output.amount });
    case 'visionRing':
      return t('hud.hoverTooltip.outputVisionRing', { amount: output.amount });
  }
}

function formatModifier(modifier: BuildingModifier): string {
  switch (modifier.kind) {
    case 'borderAnchor':
      return t('hud.hoverTooltip.modifierBorderAnchor');
    case 'trainsLandTroops':
      return t('hud.hoverTooltip.modifierTrainsLandTroops');
    case 'trainsShips':
      return t('hud.hoverTooltip.modifierTrainsShips');
    case 'garrison':
      return t('hud.hoverTooltip.modifierGarrison');
    case 'terrainBoost':
      return t('hud.hoverTooltip.modifierTerrainBoost', { terrain: terrainName(modifier.terrain), percent: modifier.percent });
    case 'coastal':
      return modifier.percent
        ? t('hud.hoverTooltip.modifierCoastalBoost', { percent: modifier.percent })
        : t('hud.hoverTooltip.modifierCoastal');
    case 'arcane':
      return t('hud.hoverTooltip.modifierArcane');
    case 'shrineFavour':
      if (modifier.domain === 'shipAttack') {
        return t('hud.hoverTooltip.modifierShrineFavourShipAttack', { percent: modifier.percent });
      }
      if (modifier.domain === 'landAttack') {
        return t('hud.hoverTooltip.modifierShrineFavourLandAttack', { percent: modifier.percent });
      }
      return t('hud.hoverTooltip.modifierShrineFavour', {
        percent: modifier.percent,
        domain: t(modifier.domain === 'wood' ? 'hud.hoverTooltip.domainWood' : 'hud.hoverTooltip.domainFood'),
      });
  }
}

// The existing building's current-level output/modifier/workers — undefined
// (and hidden) for an empty tile, since there's nothing standing yet.
const buildingStats = computed(() =>
  props.tile.buildingType ? buildingStatsFor(props.tile.buildingType, level.value, matchingNeighbours.value) : undefined,
);
const currentStats = computed(() =>
  buildingStats.value
    ? {
        output: buildingStats.value.output ? formatOutput(buildingStats.value.output) : undefined,
        modifier: buildingStats.value.modifier ? formatModifier(buildingStats.value.modifier) : undefined,
        workers: buildingStats.value.workers ? t('hud.hoverTooltip.workersValue', { cap: buildingStats.value.workers.cap }) : undefined,
      }
    : undefined,
);

// "hut" is the fixed default a fresh build here places (see
// SettlementView.vue's build()); an existing building instead costs its own
// next level.
const upgradeType = computed<BuildingKind>(() => props.tile.buildingType ?? 'hut');
const upgradeLevel = computed(() => level.value + 1);
const upgradeCost = computed<ResourceLine>(() => buildingUpgradeCost(upgradeType.value, upgradeLevel.value));

const costLine = computed(() =>
  (Object.keys(upgradeCost.value) as (keyof ResourceLine)[])
    .filter((key) => upgradeCost.value[key] > 0)
    .map((key) => `${upgradeCost.value[key]} ${resourceName(key)}`)
    .join(' · '),
);

// Issue #158: affordability is checked against `available` (stock minus
// what the waiting build queue has reserved), not raw stock — a reservation
// that could still be spent here would not be a reservation. Demo mode has
// no reservation concept (`hud.available` mirrors `hud.resources` there —
// see stores/world.ts), so this degrades to the old plain-stock check for
// free.
const canAfford = computed(() =>
  (Object.keys(upgradeCost.value) as (keyof ResourceLine)[]).every(
    (key) => world.hud.available[key] >= upgradeCost.value[key],
  ),
);

// A hex already holding a waiting order (this settlement's premium queue,
// still on this same hex) shows a distinct "queued, no slot yet" state
// instead of a build/upgrade button — cancelling it is BuildQueuePanel's
// job, not this modal's.
const waitingOrderHere = computed(() =>
  world.hud.queue.find((o) => o.q === props.tile.q && o.r === props.tile.r && o.state === 'waiting'),
);

// No free construction slot right now (every slot occupied by an
// already-building order) — for a premium account (a non-zero waiting
// queue), the action still submits, but as a waiting-queue request rather
// than an immediate build, so the button copy says so up front instead of
// surprising the player with a 409.
const noFreeSlot = computed(() => world.hud.construction.slotsUsed >= world.hud.construction.slots);

// No free slot *and* no waiting queue at all (`maxWaitingOrders === 0`
// doubles as "not premium" — see stores/world.ts's own comment on the
// field) — there is nothing this click could do but be rejected, so the
// button is disabled outright instead of only failing after the round trip.
const noSlotNoQueue = computed(() => noFreeSlot.value && world.hud.construction.maxWaitingOrders === 0);

const actionLabel = computed(() => {
  if (props.busy) return t('hud.buildingModal.queuing');
  if (noSlotNoQueue.value) return t('hud.buildingModal.noFreeSlotPremium');
  if (noFreeSlot.value) return t('hud.buildingModal.queueBuild');
  return props.tile.buildingType
    ? t('hud.buildingModal.upgradeToLevel', { level: level.value + 1 })
    : t('hud.buildingModal.buildHere');
});
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="modal panel">
      <div class="art">
        <AtlasSprite v-if="art?.kind === 'atlas'" :frame="art.frame" class="art-img" />
        <img v-else-if="art?.kind === 'png'" class="art-img" :src="art.url" alt="" />
        <span class="coord">{{ t('hud.buildingModal.hexCoord', { q: tile.q, r: tile.r }) }}</span>
      </div>
      <div class="body">
        <div class="head">
          <div>
            <div class="name">{{ name }}</div>
            <div class="sub">{{ level > 0 ? t('hud.buildingModal.levelSub', { level, sub }) : sub }}</div>
          </div>
          <button class="close" @click="emit('close')">{{ t('hud.buildingModal.close') }}</button>
        </div>

        <p v-if="!mine && tile.buildingType" class="desc">
          {{ t('hud.buildingModal.descHeldByOther') }}
        </p>
        <p v-else-if="!mine" class="desc">{{ t('hud.buildingModal.descOutsideBorder') }}</p>
        <p v-else-if="!buildable" class="desc">{{ t('hud.buildingModal.descOpenWater') }}</p>
        <p v-else class="desc">
          {{ tile.buildingType ? t('hud.buildingModal.descUpgrade') : t('hud.buildingModal.descBuildEmpty') }}
        </p>

        <dl v-if="currentStats && (currentStats.output || currentStats.modifier || currentStats.workers)" class="stats">
          <template v-if="currentStats.output">
            <dt>{{ t('hud.hoverTooltip.output') }}</dt>
            <dd>{{ currentStats.output }}</dd>
          </template>
          <template v-if="currentStats.modifier">
            <dt>{{ t('hud.hoverTooltip.modifier') }}</dt>
            <dd>{{ currentStats.modifier }}</dd>
          </template>
          <template v-if="currentStats.workers">
            <dt>{{ t('hud.hoverTooltip.workers') }}</dt>
            <dd>{{ currentStats.workers }}</dd>
          </template>
        </dl>

        <div v-if="isShrine && mine && shrineBuilt" class="runes">
          <div class="runes-head">
            {{ t('hud.buildingModal.runesSlotted', { slotted: slottedRunes.length, total: shrineSlots }) }}
          </div>
          <p v-if="runeError" class="rune-error">{{ runeError }}</p>

          <ul v-if="slottedRunes.length" class="rune-list">
            <li v-for="rune in slottedRunes" :key="rune.id">
              <span>{{ runeTypeName(rune.type) }} ({{ runeRarityName(rune.rarity) }})</span>
              <button class="ghost" :disabled="runeBusy" @click="unslot(rune.id)">{{ t('hud.buildingModal.unslot') }}</button>
            </li>
          </ul>

          <template v-if="storedRunes.length">
            <div class="runes-head">{{ t('hud.buildingModal.inStorage') }}</div>
            <ul class="rune-list">
              <li v-for="rune in storedRunes" :key="rune.id">
                <span>{{ runeTypeName(rune.type) }} ({{ runeRarityName(rune.rarity) }})</span>
                <button
                  class="ghost"
                  :disabled="runeBusy || slottedRunes.length >= shrineSlots"
                  @click="slotHere(rune.id)"
                >
                  {{ t('hud.buildingModal.slotHere') }}
                </button>
              </li>
            </ul>
          </template>
        </div>

        <div v-if="mine && buildable && waitingOrderHere" class="actions">
          <p class="desc queued-note">{{ t('hud.buildingModal.queuedNote') }}</p>
        </div>
        <div v-else-if="mine && buildable" class="actions">
          <div class="cost">
            {{ tile.buildingType ? t('hud.buildingModal.upgradeCost') : t('hud.buildingModal.buildCost') }}: {{ costLine }}
          </div>
          <p v-if="!canAfford" class="desc afford-note">
            {{ t('hud.buildingModal.notEnoughResources') }}
          </p>
          <i18n-t v-if="noSlotNoQueue" keypath="hud.buildingModal.premiumRequired" tag="p" class="desc afford-note">
            <template #premium><strong>{{ t('hud.buildingModal.premium') }}</strong></template>
          </i18n-t>
          <p v-if="error" class="desc afford-note">{{ error }}</p>
          <button
            v-if="tile.buildingType"
            class="primary"
            :disabled="busy || !canAfford || noSlotNoQueue"
            @click="emit('upgrade')"
          >
            {{ actionLabel }}
          </button>
          <button v-else class="primary" :disabled="busy || !canAfford || noSlotNoQueue" @click="emit('build')">
            {{ actionLabel }}
          </button>
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
  width: 720px;
  max-width: 94vw;
  display: flex;
  overflow: hidden;
}
.art {
  width: 280px;
  flex: none;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(90% 70% at 50% 45%, #1a3d4d 0%, #0d1f29 100%);
}
.art-img {
  width: 70%;
  image-rendering: -webkit-optimize-contrast;
}
.coord {
  position: absolute;
  left: 16px;
  top: 16px;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--muted);
}
.body {
  flex: 1;
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
  font-size: 14px;
  line-height: 1.55;
  color: var(--muted);
  max-width: 380px;
}
.stats {
  margin: 16px 0 0;
  display: grid;
  grid-template-columns: auto auto;
  column-gap: 14px;
  row-gap: 4px;
  font-size: 13px;
  max-width: 380px;
}
.stats dt {
  color: var(--muted);
}
.stats dd {
  margin: 0;
  color: var(--text);
  font-weight: 500;
  text-align: right;
}
.actions {
  margin-top: 22px;
}
.action-error {
  margin: 0 0 10px;
  font-size: 13px;
  color: #e07a5f;
}
.cost {
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--gold);
}
.afford-note {
  margin: 0 0 10px;
  font-size: 12px;
  color: #e07a5f;
  max-width: 380px;
}
.queued-note {
  color: var(--muted);
}
.primary {
  padding: 12px 22px;
  background: var(--gold);
  border: none;
  border-radius: 8px;
  color: #20160a;
  font-weight: 700;
  font-size: 15px;
  letter-spacing: 0.03em;
  cursor: pointer;
}
.primary:disabled {
  opacity: 0.6;
  cursor: default;
}
.runes {
  margin: 16px 0 0;
  max-width: 380px;
  font-size: 13px;
}
.runes-head {
  color: var(--muted);
  margin: 10px 0 6px;
}
.runes-head:first-child {
  margin-top: 0;
}
.rune-error {
  color: #e07a5f;
  margin: 4px 0;
}
.rune-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rune-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--text);
}
.ghost {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--muted);
  border-radius: 6px;
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}
.ghost:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
