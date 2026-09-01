<script setup lang="ts">
// zip 9: "Hex interaction | Hover = stats tooltip · Click = full-screen
// building screen" — this is the click half. Replaces the old
// instant-build-on-click in SettlementView.vue with the mockup's full-screen
// hex detail screen (Viking Realm.dc.html's `sel` overlay): art on the left,
// name/level/description/action on the right.
import { computed, ref } from 'vue';
import type { Tile } from '../../lib/map/types';
import type { ResourceLine } from '../../api/types';
import { useWorldStore } from '../../stores/world';
import {
  BOOST_TERRAIN,
  buildingStatsFor,
  buildingUpgradeCost,
  isNearAnyOf,
  matchingNeighbourCount,
  type BuildingKind,
} from '../../lib/map/buildingEconomy';

const world = useWorldStore();

import { buildingArt, terrainArt } from '../../lib/map/buildingArt';

const props = defineProps<{
  tile: Tile;
  mine: boolean;
  ownerLabel: string | null;
  busy: boolean;
}>();
const emit = defineEmits<{ close: []; build: []; upgrade: [] }>();

// Issue #53: shrine slots by level, mirroring ShrineCatalogue.Slots.cs.
function shrineSlotsFor(level: number): number {
  const clamped = Math.min(Math.max(level, 1), 5);
  if (clamped >= 5) return 3;
  if (clamped >= 3) return 2;
  return 1;
}

const RUNE_TYPE_LABELS: Record<string, string> = {
  fehu: 'Fehu',
  jera: 'Jera',
  othala: 'Othala',
};
const RUNE_RARITY_LABELS: Record<string, string> = {
  carved: 'Carved',
  bound: 'Bound',
  blooded: 'Blooded',
};

const isShrine = computed(
  () => props.tile.buildingType === 'shrineofthor' || props.tile.buildingType === 'shrineoffreyja',
);
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
    runeError.value = 'Could not slot that rune — it may already be slotted, or this shrine has no free slot.';
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
    runeError.value = 'Could not unslot that rune.';
  } finally {
    runeBusy.value = false;
  }
}

const BUILDING_NAMES: Record<string, string> = {
  hut: 'Hut',
  farm: 'Farm',
  tower: 'Watchtower',
  longhouse: 'Longhouse',
  fishinghut: 'Fishing Hut',
  magictower: 'Magic Tower',
  pumpkinfarm: 'Pumpkin Farm',
  shrineofthor: 'Shrine of Thor',
  shrineoffreyja: 'Shrine of Freyja',
  lumberjack: 'Lumberjack',
  quarry: 'Quarry',
};

const TERRAIN_NAMES: Record<string, string> = {
  grass: 'Grassland',
  forest: 'Forest',
  mountain: 'Mountain',
  sand: 'Shore',
  sea: 'Open water',
};

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
  props.tile.buildingType ? BUILDING_NAMES[props.tile.buildingType] : TERRAIN_NAMES[props.tile.terrain],
);
const sub = computed(() => {
  if (!props.tile.buildingType) return props.mine ? 'Empty, claimed ground' : (props.ownerLabel ?? 'Unclaimed');
  return props.ownerLabel ?? 'Wild ruin';
});
const level = computed(() => props.tile.buildingLevel ?? 0);

// Same terrain-adjacency helpers hoverInfoFor/buildingStats uses in
// HexMapRenderer.ts, so the modal's "current stats" match whatever the hover
// tooltip just showed.
const getTile = (q: number, r: number): Tile => world.model.getTile(q, r);
const nearWater = computed(() => isNearAnyOf(props.tile, ['sea', 'sand'], getTile));
const matchingNeighbours = computed(() => {
  const boostTerrain = props.tile.buildingType ? BOOST_TERRAIN[props.tile.buildingType] : undefined;
  return boostTerrain ? matchingNeighbourCount(props.tile, boostTerrain, getTile) : 0;
});

// The existing building's current-level output/modifier/workers — undefined
// (and hidden) for an empty tile, since there's nothing standing yet.
const currentStats = computed(() =>
  props.tile.buildingType
    ? buildingStatsFor(props.tile.buildingType, level.value, nearWater.value, matchingNeighbours.value)
    : undefined,
);

