<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import AtlasSprite from '../components/AtlasSprite.vue';
import type { AtlasFrameRect } from '../lib/map/atlas';
import { buildingArt, terrainArt, type ArtRef } from '../lib/map/buildingArt';
import type { MessageSchema } from '../i18n/schema';

const router = useRouter();
const catalogue = useBuildingCatalogueStore();
const { t, te } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

onMounted(() => catalogue.load());

// Same showcase atlas art HexMapRenderer/BuildingModal/RingMenu use — reused
// here rather than duplicated, so a doc-page thumbnail is never out of sync
// with what a building actually looks like in game. Each entry is the level
// this preview shows (an upgraded building looks more built-up, so pick a
// representative rung rather than always level 1); quarry has no building
// sprite of its own (the map renders it as its terrain, mountain, with no
// distinct prop), so it falls through to `terrainArt('mountain')` below.
const PREVIEW_LEVEL: Record<string, number> = {
  longhouse: 4,
  storagehouse: 4,
  farm: 1,
  lumberjack: 2,
  tower: 0,
  pumpkinfarm: 1,
  shrineofthor: 2,
  shrineoffreyja: 2,
  archeryrange: 2,
  dockyard: 7,
  greatstorehouse: 4,
  barracks: 2,
  fisherhut: 2,
  // Flat/inland family only — same simplification buildingArt.ts's preview
  // card makes, regardless of where the actual tile sits next to a river.
  sawmill: 2,
};

function lore(type: string): string {
  const key = `docs.techTree.lore.${type}`;
  return te(key) ? t(key) : '';
}

function typeLabel(type: string): string {
  const key = `docs.buildingTypes.${type}`;
  return te(key) ? t(key) : type.charAt(0).toUpperCase() + type.slice(1);
}

// Mirrors prototypes/MECHANICS.md's building categories (anchor / production
// / military / logistics) — the closest thing this codebase has to a
// canonical grouping — rather than inventing a new taxonomy for this page.
const CATEGORY_ORDER = ['anchor', 'production', 'military', 'logistics'] as const;
type Category = (typeof CATEGORY_ORDER)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  anchor: t('docs.techTree.categories.anchor'),
  production: t('docs.techTree.categories.production'),
  military: t('docs.techTree.categories.military'),
  logistics: t('docs.techTree.categories.logistics'),
};

const CATEGORY_OF: Record<string, Category> = {
  longhouse: 'anchor',
  farm: 'production',
  pumpkinfarm: 'production',
  lumberjack: 'production',
  quarry: 'production',
  fishinghut: 'production',
  magictower: 'production',
  fisherhut: 'production',
  sawmill: 'production',
  tower: 'military',
  archeryrange: 'military',
  barracks: 'military',
  storagehouse: 'logistics',
  greatstorehouse: 'logistics',
  dockyard: 'logistics',
};

function categoryOf(type: string): Category {
  return CATEGORY_OF[type] ?? 'production';
}

const categories = computed(() =>
  CATEGORY_ORDER.map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    types: catalogue.types.filter((t) => categoryOf(t) === id),
  })).filter((c) => c.types.length > 0),
);

function art(type: string): ArtRef {
  if (type === 'quarry') return terrainArt('mountain');
  return buildingArt(type, PREVIEW_LEVEL[type] ?? 1) ?? terrainArt('grass');
}

// Computed once per building type rather than called from the template.
// Split into two lookups (rather than one ArtRef-keyed map) so the template
// doesn't need to narrow a discriminated union through an indexed access.
const atlasThumbs = computed<Record<string, AtlasFrameRect>>(() => {
  const result: Record<string, AtlasFrameRect> = {};
  for (const type of catalogue.types) {
    const a = art(type);
    if (a.kind === 'atlas') result[type] = a.frame;
  }
  return result;
});
const pngThumbs = computed<Record<string, string>>(() => {
  const result: Record<string, string> = {};
  for (const type of catalogue.types) {
    const a = art(type);
    if (a.kind === 'png') result[type] = a.url;
  }
  return result;
});

function terrainLabel(requiresCoastalWater: boolean, terrain: string[]): string {
  if (requiresCoastalWater) return t('docs.techTree.terrainCoastal');
  return terrain.length === 0 ? t('docs.techTree.terrainAny') : terrain.join(', ');
}

