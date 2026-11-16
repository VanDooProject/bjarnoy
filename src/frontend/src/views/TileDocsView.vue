<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import AtlasSprite from '../components/AtlasSprite.vue';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsPicker from '../components/docs/DocsPicker.vue';
import DocsTileEntry from '../components/docs/DocsTileEntry.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import {
  coastalWaterArt,
  riverArt,
  terrainArt,
  terrainArtByFamily,
  terrainVariantArt,
  type ArtRef,
} from '../lib/map/buildingArt';
import type { AtlasFrameRect } from '../lib/map/atlas';
import { buildingAllowedOnHex } from '../lib/map/ringCatalogue';

const catalogue = useBuildingCatalogueStore();
const { t, te, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

onMounted(() => catalogue.load());

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

// The sand tile's decorated looks (VanDooProject/3d_assets'
// scripts/build_sandtile.py, variant000-007), picked the same way as
// Mountain's landforms.
const SAND_LOOKS = [
  { id: 'plain', variant: null },
  { id: 'dunes', variant: 0 },
  { id: 'driftwood', variant: 1 },
  { id: 'driftwoodPile', variant: 7 },
  { id: 'boulders', variant: 2 },
  { id: 'wreck', variant: 3 },
  { id: 'whaleBones', variant: 4 },
  { id: 'boat', variant: 5 },
  { id: 'sandCastle', variant: 6 },
] as const;
type SandLook = (typeof SAND_LOOKS)[number]['id'];
const sandLook = ref<SandLook>('plain');
const sandLookArt = computed<ArtRef>(() => {
  const look = SAND_LOOKS.find((l) => l.id === sandLook.value)!;
  return look.variant === null ? terrainArt('sand') : terrainVariantArt('sandtile', look.variant);
});

// id doubles as the anchor/ToC key; terrain is the wire name a building's
// AllowedTerrain lists (see BuildingCatalogue.cs) — null for the rows that
// aren't a BuildingType terrain value on their own (sea never holds a
// building; coastal water is a Sea hex with RequiresCoastalWater instead;
// an inland lake is its own terrain, asked of `buildingAllowedOnHex`;
// river is a shape drawn over another terrain, not a terrain of its own).
interface TileEntry {
  id: string;
  art: ArtRef;
  terrain: string | null;
  coastal?: boolean;
  inlandLake?: boolean;
  river?: boolean;
  mountain?: boolean;
  sand?: boolean;
}

// Generation rules mirror WorldGenerationOptions' documented defaults
// (BeachThreshold, MountainThreshold, ForestRockiness, MountainRockiness) —
// see that file for the exact fractions if a world overrides them.
// A computed so the art fills in once the atlas manifests arrive (fetched lazily).
const TILES = computed<TileEntry[]>(() => [
  { id: 'sea', art: terrainArt('sea'), terrain: 'sea' },
  { id: 'coastal-water', art: coastalWaterArt(), terrain: null, coastal: true },
  { id: 'inland-lake', art: coastalWaterArt(), terrain: null, inlandLake: true },
  { id: 'sand', art: terrainArt('sand'), terrain: 'sand', sand: true },
  { id: 'grass', art: terrainArt('grass'), terrain: 'grass' },
  { id: 'forest', art: terrainArt('forest'), terrain: 'forest' },
  { id: 'mountain', art: terrainArt('mountain'), terrain: 'mountain', mountain: true },
  { id: 'river', art: riverArt('straight'), terrain: null, river: true },
]);

/** The picture a tile's card shows — the river/mountain/sand entries swap in whichever shape/landform/look is picked, everything else is static. */
function thumbArt(tile: TileEntry): ArtRef {
  if (tile.mountain) return mountainVariantArt.value;
  if (tile.sand) return sandLookArt.value;
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
  for (const tile of TILES.value) {
    result[tile.id] = catalogue.types
      .filter((type) => {
        const def = catalogue.byType[type]?.[0];
        // A building that can no longer be placed (the Quarry) is no longer something to build on this ground.
        if (!def || def.newPlacementDisabled) return false;
        if (tile.coastal) return def.requiresCoastalWater;
        if (tile.inlandLake) return buildingAllowedOnHex(type, { terrain: 'inlandlake', isCoastalWater: true });
        if (def.requiresCoastalWater || tile.terrain === null) return false;
        return def.allowedTerrain.length === 0 || def.allowedTerrain.includes(tile.terrain);
      })
      .map(typeLabel);
  }
  return result;
});
</script>

