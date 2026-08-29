<script setup lang="ts">
// zip 9: "Hex interaction | Hover = stats tooltip · Click = full-screen
// building screen" — this is the click half. Replaces the old
// instant-build-on-click in SettlementView.vue with the mockup's full-screen
// hex detail screen (Viking Realm.dc.html's `sel` overlay): art on the left,
// name/level/description/action on the right.
import { computed } from 'vue';
import type { Tile } from '../../lib/map/types';
import type { ResourceLine } from '../../api/types';
import { useWorldStore } from '../../stores/world';
import { hexesInRadius } from '../../lib/hex/coords';
import { buildingStatsFor, buildingUpgradeCost, type BuildingKind } from '../../lib/map/buildingEconomy';

const world = useWorldStore();

import grassUrl from '../../../vendor/bg_assets_hextile/hextiles/grasstile_SE.png';
import forestUrl from '../../../vendor/bg_assets_hextile/hextiles/foresttile_SE.png';
import mountainUrl from '../../../vendor/bg_assets_hextile/hextiles/mountaintile_SE.png';
import sandUrl from '../../../vendor/bg_assets_hextile/hextiles/sandtile_SE.png';
import fishinghutUrl from '../../../vendor/bg_assets_hextile/hextiles/fishinghutbuilding_SE.png';
import magictowerUrl from '../../../vendor/bg_assets_hextile/hextiles/magictower_SE.png';

const props = defineProps<{
  tile: Tile;
  mine: boolean;
  ownerLabel: string | null;
  busy: boolean;
}>();
const emit = defineEmits<{ close: []; build: []; upgrade: [] }>();

// Each building's art family ships one composited (base+props already
// merged) image per level, e.g. `vikinghut_SE_level000.png` ..
// `vikinghut_SE_level004.png` — always the `_SE` rotation, matching the
// fixed camera angle this modal has always rendered at. Indexed by level
// number so the art actually changes as a building is upgraded, instead of
// pinning one hardcoded level per building type (the previous bug: every
// building — longhouse included, which reused hut art — always showed
// whichever single level had been hand-picked as its import).
const BUILDING_ART_FAMILIES: Record<string, string> = {
  hut: 'vikinghut',
  longhouse: 'vikinghut',
  farm: 'farm_crop',
  tower: 'towerbuilding',
  pumpkinfarm: 'farm_pumpkin',
};

// fishinghut/magictower have no level suffix at all — a single composited
// image per building, unlike the families above.
const SINGLE_LEVEL_ART: Record<string, string> = {
  fishinghut: fishinghutUrl,
  magictower: magictowerUrl,
};

const LEVEL_RE = /_level(\d{3})\.png$/;
const buildingArtModules = import.meta.glob(
  '../../../vendor/bg_assets_hextile/hextiles/{vikinghut,farm_crop,towerbuilding,farm_pumpkin}_SE_level*.png',
  { eager: true, import: 'default' },
) as Record<string, string>;

const artByPrefix: Record<string, string[]> = {};
for (const [path, url] of Object.entries(buildingArtModules)) {
  const level = LEVEL_RE.exec(path);
  if (!level) continue;
  const prefix = path.slice(path.lastIndexOf('/') + 1, path.indexOf('_SE_level'));
  (artByPrefix[prefix] ??= [])[Number(level[1])] = url;
}
const BUILDING_ART_BY_LEVEL: Record<string, string[]> = {};
for (const [key, prefix] of Object.entries(BUILDING_ART_FAMILIES)) {
  BUILDING_ART_BY_LEVEL[key] = artByPrefix[prefix] ?? [];
}

const TERRAIN_ART: Record<string, string> = {
  grass: grassUrl,
  forest: forestUrl,
  mountain: mountainUrl,
  sand: sandUrl,
};

const BUILDING_NAMES: Record<string, string> = {
  hut: 'Hut',
  farm: 'Farm',
  tower: 'Watchtower',
  longhouse: 'Longhouse',
  fishinghut: 'Fishing Hut',
  magictower: 'Magic Tower',
  pumpkinfarm: 'Pumpkin Farm',
};

const TERRAIN_NAMES: Record<string, string> = {
  grass: 'Grassland',
  forest: 'Forest',
  mountain: 'Mountain',
  sand: 'Shore',
  sea: 'Open water',
};

/** Same fallback as `textures.ts`'s `clampIndex`: a level beyond this building's art rungs renders at the richest one it has. */
function artForLevel(levels: string[], level: number): string {
  const clamped = Math.min(Math.max(level, 0), levels.length - 1);
  return levels[clamped];
}

const art = computed(() => {
  const { buildingType, buildingLevel, terrain } = props.tile;
  if (buildingType) {
    if (SINGLE_LEVEL_ART[buildingType]) return SINGLE_LEVEL_ART[buildingType];
    const levels = BUILDING_ART_BY_LEVEL[buildingType];
    if (levels?.length) return artForLevel(levels, buildingLevel ?? 1);
  }
  return TERRAIN_ART[terrain] ?? grassUrl;
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

// Same irrigation check hoverInfoFor/buildingStats uses in HexMapRenderer.ts,
// so the modal's "current stats" match whatever the hover tooltip just showed.
const nearWater = computed(() =>
  hexesInRadius({ q: props.tile.q, r: props.tile.r }, 1).some((c) => {
    const t = world.model.getTile(c.q, c.r);
    return t.terrain === 'sea' || t.terrain === 'sand';
  }),
);

// The existing building's current-level output/modifier/workers — undefined
// (and hidden) for an empty tile, since there's nothing standing yet.
const currentStats = computed(() =>
  props.tile.buildingType ? buildingStatsFor(props.tile.buildingType, level.value, nearWater.value) : undefined,
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
</style>
