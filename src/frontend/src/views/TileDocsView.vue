<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import AtlasSprite from '../components/AtlasSprite.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import { coastalWaterArt, riverArt, terrainArt, terrainArtByFamily, type ArtRef } from '../lib/map/buildingArt';
import type { AtlasFrameRect } from '../lib/map/atlas';

const catalogue = useBuildingCatalogueStore();
const { t, te, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

onMounted(() => catalogue.load());

// A river shape has no `Terrain`/`AllowedTerrain` entry of its own — its art
// fully replaces whatever land it flows over (see WorldModel's `river`
// rendering branch) — so it gets one entry with a shape picker below rather
// than being folded into the terrain list.
const RIVER_SHAPES = ['spring', 'straight', 'bend', 'bend60', 'confluence'] as const;
type RiverShape = (typeof RIVER_SHAPES)[number];
const riverShape = ref<RiverShape>('straight');

// The pack shipped alternate art for four of the five shapes above — not a
// different connectivity, just a different picture for the same crossing
// (VanDooProject/3d_assets' asset-inventory.md: "the number in these names
// is the family's turn-through angle... not the shape of its own channel").
// `Confluence` is the one exception: `ywide` is a genuinely different
// junction (three arms 120° apart each) rather than a reskin of `y_narrow`'s
// asymmetric one — still offered as a "look" here for a consistent picker,
// but see routing.ts's `confluenceOrientationOf` for where that distinction
// actually matters (which real in-game confluences each family can render).
const RIVER_LOOKS: Partial<Record<RiverShape, { id: string; family: string; labelKey: string }[]>> = {
  straight: [
    { id: 'plain', family: 'rivertile', labelKey: 'docs.tiles.riverLooks.plain' },
    { id: 'island', family: 'rivertile_bend180_island', labelKey: 'docs.tiles.riverLooks.island' },
    { id: 'meander', family: 'rivertile_bend180_meander', labelKey: 'docs.tiles.riverLooks.meander' },
  ],
  bend: [
    { id: 'plain', family: 'rivertile_bend', labelKey: 'docs.tiles.riverLooks.plain' },
    { id: 'island', family: 'rivertile_bend120_island', labelKey: 'docs.tiles.riverLooks.island' },
    { id: 'meander', family: 'rivertile_bend120_meander', labelKey: 'docs.tiles.riverLooks.meander' },
  ],
  bend60: [
    { id: 'plain', family: 'rivertile_bend60', labelKey: 'docs.tiles.riverLooks.plain' },
    { id: 'loop', family: 'rivertile_bend60_loop', labelKey: 'docs.tiles.riverLooks.loop' },
  ],
  confluence: [
    { id: 'narrow', family: 'rivertile_y_narrow', labelKey: 'docs.tiles.riverLooks.narrow' },
    { id: 'wide', family: 'rivertile_ywide', labelKey: 'docs.tiles.riverLooks.wide' },
  ],
};
const riverLook = ref<string>('');

function riverLooksFor(shape: RiverShape) {
  return RIVER_LOOKS[shape] ?? [];
}
function selectedRiverLookId(shape: RiverShape): string {
  return riverLook.value || riverLooksFor(shape)[0]?.id || '';
}
const riverShapeArt = computed<ArtRef>(() => {
  const looks = riverLooksFor(riverShape.value);
  if (looks.length > 0) {
    const look = looks.find((l) => l.id === selectedRiverLookId(riverShape.value)) ?? looks[0]!;
    return terrainArtByFamily(look.family);
  }
  return riverArt(riverShape.value);
});

// The pack carves a mountain hex into one of three landforms (plus the
// plain, undecorated look `terrainArt('mountain')` otherwise shows) — same
// idea as the river shape picker above, and the same landform names the
// Quarry building's own variant picker offers (TechTreeView.vue), since a
// Quarry's art sits on top of one of these.
const MOUNTAIN_VARIANTS = ['plain', 'corrie', 'saddleback', 'table'] as const;
type MountainVariant = (typeof MOUNTAIN_VARIANTS)[number];
const MOUNTAIN_FAMILY: Record<MountainVariant, string> = {
  plain: 'mountaintile',
  corrie: 'mountaintile_corrie',
  saddleback: 'mountaintile_saddleback',
  table: 'mountaintile_table',
};
const mountainVariant = ref<MountainVariant>('plain');
const mountainVariantArt = computed<ArtRef>(() => terrainArtByFamily(MOUNTAIN_FAMILY[mountainVariant.value]));

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
  mountain?: boolean;
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
  { id: 'mountain', art: terrainArt('mountain'), terrain: 'mountain', mountain: true },
  { id: 'river', art: riverArt('straight'), terrain: null, river: true },
];

/** The picture a tile's card shows — the river/mountain entries swap in whichever shape/landform is picked, everything else is static. */
function thumbArt(tile: TileEntry): ArtRef {
  if (tile.river) return riverShapeArt.value;
  if (tile.mountain) return mountainVariantArt.value;
  return tile.art;
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
</script>

<template>
  <div class="tile-docs">
    <TopBar docked :title="$t('docs.tiles.title')" caption="DOCS · TILES">
      <HudNav />
    </TopBar>
    <main class="body">
      <RouterLink to="/docs" class="breadcrumb">{{ $t('docs.backToDocs') }}</RouterLink>
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
            @click="riverShape = shape; riverLook = ''"
          >
            {{ t(`docs.tiles.riverShapes.${shape}`) }}
          </button>
        </div>

        <!-- The pack shipped more than one look for most shapes (a plain
             channel vs. one that divides round a gravel bar, or meanders, or
             loops back on itself) — a second picker, only shown for shapes
             that actually have alternates. -->
        <div v-if="tile.river && riverLooksFor(riverShape).length > 0" class="variants">
          <span class="variants-label">{{ $t('docs.tiles.riverLookLabel') }}</span>
          <button
            v-for="look in riverLooksFor(riverShape)"
            :key="look.id"
            type="button"
            class="variant-button"
            :class="{ active: selectedRiverLookId(riverShape) === look.id }"
            @click="riverLook = look.id"
          >
            {{ t(look.labelKey) }}
          </button>
        </div>

        <!-- Same idea for Mountain's landform (Plain/Corrie/Saddleback/Table) —
             the Quarry building's own variant picker sits on one of these. -->
        <div v-if="tile.mountain" class="variants">
          <span class="variants-label">{{ $t('docs.tiles.mountainVariants') }}</span>
          <button
            v-for="variant in MOUNTAIN_VARIANTS"
            :key="variant"
            type="button"
            class="variant-button"
            :class="{ active: mountainVariant === variant }"
            @click="mountainVariant = variant"
          >
            {{ t(`docs.tiles.mountainLandforms.${variant}`) }}
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
  /* Mobile-readiness audit: 100dvh tracks mobile Safari's real visible
     viewport, as a progressive enhancement over the 100vh above. */
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
  align-items: flex-end;
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
.buildings {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 4px;
  max-width: 60ch;
}
.buildings {
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
