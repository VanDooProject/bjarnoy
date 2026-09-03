<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';

// Same submodule assets HexMapRenderer/textures.ts draw the map with —
// reused here rather than duplicated, so a thumbnail is never out of sync
// with what the terrain actually looks like in game.
import seaUrl from '../../vendor/bg_assets_hextile/hextiles/watertile_SE.png';
import coastalWaterUrl from '../../vendor/bg_assets_hextile/hextiles/coastalwatertile_SE.png';
import sandUrl from '../../vendor/bg_assets_hextile/hextiles/sandtile_SE.png';
import mountainUrl from '../../vendor/bg_assets_hextile/hextiles/mountaintile_SE.png';
import grassBaseUrl from '../../vendor/bg_assets_hextile/hextiles/base/grasstile_SE_base.png';
import grassTopUrl from '../../vendor/bg_assets_hextile/hextiles/top/grasstile_SE.png';
import forestBaseUrl from '../../vendor/bg_assets_hextile/hextiles/base/foresttile_SE_base.png';
import forestTopUrl from '../../vendor/bg_assets_hextile/hextiles/top/foresttile_SE.png';

const router = useRouter();
const catalogue = useBuildingCatalogueStore();

onMounted(() => catalogue.load());

interface TileArt {
  base: string;
  top?: string;
}

// id doubles as the anchor/ToC key; terrain is the wire name a building's
// AllowedTerrain lists (see BuildingCatalogue.cs) — null for the two rows
// that aren't a BuildingType terrain value on their own (sea never holds a
// building; coastal water is a Sea hex with RequiresCoastalWater instead).
interface TileEntry {
  id: string;
  title: string;
  art: TileArt;
  lore: string;
  generation: string;
  terrain: string | null;
  coastal?: boolean;
}

// Generation rules mirror WorldGenerationOptions' documented defaults
// (BeachThreshold, MountainThreshold, ForestRockiness, MountainRockiness) —
// see that file for the exact fractions if a world overrides them.
const TILES: TileEntry[] = [
  {
    id: 'sea',
    title: 'Sea',
    art: { base: seaUrl },
    lore: 'Open water. Nothing stands on it, and nothing is grown or mined here — it only ever separates islands.',
    generation: "Every hex outside an island's radius.",
    terrain: 'sea',
  },
  {
    id: 'coastal-water',
    title: 'Coastal water',
    art: { base: coastalWaterUrl },
    lore:
      'Still plain sea underneath — the same terrain as the open water beyond it — but close enough to the shore for a dock.',
    generation: 'A sea hex with at least one land neighbour: the ring hugging every island.',
    terrain: null,
    coastal: true,
  },
  {
    id: 'sand',
    title: 'Sand',
    art: { base: sandUrl },
    lore: "An island's beach — the coastal ring settlers actually land on when founding a settlement.",
    generation: "The outer edge of an island: beyond 82% of its radius from centre.",
    terrain: 'sand',
  },
  {
    id: 'grass',
    title: 'Grass',
    art: { base: grassBaseUrl, top: grassTopUrl },
    lore: 'Open lowland — most of a settlement is built here.',
    generation: 'Lowland too smooth to be forest and too far from the centre to be mountain.',
    terrain: 'grass',
  },
  {
    id: 'forest',
    title: 'Forest',
    art: { base: forestBaseUrl, top: forestTopUrl },
    lore: 'Lowland gone rocky enough to grow trees instead of open grass.',
    generation: 'Rockiness above the forest threshold, but not steep enough for mountain.',
    terrain: 'forest',
  },
  {
    id: 'mountain',
    title: 'Mountain',
    art: { base: mountainUrl },
    lore: 'The rockiest ground an island has.',
    generation: "Confined to an island's interior (within 40% of its radius) so ridges never form on the coast.",
    terrain: 'mountain',
  },
];

const TYPE_LABELS: Record<string, string> = {
  storagehouse: 'Storage house',
  fishinghut: 'Fishing hut',
  magictower: 'Magic tower',
  pumpkinfarm: 'Pumpkin farm',
  shrineofthor: 'Shrine of Thor',
  shrineoffreyja: 'Shrine of Freyja',
  archeryrange: 'Archery range',
  dockyard: 'Dockyard',
  greatstorehouse: 'Great storehouse',
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
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
    <header class="topbar">
      <span class="brand">Fjørdhold</span>
      <button class="back" @click="router.push('/docs')">← Docs</button>
    </header>
    <main class="body">
      <h1>Tiles</h1>
      <p class="intro">The terrain a world is made of, how it generates, and what can be built on it.</p>

      <p v-if="catalogue.loading" class="status">Loading…</p>
      <p v-else-if="catalogue.error" class="status error">{{ catalogue.error }}</p>
      <p v-else-if="catalogue.source === 'fallback'" class="status">
        Showing bundled reference data{{
          catalogue.generatedAt ? ` (snapshot from ${new Date(catalogue.generatedAt).toLocaleDateString()})` : ''
        }} — not live backend data.
      </p>

      <nav class="toc" aria-label="Table of contents">
        <a v-for="tile in TILES" :key="tile.id" class="toc-link" :href="`#${tile.id}`">{{ tile.title }}</a>
      </nav>

      <section v-for="tile in TILES" :key="tile.id" :id="tile.id" class="tile">
        <div class="tile-header">
          <div class="thumb">
            <img class="thumb-layer" :src="tile.art.base" alt="" />
            <img v-if="tile.art.top" class="thumb-layer" :src="tile.art.top" alt="" />
          </div>
          <div class="tile-intro">
            <h2>{{ tile.title }}</h2>
            <p class="lore">{{ tile.lore }}</p>
            <p class="generation">Generation: {{ tile.generation }}</p>
            <p class="buildings">
              Buildings:
              <span v-if="buildingsByTile[tile.id]?.length">{{ buildingsByTile[tile.id]!.join(', ') }}</span>
              <span v-else>none</span>
            </p>
          </div>
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
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
}
.brand {
  font-weight: 600;
  font-size: 20px;
  color: var(--text);
}
.body {
  max-width: 90ch;
  margin: 0 auto;
  padding: 0 28px 60px;
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
  scroll-margin-top: 20px;
}
.tile-header {
  display: flex;
  align-items: center;
  gap: 16px;
}
.thumb {
  position: relative;
  flex: none;
  width: 96px;
  height: 144px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--panel, #1c1710);
  border: 1px solid var(--panel-border);
}
.thumb-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
.back {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}
.back:hover {
  border-color: var(--gold);
}
</style>
