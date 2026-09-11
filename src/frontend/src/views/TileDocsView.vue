<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { useWorldStore } from '../stores/world';
import AtlasSprite from '../components/AtlasSprite.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import { coastalWaterArt, riverArt, terrainArt, type ArtRef } from '../lib/map/buildingArt';
import type { AtlasFrameRect } from '../lib/map/atlas';

const catalogue = useBuildingCatalogueStore();
const world = useWorldStore();
const { t, te, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

onMounted(() => catalogue.load());

// A river shape has no `Terrain`/`AllowedTerrain` entry of its own — its art
// fully replaces whatever land it flows over (see WorldModel's `river`
// rendering branch) — so it gets one entry with a shape picker below rather
// than being folded into the terrain list.
const RIVER_SHAPES = ['spring', 'straight', 'bend', 'bend60', 'confluence'] as const;
type RiverShape = (typeof RIVER_SHAPES)[number];
const riverShape = ref<RiverShape>('straight');
const riverShapeArt = computed<ArtRef>(() => riverArt(riverShape.value));

// id doubles as the anchor/ToC key; terrain is the wire name a building's
// AllowedTerrain lists (see BuildingCatalogue.cs) — null for the rows that
// aren't a BuildingType terrain value on their own (sea never holds a
// building; coastal water is a Sea hex with RequiresCoastalWater instead;
// river is a shape drawn over another terrain, not a terrain of its own).
interface TileEntry {
  id: string;
  art: ArtRef;
  terrain: string | null;
  coastal?: boolean;
  river?: boolean;
}

// Generation rules mirror WorldGenerationOptions' documented defaults
// (BeachThreshold, MountainThreshold, ForestRockiness, MountainRockiness) —
// see that file for the exact fractions if a world overrides them.
const TILES: TileEntry[] = [
  { id: 'sea', art: terrainArt('sea'), terrain: 'sea' },
  { id: 'coastal-water', art: coastalWaterArt(), terrain: null, coastal: true },
  { id: 'sand', art: terrainArt('sand'), terrain: 'sand' },
  { id: 'grass', art: terrainArt('grass'), terrain: 'grass' },
  { id: 'forest', art: terrainArt('forest'), terrain: 'forest' },
  { id: 'mountain', art: terrainArt('mountain'), terrain: 'mountain' },
  { id: 'river', art: riverArt('straight'), terrain: null, river: true },
];

/** The picture a tile's card shows — the river entry swaps in whichever shape is picked, everything else is static. */
function thumbArt(tile: TileEntry): ArtRef {
  return tile.river ? riverShapeArt.value : tile.art;
}
function thumbFrame(tile: TileEntry): AtlasFrameRect | null {
  const art = thumbArt(tile);
  return art.kind === 'atlas' ? art.frame : null;
}
function thumbUrl(tile: TileEntry): string | null {
  const art = thumbArt(tile);
  return art.kind === 'png' ? art.url : null;
}

// `docs.tiles.entries.*` keys are camelCase (existing JSON convention),
// while tile ids stay kebab-case for URL anchors — e.g. 'coastal-water'.
function tileEntryKey(id: string): string {
  return id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

function typeLabel(type: string): string {
  const key = `docs.buildingTypes.${type}`;
  return te(key) ? t(key) : type.charAt(0).toUpperCase() + type.slice(1);
}

const buildingsByTile = computed(() => {
  const result: Record<string, string[]> = {};
  for (const tile of TILES) {
    result[tile.id] = catalogue.types
      .filter((type) => {
        const def = catalogue.byType[type]?.[0];
        if (!def) return false;
        if (tile.coastal) return def.requiresCoastalWater;
        if (def.requiresCoastalWater || tile.terrain === null) return false;
        return def.allowedTerrain.length === 0 || def.allowedTerrain.includes(tile.terrain);
      })
      .map(typeLabel);
  }
  return result;
});

// Coastal water is structurally a Sea hex (tile.terrain is null, only
// tile.coastal is set — see the TileEntry field comments above), so it
// shares Sea's movement cost even though it isn't Sea's own catalogue row.
function movementTerrain(tile: TileEntry): string | null {
  return tile.coastal ? 'sea' : tile.terrain;
}

// HexPathfinder's cost tables (world.movementRules, WorldMovementResponse)
// are a >=1.0 multiplier on travel time — invert to a %-of-baseline speed
// so a docs reader sees "how much slower", not a raw multiplier. Land and
// sea are disjoint cost tables (a land terrain has no sea entry and vice
// versa), so at most one of these two returns non-null per non-river tile.
function landSpeedPercent(tile: TileEntry): number | null {
  const terrain = movementTerrain(tile);
  const cost = terrain ? world.movementRules.land[terrain] : undefined;
  return cost ? Math.round(100 / cost) : null;
}
function seaSpeedPercent(tile: TileEntry): number | null {
  const terrain = movementTerrain(tile);
  const cost = terrain ? world.movementRules.sea[terrain] : undefined;
  return cost ? Math.round(100 / cost) : null;
}
</script>

<template>
  <div class="tile-docs">
    <TopBar docked :title="$t('docs.tiles.title')" caption="DOCS · TILES">
      <HudNav />
    </TopBar>
    <main class="body">
      <h1>{{ $t('docs.tiles.title') }}</h1>
      <p class="intro">{{ $t('docs.tiles.intro') }}</p>

      <p v-if="catalogue.loading" class="status">{{ $t('docs.status.loading') }}</p>
      <p v-else-if="catalogue.error" class="status error">{{ catalogue.error }}</p>
      <p v-else-if="catalogue.source === 'fallback'" class="status">
        {{
          $t('docs.status.fallback', {
            snapshot: catalogue.generatedAt
              ? $t('docs.status.fallbackSnapshot', { date: d(new Date(catalogue.generatedAt), 'short') })
              : '',
          })
        }}
      </p>

      <nav class="toc" :aria-label="$t('docs.status.toc')">
        <a v-for="tile in TILES" :key="tile.id" class="toc-link" :href="`#${tile.id}`">{{
          t(`docs.tiles.entries.${tileEntryKey(tile.id)}.title`)
        }}</a>
      </nav>

      <section v-for="tile in TILES" :key="tile.id" :id="tile.id" class="tile">
        <div class="tile-header">
          <div class="thumb">
            <AtlasSprite v-if="thumbFrame(tile)" :frame="thumbFrame(tile)!" />
            <img v-else-if="thumbUrl(tile)" class="thumb-img" :src="thumbUrl(tile)!" alt="" />
          </div>
          <div class="tile-intro">
            <h2>{{ t(`docs.tiles.entries.${tileEntryKey(tile.id)}.title`) }}</h2>
            <p class="lore">{{ t(`docs.tiles.entries.${tileEntryKey(tile.id)}.lore`) }}</p>
            <p class="generation">
              {{ $t('docs.tiles.generation') }} {{ t(`docs.tiles.entries.${tileEntryKey(tile.id)}.generation`) }}
            </p>
            <p v-if="tile.river" class="buildings">{{ $t('docs.tiles.riverSawmillNote') }}</p>
            <p v-else class="buildings">
              {{ $t('docs.tiles.buildings') }}
              <span v-if="buildingsByTile[tile.id]?.length">{{ buildingsByTile[tile.id]!.join(', ') }}</span>
              <span v-else>{{ $t('docs.tiles.none') }}</span>
            </p>
            <p v-if="tile.river" class="movement">
              {{ $t('docs.tiles.movementRiverNote', { cost: world.movementRules.riverCrossingCost }) }}
            </p>
            <p v-else class="movement">
              {{ $t('docs.tiles.movement') }}
              <span v-if="landSpeedPercent(tile) !== null">{{
                $t('docs.tiles.movementLand', { percent: landSpeedPercent(tile) })
              }}</span>
              <span v-else-if="seaSpeedPercent(tile) !== null">{{
                $t('docs.tiles.movementSea', { percent: seaSpeedPercent(tile) })
              }}</span>
            </p>
          </div>
        </div>

        <!-- A river's picture depends on its shape (Straight/Bend/Bend60/Spring/
             Confluence — see docs/design/river-generation.md), so instead of one
             static thumbnail this is a small gallery: pick a shape, the thumbnail
             above updates to it. -->
        <div v-if="tile.river" class="variants">
          <span class="variants-label">{{ $t('docs.tiles.riverVariants') }}</span>
          <button
            v-for="shape in RIVER_SHAPES"
            :key="shape"
            type="button"
            class="variant-button"
            :class="{ active: riverShape === shape }"
            @click="riverShape = shape"
          >
            {{ t(`docs.tiles.riverShapes.${shape}`) }}
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.tile-docs {
  width: 100%;
  height: 100vh;
  overflow: auto;
  background: var(--shell);
}
.body {
  max-width: 90ch;
  margin: 0 auto;
  padding: 24px 28px 60px;
  color: var(--text);
}
.intro {
  color: var(--muted);
  line-height: 1.6;
}
.status {
  color: var(--muted);
  font-size: 13px;
}
.status.error {
  color: #d97b6c;
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
.tile {
  margin-top: 32px;
  scroll-margin-top: 84px;
}
.tile-header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 96px;
  height: 144px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--panel, #1c1710);
  border: 1px solid var(--panel-border);
}
.thumb-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.tile-intro h2 {
  margin: 0 0 4px;
}
.lore,
.generation,
.buildings,
.movement {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 4px;
  max-width: 60ch;
}
.movement {
  margin-bottom: 0;
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