function humanizeSeconds(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function formatAmount(value: number): string {
  return value === 0 ? '—' : Math.round(value).toLocaleString();
}
</script>

<template>
  <div class="tech-tree">
    <header class="topbar">
      <span class="brand">{{ $t('common.brand.name') }}</span>
      <button class="back" @click="router.push('/docs')">{{ $t('docs.backToDocs') }}</button>
    </header>
    <main class="body">
      <h1>{{ $t('docs.techTree.title') }}</h1>
      <p class="intro">
        {{ $t('docs.techTree.intro') }}
      </p>

      <p v-if="catalogue.loading" class="status">{{ $t('docs.status.loading') }}</p>
      <p v-else-if="catalogue.error" class="status error">{{ catalogue.error }}</p>
      <p v-else-if="catalogue.source === 'fallback'" class="status">
        {{
          $t('docs.status.fallback', {
            snapshot: catalogue.generatedAt
              ? $t('docs.status.fallbackSnapshot', { date: new Date(catalogue.generatedAt).toLocaleDateString() })
              : '',
          })
        }}
      </p>

      <nav v-if="categories.length > 0" class="toc" :aria-label="$t('docs.status.toc')">
        <div v-for="cat in categories" :key="cat.id" class="toc-group">
          <span class="toc-category">{{ cat.label }}</span>
          <a v-for="type in cat.types" :key="type" class="toc-link" :href="`#${type}`">{{ typeLabel(type) }}</a>
        </div>
      </nav>

      <div v-for="cat in categories" :key="cat.id" class="category">
        <h2 :id="cat.id" class="category-title">{{ cat.label }}</h2>

        <section v-for="type in cat.types" :key="type" :id="type" class="building">
          <div class="building-header">
            <div class="thumb">
              <AtlasSprite v-if="atlasThumbs[type]" :frame="atlasThumbs[type]!" />
              <img v-else-if="pngThumbs[type]" class="thumb-img" :src="pngThumbs[type]" alt="" />
            </div>
            <div class="building-intro">
              <h3>{{ typeLabel(type) }}</h3>
              <p class="lore">{{ lore(type) }}</p>
              <p class="terrain">
                {{ $t('docs.techTree.terrain') }}
                {{
                  terrainLabel(
                    catalogue.byType[type]![0]!.requiresCoastalWater,
                    catalogue.byType[type]![0]!.allowedTerrain,
                  )
                }}
              </p>
            </div>
          </div>
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{{ $t('docs.techTree.table.level') }}</th>
                  <th>{{ $t('docs.techTree.table.wood') }}</th>
                  <th>{{ $t('docs.techTree.table.stone') }}</th>
                  <th>{{ $t('docs.techTree.table.food') }}</th>
                  <th>{{ $t('docs.techTree.table.iron') }}</th>
                  <th>{{ $t('docs.techTree.table.buildTime') }}</th>
                  <th>{{ $t('docs.techTree.table.productionPerHour') }}</th>
                  <th>{{ $t('docs.techTree.table.storage') }}</th>
                  <th>{{ $t('docs.techTree.table.requiresLonghouse') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="def in catalogue.byType[type]" :key="def.level">
                  <td>{{ def.level }}</td>
                  <td>{{ formatAmount(def.cost.wood) }}</td>
                  <td>{{ formatAmount(def.cost.stone) }}</td>
                  <td>{{ formatAmount(def.cost.food) }}</td>
                  <td>{{ formatAmount(def.cost.iron) }}</td>
                  <td>{{ humanizeSeconds(def.buildSeconds) }}</td>
                  <td>
                    <template v-if="Object.values(def.productionPerHour).some((v) => v > 0)">
                      <span v-if="def.productionPerHour.wood > 0"
                        >{{ formatAmount(def.productionPerHour.wood) }}{{ $t('docs.techTree.table.unitWood') }}
                      </span>
                      <span v-if="def.productionPerHour.stone > 0"
                        >{{ formatAmount(def.productionPerHour.stone) }}{{ $t('docs.techTree.table.unitStone') }}
                      </span>
                      <span v-if="def.productionPerHour.food > 0"
                        >{{ formatAmount(def.productionPerHour.food) }}{{ $t('docs.techTree.table.unitFood') }}
                      </span>
                      <span v-if="def.productionPerHour.iron > 0"
                        >{{ formatAmount(def.productionPerHour.iron) }}{{ $t('docs.techTree.table.unitIron') }}</span
                      >
                    </template>
                    <template v-else>—</template>
                  </td>
                  <td>
                    <template v-if="Object.values(def.storageCapacity).some((v) => v > 0)">
                      <span v-if="def.storageCapacity.wood > 0"
                        >{{ $t('docs.techTree.table.storagePrefix') }}{{ formatAmount(def.storageCapacity.wood) }}{{
                          $t('docs.techTree.table.unitWood')
                        }}
                      </span>
                      <span v-if="def.storageCapacity.stone > 0"
                        >{{ $t('docs.techTree.table.storagePrefix') }}{{ formatAmount(def.storageCapacity.stone) }}{{
                          $t('docs.techTree.table.unitStone')
                        }}
                      </span>
                      <span v-if="def.storageCapacity.food > 0"
                        >{{ $t('docs.techTree.table.storagePrefix') }}{{ formatAmount(def.storageCapacity.food) }}{{
                          $t('docs.techTree.table.unitFood')
                        }}
                      </span>
                      <span v-if="def.storageCapacity.iron > 0"
                        >{{ $t('docs.techTree.table.storagePrefix') }}{{ formatAmount(def.storageCapacity.iron) }}{{
                          $t('docs.techTree.table.unitIron')
                        }}</span
                      >
                    </template>
                    <template v-else>—</template>
                  </td>
                  <td>{{ def.requiredLonghouseLevel }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.tech-tree {
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
  gap: 20px 32px;
  margin-top: 20px;
  padding: 16px 18px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel, #1c1710);
}
.toc-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 10ch;
}
.toc-category {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gold);
  margin-bottom: 2px;
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
.category {
  margin-top: 44px;
}
.category-title {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--panel-border);
  scroll-margin-top: 20px;
}
.building {
  margin-top: 32px;
  scroll-margin-top: 20px;
}
.building-header {
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
.building-intro h3 {
  margin: 0 0 4px;
}
.lore {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 4px;
  max-width: 60ch;
}
.terrain {
  color: var(--muted);
  font-size: 13px;
  margin: 0;
}
.table-scroll {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  margin-top: 8px;
}
th,
td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid var(--panel-border);
  white-space: nowrap;
}
th {
  color: var(--muted);
  font-weight: 600;
  text-transform: uppercase;
  font-size: 11px;
  letter-spacing: 0.05em;
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
