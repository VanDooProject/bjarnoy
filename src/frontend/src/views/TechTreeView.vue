<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';

// Same submodule assets HexMapRenderer draws the map with (see
// lib/map/textures.ts) — reused here rather than duplicated, so a doc-page
// thumbnail is never out of sync with what a building actually looks like
// in game. Lumberjack and Quarry have no building sprite of their own (the
// map renders them as their terrain, forest/mountain, with no distinct
// prop); their thumbnails use that terrain art instead.
import towerUrl from '../../vendor/bg_assets_hextile/hextiles/towerbuilding_SE_level000.png';
import mountainUrl from '../../vendor/bg_assets_hextile/hextiles/mountaintile_SE.png';
import grassBaseUrl from '../../vendor/bg_assets_hextile/hextiles/base/grasstile_SE_base.png';
import forestBaseUrl from '../../vendor/bg_assets_hextile/hextiles/base/foresttile_SE_base.png';
import forestTopUrl from '../../vendor/bg_assets_hextile/hextiles/top/foresttile_SE.png';
import farmBaseUrl from '../../vendor/bg_assets_hextile/hextiles/base/farm_crop_SE_base.png';
import farmTopUrl from '../../vendor/bg_assets_hextile/hextiles/top/farm_crop_SE_level001.png';
import hutBaseUrl from '../../vendor/bg_assets_hextile/hextiles/base/vikinghut_SE_base.png';
import hutTopUrl from '../../vendor/bg_assets_hextile/hextiles/top/vikinghut_SE_level000.png';
import longhouseTopUrl from '../../vendor/bg_assets_hextile/hextiles/top/vikinghut_SE_level004.png';
import fishingHutUrl from '../../vendor/bg_assets_hextile/hextiles/fishinghutbuilding_SE.png';
import magicTowerUrl from '../../vendor/bg_assets_hextile/hextiles/magictower_SE.png';
import pumpkinFarmBaseUrl from '../../vendor/bg_assets_hextile/hextiles/base/farm_pumpkin_SE_base.png';
import pumpkinFarmTopUrl from '../../vendor/bg_assets_hextile/hextiles/top/farm_pumpkin_SE_level001.png';

const router = useRouter();
const catalogue = useBuildingCatalogueStore();

onMounted(() => catalogue.load());

interface BuildingArt {
  base: string;
  top?: string;
}

const ART: Record<string, BuildingArt> = {
  longhouse: { base: hutBaseUrl, top: longhouseTopUrl },
  storagehouse: { base: hutBaseUrl, top: hutTopUrl },
  farm: { base: farmBaseUrl, top: farmTopUrl },
  lumberjack: { base: forestBaseUrl, top: forestTopUrl },
  quarry: { base: mountainUrl },
  tower: { base: towerUrl },
  fishinghut: { base: fishingHutUrl },
  magictower: { base: magicTowerUrl },
  pumpkinfarm: { base: pumpkinFarmBaseUrl, top: pumpkinFarmTopUrl },
};

const LORE: Record<string, string> = {
  longhouse:
    "The heart of the settlement. Its level sets claim radius, build slots and how many settlers call the village home — every settlement starts with one, standing on grass.",
  lumberjack: 'Fells timber on forested ground — the wood behind every wall and roof.',
  quarry: 'Cuts stone from a mountain ridge — the bones of every keep.',
  farm: 'Grows food on open grassland, keeping the longhouse table full.',
  storagehouse: "Extra room for the harvest on grass, so a full warehouse never stalls production.",
  tower: 'A watch built on grass or sand at the border, pushing the claimed ground further out.',
  fishinghut: 'A dock over shallow water, fishing the shallows a farm never could.',
  magictower: 'Arcane iron out of grassland — no ore, no vein, just the working.',
  pumpkinfarm: 'A second harvest for grass — pumpkins alongside the plain fields.',
};

const TYPE_LABELS: Record<string, string> = {
  storagehouse: 'Storage house',
  fishinghut: 'Fishing hut',
  magictower: 'Magic tower',
  pumpkinfarm: 'Pumpkin farm',
};

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1);
}

