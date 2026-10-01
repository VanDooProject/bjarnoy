<script setup lang="ts">
import { reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import MobileHudDrawer from '../components/hud/MobileHudDrawer.vue';
import AtlasSprite from '../components/AtlasSprite.vue';
import BogIsland from '../components/docs/BogIsland.vue';
import { findAtlasFrame, type AtlasFrameRect } from '../lib/map/atlas';
import { TILE_ORIENTATIONS, type TileOrientation } from '../lib/map/types';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// The bog set (3D_assets hextile109-119 plus the Clay Brickworks moved onto
// bog ground; that repo's docs/bog-tiles.md is the source of truth, and
// docs/design/bog.md here is the game side). How many looks and levels each
// family has is read off the showcase atlas, not typed out here, so a new
// variant shows up with the next art drop.

function showcase(name: string): AtlasFrameRect | undefined {
  return findAtlasFrame('showcase', name);
}

/** `''` for the plain look plus every `_variantNNN` the atlas has for this terrain family. */
function looksOf(family: string): string[] {
  const looks = [''];
  for (let i = 1; i < 20; i++) {
    const suffix = `_variant${String(i).padStart(3, '0')}`;
    if (showcase(`${family}_SE${suffix}`)) looks.push(suffix);
  }
  return looks;
}

/** Every `levelNNN` the atlas has for this building family. */
function levelsOf(family: string): number[] {
  const levels: number[] = [];
  for (let i = 0; i < 20 && showcase(`${family}_SE_level${String(i).padStart(3, '0')}`); i++) levels.push(i);
  return levels;
}

// --- Entries -------------------------------------------------------------

// Every entry is one tile (or one building) with its own picture and pickers, laid out like docs/tiles: a thumbnail
// beside the name and text, the pickers underneath. `family` is the showcase atlas family; ground and water entries
// pick a look, buildings a stage, and each has its own camera.

// Look names follow the variant order in 3D_assets' docs/bog-tiles.md.
const GROUND_LOOKS = ['plain', 'mire1', 'mire2', 'mire3', 'oreSeep', 'fen', 'peat', 'copse', 'seepChain'] as const;

const WATER_SHAPES = [
  { id: 'creek', family: 'bogcreek' },
  { id: 'creekBend', family: 'bogcreek_bend' },
  { id: 'spring', family: 'bogcreek_spring' },
  { id: 'lake', family: 'boglake' },
  { id: 'inlet', family: 'boglake_inlet' },
  { id: 'shore', family: 'boglake_shore' },
  { id: 'half', family: 'boglake_half' },
  { id: 'mouth', family: 'boglake_mouth' },
] as const;

const BUILDINGS = [
  { id: 'bogoreworks', family: 'bogoreworks' },
  { id: 'fisherhut', family: 'fisherhut_lake' },
  { id: 'hammerschmiede', family: 'hammerschmiede' },
  { id: 'claybrickworks', family: 'claybrickworks' },
] as const;

interface Entry {
  /** Anchor id, also the key of the entry's picker state. */
  id: string;
  group: 'ground' | 'water' | 'buildings';
  family: string;
  /** `''` for the plain look plus every `_variantNNN` the atlas has (empty for a building). */
  looks: string[];
  /** Every `levelNNN` the atlas has (empty for a ground or water tile). */
  levels: number[];
}

const ENTRIES: Entry[] = [
  {
    id: 'ground',
    group: 'ground',
    family: 'bog',
    looks: looksOf('bog'),
    levels: [],
  },
  ...WATER_SHAPES.map((s) => ({
    id: s.id,
    group: 'water' as const,
    family: s.family,
    looks: looksOf(s.family),
    levels: [],
  })),
  ...BUILDINGS.map((b) => ({
    id: b.id,
    group: 'buildings' as const,
    family: b.family,
    looks: [],
    levels: levelsOf(b.family),
  })),
];

const GROUPS = ['ground', 'water', 'buildings'] as const;
const entriesIn = (group: Entry['group']) => ENTRIES.filter((e) => e.group === group);

const view = reactive(
  Object.fromEntries(
    ENTRIES.map((e) => [
      e.id,
      {
        // The ground opens on the first decorated look; a building on its last, finished stage.
        look: e.group === 'ground' ? Math.min(1, e.looks.length - 1) : 0,
        level: e.levels.at(-1) ?? 0,
        camera: 'SE' as TileOrientation,
      },
    ]),
  ) as Record<string, { look: number; level: number; camera: TileOrientation }>,
);

function frameOf(entry: Entry): AtlasFrameRect | undefined {
  const { look, level, camera } = view[entry.id]!;
  if (entry.group === 'buildings') return showcase(`${entry.family}_${camera}_level${String(level).padStart(3, '0')}`);
  return showcase(`${entry.family}_${camera}${entry.looks[look] ?? ''}`);
}

function lookName(entry: Entry, i: number): string {
  if (entry.group !== 'ground') return String(i + 1);
  const key = GROUND_LOOKS[i];
  return key ? t(`docs.bogLands.ground.looks.${key}`) : String(i + 1);
}

function keyPrefix(entry: Entry): string {
  return entry.group === 'water' ? 'docs.bogLands.water.shapes' : 'docs.bogLands.buildings';
}
function titleOf(entry: Entry): string {
  return entry.group === 'ground' ? t('docs.bogLands.ground.heading') : t(`${keyPrefix(entry)}.${entry.id}.name`);
}
function textOf(entry: Entry): string {
  return entry.group === 'ground' ? t('docs.bogLands.ground.body') : t(`${keyPrefix(entry)}.${entry.id}.body`);
}
</script>

<template>
  <div class="bog-lands">
    <TopBar docked :title="$t('docs.bogLands.title')" caption="DOCS · BOG LANDS">
      <HudNav />
      <template #drawer="{ close }">
        <MobileHudDrawer @close="close" />
      </template>
    </TopBar>
    <main class="body docs-scale">
      <RouterLink to="/docs" class="breadcrumb">{{ $t('docs.backToDocs') }}</RouterLink>
      <h1>{{ $t('docs.bogLands.title') }}</h1>
      <p class="intro">{{ $t('docs.bogLands.intro') }}</p>
      <p class="status">{{ $t('docs.bogLands.status') }}</p>

      <nav class="toc" :aria-label="$t('docs.status.toc')">
        <a v-for="entry in ENTRIES" :key="entry.id" class="toc-link" :href="`#${entry.id}`">{{ titleOf(entry) }}</a>
        <a class="toc-link" href="#example-map">{{ $t('docs.bogLands.example.heading') }}</a>
        <a class="toc-link" href="#map-rules">{{ $t('docs.bogLands.rules.heading') }}</a>
      </nav>

      <template v-for="group in GROUPS" :key="group">
        <h2 class="group-heading">
          {{ $t(`docs.bogLands.${group}.heading`) }}
        </h2>
        <p v-if="group !== 'ground'" class="group-body">
          {{ $t(`docs.bogLands.${group}.body`) }}
        </p>

        <section v-for="entry in entriesIn(group)" :id="entry.id" :key="entry.id" class="tile">
          <div class="tile-header">
            <div class="thumb floating-art">
              <span class="floating-art-shadow" aria-hidden="true" />
              <AtlasSprite v-if="frameOf(entry)" :frame="frameOf(entry)!" />
            </div>
            <div class="tile-intro">
              <h3>{{ titleOf(entry) }}</h3>
              <p class="lore">{{ textOf(entry) }}</p>
            </div>
          </div>
          <div v-if="entry.looks.length > 1" class="variants">
            <span class="variants-label">{{ $t('docs.bogLands.looks') }}</span>
            <button
              v-for="(suffix, i) in entry.looks"
              :key="suffix"
              type="button"
              class="variant-button"
              :class="{ active: view[entry.id]!.look === i }"
              @click="view[entry.id]!.look = i"
            >
              {{ lookName(entry, i) }}
            </button>
          </div>
          <div v-if="entry.levels.length > 1" class="variants">
            <span class="variants-label">{{ $t('docs.bogLands.stage') }}</span>
            <button
              v-for="level in entry.levels"
              :key="level"
              type="button"
              class="variant-button"
              :class="{ active: view[entry.id]!.level === level }"
              @click="view[entry.id]!.level = level"
            >
              {{ level + 1 }}
            </button>
          </div>
          <div class="variants">
            <span class="variants-label">{{ $t('docs.bogLands.camera') }}</span>
            <button
              v-for="cam in TILE_ORIENTATIONS"
              :key="cam"
              type="button"
              class="variant-button"
              :class="{ active: view[entry.id]!.camera === cam }"
              @click="view[entry.id]!.camera = cam"
            >
              {{ cam }}
            </button>
          </div>
        </section>
      </template>

      <section id="example-map" class="block">
        <h2>{{ $t('docs.bogLands.example.heading') }}</h2>
        <p class="group-body">{{ $t('docs.bogLands.example.body') }}</p>
        <BogIsland />
      </section>

      <section id="map-rules" class="block">
        <h2>{{ $t('docs.bogLands.rules.heading') }}</h2>
        <p class="group-body">{{ $t('docs.bogLands.rules.body') }}</p>
        <ol class="rules">
          <li>{{ $t('docs.bogLands.rules.waterEdges') }}</li>
          <li>{{ $t('docs.bogLands.rules.lakesApart') }}</li>
          <li>{{ $t('docs.bogLands.rules.creeks') }}</li>
          <li>{{ $t('docs.bogLands.rules.mouth') }}</li>
          <li>{{ $t('docs.bogLands.rules.weir') }}</li>
          <li>{{ $t('docs.bogLands.rules.boats') }}</li>
          <li>{{ $t('docs.bogLands.rules.river') }}</li>
          <li>{{ $t('docs.bogLands.rules.inland') }}</li>
          <li>{{ $t('docs.bogLands.rules.landing') }}</li>
        </ol>
      </section>
    </main>
  </div>
</template>

<style scoped>
.bog-lands {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: auto;
  background: var(--shell);
}
.body {
  max-width: 90ch;
  margin: 0 auto;
  padding: 24px 28px 60px;
  color: var(--text);
}
.breadcrumb {
  display: inline-block;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--muted);
  text-decoration: none;
}
.breadcrumb:hover {
  color: var(--gold);
  text-decoration: underline;
}
.intro,
.group-body {
  color: var(--muted);
  line-height: 1.6;
}
.status {
  font-size: 13px;
  border-left: 3px solid var(--gold);
  padding-left: 12px;
  color: var(--muted);
}
.toc {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-top: 20px;
  padding: 14px 18px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel, #1c1710);
}
.toc-link {
  font-size: 13px;
  color: var(--muted);
  text-decoration: none;
}
.toc-link:hover {
  color: var(--text);
  text-decoration: underline;
}
.group-heading {
  margin: 40px 0 8px;
}
.block {
  margin-top: 40px;
  scroll-margin-top: 84px;
}
.block h2 {
  margin: 0 0 8px;
}
.rules {
  color: var(--muted);
  line-height: 1.6;
  padding-left: 22px;
}
.rules li {
  margin-bottom: 6px;
}
.tile {
  margin-top: 28px;
  scroll-margin-top: 84px;
}
.tile-header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.thumb {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  flex: none;
  width: 96px;
  height: 144px;
}
.tile-intro h3 {
  margin: 0 0 4px;
}
.lore {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 4px;
  max-width: 60ch;
}
.variants {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 12px;
}
.variants-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-right: 4px;
}
.variant-button {
  background: var(--panel, #1c1710);
  border: 1px solid var(--panel-border);
  color: var(--muted);
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.variant-button:hover {
  color: var(--text);
  border-color: var(--gold);
}
.variant-button.active {
  color: #20160a;
  background: var(--gold);
  border-color: var(--gold);
}
</style>