<template>
  <DocsPageLayout
    class="tile-docs"
    :title="$t('docs.tiles.title')"
    caption="DOCS · TILES"
    :intro="$t('docs.tiles.intro')"
  >
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

    <DocsToc
      :links="
        TILES.map((tile) => ({ href: `#${tile.id}`, label: t(`docs.tiles.entries.${tileEntryKey(tile.id)}.title`) }))
      "
    />

    <DocsTileEntry
      v-for="tile in TILES"
      :id="tile.id"
      :key="tile.id"
      :title="t(`docs.tiles.entries.${tileEntryKey(tile.id)}.title`)"
    >
      <template #thumb>
        <AtlasSprite v-if="thumbFrame(tile)" :frame="thumbFrame(tile)!" />
        <img v-else-if="thumbUrl(tile)" class="thumb-img" :src="thumbUrl(tile)!" alt="" />
      </template>
      <p class="lore">{{ t(`docs.tiles.entries.${tileEntryKey(tile.id)}.lore`) }}</p>
      <DocsAdminNote>
        <p class="generation">
          {{ $t('docs.tiles.generation') }} {{ t(`docs.tiles.entries.${tileEntryKey(tile.id)}.generation`) }}
        </p>
      </DocsAdminNote>
      <i18n-t v-if="tile.river" keypath="docs.tiles.riverNote" tag="p" class="buildings" scope="global">
        <template #link>
          <DocsPageLink to="/docs/rivers">{{ $t('docs.tiles.riverNoteLink') }}</DocsPageLink>
        </template>
      </i18n-t>
      <p v-else class="buildings">
        {{ $t('docs.tiles.buildings') }}
        <span v-if="buildingsByTile[tile.id]?.length">{{ buildingsByTile[tile.id]!.join(', ') }}</span>
        <span v-else>{{ $t('docs.tiles.none') }}</span>
      </p>

      <template #pickers>
        <!-- Same idea for Mountain's landform (Plain/Corrie/Saddleback/Table) —
             the Quarry building's own variant picker sits on one of these. -->
        <DocsPicker
          v-if="tile.mountain"
          :label="$t('docs.tiles.mountainVariants')"
          :options="
            MOUNTAIN_VARIANTS.map((variant) => ({
              value: variant,
              label: t(`docs.tiles.mountainLandforms.${variant}`),
            }))
          "
          :model-value="mountainVariant"
          @update:model-value="mountainVariant = $event"
        />

        <!-- Same idea for Sand's decorated looks (dunes, driftwood, a wreck, ...). -->
        <DocsPicker
          v-if="tile.sand"
          :label="$t('docs.tiles.sandLookLabel')"
          :options="SAND_LOOKS.map((look) => ({ value: look.id, label: t(`docs.tiles.sandLooks.${look.id}`) }))"
          :model-value="sandLook"
          @update:model-value="sandLook = $event"
        />
      </template>
    </DocsTileEntry>
  </DocsPageLayout>
</template>

<style scoped>
/* The tiles list sat 4px looser than the shared entry default. */
.tile-docs {
  --docs-entry-gap: 32px;
}
.status {
  color: var(--muted);
  font-size: 13px;
}
.status.error {
  color: #d97b6c;
}
.thumb-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.tile-docs p.buildings {
  margin-bottom: 0;
}
</style>