// Mirrors prototypes/MECHANICS.md's building categories (anchor / production
// / military / logistics) — the closest thing this codebase has to a
// canonical grouping — rather than inventing a new taxonomy for this page.
const CATEGORY_ORDER = ['anchor', 'production', 'defense', 'logistics'] as const;
type Category = (typeof CATEGORY_ORDER)[number];

const CATEGORY_LABELS: Record<Category, string> = {
  anchor: 'Anchor',
  production: 'Production',
  defense: 'Defense',
  logistics: 'Logistics',
};

const CATEGORY_OF: Record<string, Category> = {
  longhouse: 'anchor',
  farm: 'production',
  pumpkinfarm: 'production',
  lumberjack: 'production',
  quarry: 'production',
  fishinghut: 'production',
  magictower: 'production',
  tower: 'defense',
  storagehouse: 'logistics',
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

function art(type: string): BuildingArt {
  return ART[type] ?? { base: grassBaseUrl };
}

function terrainLabel(requiresCoastalWater: boolean, terrain: string[]): string {
  if (requiresCoastalWater) return 'Shallow (coastal) water';
  return terrain.length === 0 ? 'Any buildable land' : terrain.join(', ');
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
      <span class="brand">Fjørdhold</span>
      <button class="back" @click="router.push('/docs')">← Docs</button>
    </header>
    <main class="body">
      <h1>Tech tree</h1>
      <p class="intro">
        Every building, and what each of its ten levels costs, produces, and requires.
      </p>

      <p v-if="catalogue.loading" class="status">Loading…</p>
      <p v-else-if="catalogue.error" class="status error">{{ catalogue.error }}</p>
      <p v-else-if="catalogue.source === 'fallback'" class="status">
        Showing bundled reference data{{
          catalogue.generatedAt ? ` (snapshot from ${new Date(catalogue.generatedAt).toLocaleDateString()})` : ''
        }} — not live backend data.
      </p>

      <nav v-if="categories.length > 0" class="toc" aria-label="Table of contents">
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
              <img class="thumb-layer" :src="art(type).base" alt="" />
              <img v-if="art(type).top" class="thumb-layer" :src="art(type).top" alt="" />
            </div>
            <div class="building-intro">
              <h3>{{ typeLabel(type) }}</h3>
              <p class="lore">{{ LORE[type] }}</p>
              <p class="terrain">
                Terrain:
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
                  <th>Level</th>
                  <th>Wood</th>
                  <th>Stone</th>
                  <th>Food</th>
                  <th>Iron</th>
                  <th>Build time</th>
                  <th>Production/h</th>
                  <th>Storage</th>
                  <th>Requires longhouse</th>
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
                      <span v-if="def.productionPerHour.wood > 0">{{ formatAmount(def.productionPerHour.wood) }}w </span>
                      <span v-if="def.productionPerHour.stone > 0">{{ formatAmount(def.productionPerHour.stone) }}s </span>
                      <span v-if="def.productionPerHour.food > 0">{{ formatAmount(def.productionPerHour.food) }}f </span>
                      <span v-if="def.productionPerHour.iron > 0">{{ formatAmount(def.productionPerHour.iron) }}i</span>
                    </template>
                    <template v-else>—</template>
                  </td>
                  <td>
                    <template v-if="Object.values(def.storageCapacity).some((v) => v > 0)">
                      <span v-if="def.storageCapacity.wood > 0">+{{ formatAmount(def.storageCapacity.wood) }}w </span>
                      <span v-if="def.storageCapacity.stone > 0">+{{ formatAmount(def.storageCapacity.stone) }}s </span>
                      <span v-if="def.storageCapacity.food > 0">+{{ formatAmount(def.storageCapacity.food) }}f </span>
                      <span v-if="def.storageCapacity.iron > 0">+{{ formatAmount(def.storageCapacity.iron) }}i</span>
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
