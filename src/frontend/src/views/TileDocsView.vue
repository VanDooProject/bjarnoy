<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import AtlasSprite from '../components/AtlasSprite.vue';
import { findAtlasFrame, type AtlasFrameRect } from '../lib/map/atlas';
import LocaleSwitcher from '../components/LocaleSwitcher.vue';

const router = useRouter();
const catalogue = useBuildingCatalogueStore();
const { t, te, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

onMounted(() => catalogue.load());

// The `showcase` atlas category has one higher-res, pre-composited
// (base + top decoration already merged) image per terrain family — the
// same art HexMapRenderer draws the map with, reused here rather than
// duplicated, so a thumbnail is never out of sync with the game. Grass and
// forest use their decorated variant so the picture matches what the tile
// looks like in-game, not the bare base layer.
function showcaseTile(family: string, decorated: boolean): AtlasFrameRect {
  const frame = decorated
    ? findAtlasFrame('showcase', `${family}_SE_variant000`)
    : (findAtlasFrame('showcase', `${family}_SE`) ?? findAtlasFrame('showcase', `${family}_SE_level000`));
  if (!frame) throw new Error(`TileDocsView: no showcase frame for "${family}"`);
  return frame;
}

// id doubles as the anchor/ToC key; terrain is the wire name a building's
// AllowedTerrain lists (see BuildingCatalogue.cs) — null for the two rows
// that aren't a BuildingType terrain value on their own (sea never holds a
// building; coastal water is a Sea hex with RequiresCoastalWater instead).
interface TileEntry {
  id: string;
  art: AtlasFrameRect;
  terrain: string | null;
  coastal?: boolean;
}

// Generation rules mirror WorldGenerationOptions' documented defaults
// (BeachThreshold, MountainThreshold, ForestRockiness, MountainRockiness) —
// see that file for the exact fractions if a world overrides them.
const TILES: TileEntry[] = [
  { id: 'sea', art: showcaseTile('watertile', false), terrain: 'sea' },
  { id: 'coastal-water', art: showcaseTile('coastalwatertile', false), terrain: null, coastal: true },
  { id: 'sand', art: showcaseTile('sandtile', false), terrain: 'sand' },
  { id: 'grass', art: showcaseTile('grasstile', true), terrain: 'grass' },
  { id: 'forest', art: showcaseTile('foresttile', true), terrain: 'forest' },
  { id: 'mountain', art: showcaseTile('mountaintile', false), terrain: 'mountain' },
];

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
    <header class="topbar">
      <span class="brand">{{ $t('common.brand.name') }}</span>
      <div class="topbar-actions">
        <LocaleSwitcher />
        <button class="back" @click="router.push('/docs')">{{ $t('docs.backToDocs') }}</button>
      </div>
    </header>
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
            <AtlasSprite :frame="tile.art" />
          </div>
          <div class="tile-intro">
            <h2>{{ t(`docs.tiles.entries.${tileEntryKey(tile.id)}.title`) }}</h2>
            <p class="lore">{{ t(`docs.tiles.entries.${tileEntryKey(tile.id)}.lore`) }}</p>
            <p class="generation">
              {{ $t('docs.tiles.generation') }} {{ t(`docs.tiles.entries.${tileEntryKey(tile.id)}.generation`) }}
            </p>
            <p class="buildings">
              {{ $t('docs.tiles.buildings') }}
              <span v-if="buildingsByTile[tile.id]?.length">{{ buildingsByTile[tile.id]!.join(', ') }}</span>
              <span v-else>{{ $t('docs.tiles.none') }}</span>
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
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
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