// "hut" is the fixed default a fresh build here places (see
// SettlementView.vue's build()); an existing building instead costs its own
// next level.
const upgradeType = computed<BuildingKind>(() => props.tile.buildingType ?? 'hut');
const upgradeLevel = computed(() => level.value + 1);
const upgradeCost = computed<ResourceLine>(() => buildingUpgradeCost(upgradeType.value, upgradeLevel.value));

const RESOURCE_LABELS: Record<keyof ResourceLine, string> = {
  wood: 'Wood',
  stone: 'Stone',
  food: 'Food',
  iron: 'Iron',
};
const costLine = computed(() =>
  (Object.keys(upgradeCost.value) as (keyof ResourceLine)[])
    .filter((key) => upgradeCost.value[key] > 0)
    .map((key) => `${upgradeCost.value[key]} ${RESOURCE_LABELS[key]}`)
    .join(' · '),
);
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="modal panel">
      <div class="art">
        <img :src="art" alt="" />
        <span class="coord">Hex {{ tile.q }}, {{ tile.r }}</span>
      </div>
      <div class="body">
        <div class="head">
          <div>
            <div class="name">{{ name }}</div>
            <div class="sub">{{ level > 0 ? `Level ${level} · ${sub}` : sub }}</div>
          </div>
          <button class="close" @click="emit('close')">✕</button>
        </div>

        <p v-if="!mine && tile.buildingType" class="desc">
          Held by another jarl. You cannot build or upgrade here.
        </p>
        <p v-else-if="!mine" class="desc">Outside your realm's border — claim more land to build here.</p>
        <p v-else-if="!buildable" class="desc">Open water. No building can stand here.</p>
        <p v-else class="desc">
          {{
            tile.buildingType
              ? 'Raise this building further to grow what it produces for your settlement.'
              : 'Empty ground inside your border. Raise a building here to put it to work.'
          }}
        </p>

        <dl v-if="currentStats && (currentStats.output || currentStats.modifier || currentStats.workers)" class="stats">
          <template v-if="currentStats.output">
            <dt>Output</dt>
            <dd>{{ currentStats.output }}</dd>
          </template>
          <template v-if="currentStats.modifier">
            <dt>Modifier</dt>
            <dd>{{ currentStats.modifier }}</dd>
          </template>
          <template v-if="currentStats.workers">
            <dt>Workers</dt>
            <dd>{{ currentStats.workers }}</dd>
          </template>
        </dl>

        <div v-if="isShrine && mine && shrineBuilt" class="runes">
          <div class="runes-head">
            Runes: {{ slottedRunes.length }} / {{ shrineSlots }} slotted
          </div>
          <p v-if="runeError" class="rune-error">{{ runeError }}</p>

          <ul v-if="slottedRunes.length" class="rune-list">
            <li v-for="rune in slottedRunes" :key="rune.id">
              <span>{{ RUNE_TYPE_LABELS[rune.type] ?? rune.type }} ({{ RUNE_RARITY_LABELS[rune.rarity] ?? rune.rarity }})</span>
              <button class="ghost" :disabled="runeBusy" @click="unslot(rune.id)">Unslot</button>
            </li>
          </ul>

          <template v-if="storedRunes.length">
            <div class="runes-head">In storage</div>
            <ul class="rune-list">
              <li v-for="rune in storedRunes" :key="rune.id">
                <span>{{ RUNE_TYPE_LABELS[rune.type] ?? rune.type }} ({{ RUNE_RARITY_LABELS[rune.rarity] ?? rune.rarity }})</span>
                <button
                  class="ghost"
                  :disabled="runeBusy || slottedRunes.length >= shrineSlots"
                  @click="slotHere(rune.id)"
                >
                  Slot here
                </button>
              </li>
            </ul>
          </template>
        </div>

        <div v-if="mine && buildable" class="actions">
          <div class="cost">{{ tile.buildingType ? 'Upgrade cost' : 'Build cost' }}: {{ costLine }}</div>
          <button v-if="tile.buildingType" class="primary" :disabled="busy" @click="emit('upgrade')">
            {{ busy ? 'Queuing…' : `Upgrade to level ${level + 1}` }}
          </button>
          <button v-else class="primary" :disabled="busy" @click="emit('build')">
            {{ busy ? 'Queuing…' : 'Build here' }}
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
.art img {
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
.cost {
  margin-bottom: 10px;
  font-size: 13px;
  color: var(--gold);
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
