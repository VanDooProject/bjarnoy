<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import AtlasSprite from '../components/AtlasSprite.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import TechTreeGraph from '../components/docs/TechTreeGraph.vue';
import type { AtlasFrameRect } from '../lib/map/atlas';
import type { MessageSchema } from '../i18n/schema';
import { art } from '../lib/techtree/buildingPresentation';
import { HIDDEN_FROM_DOCS } from '../lib/techtree/layout';
import { prerequisitesOf } from '../lib/techtree/nodes';

const catalogue = useBuildingCatalogueStore();
const { t, te, n, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

onMounted(() => catalogue.load());

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
// (The dependency graph above splits these a little finer — see
// buildingPresentation.ts's GRAPH_CATEGORY_ORDER — but this page's section
// headings keep the coarser four.)
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

// Buildings on their way out of the game are left off the page entirely —
// graph and tables both — so the docs stop advertising something a player
// shouldn't invest in. They stay in the catalogue; this is a docs-only
// omission (see HIDDEN_FROM_DOCS).
const documented = computed(() => catalogue.types.filter((t) => !HIDDEN_FROM_DOCS.includes(t)));

const categories = computed(() =>
  CATEGORY_ORDER.map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    types: documented.value.filter((t) => categoryOf(t) === id),
  })).filter((c) => c.types.length > 0),
);

// Computed once per building type rather than called from the template.
// Split into two lookups (rather than one ArtRef-keyed map) so the template
// doesn't need to narrow a discriminated union through an indexed access.
const atlasThumbs = computed<Record<string, AtlasFrameRect>>(() => {
  const result: Record<string, AtlasFrameRect> = {};
  for (const type of documented.value) {
    const a = art(type);
    if (a.kind === 'atlas') result[type] = a.frame;
  }
  return result;
});
const pngThumbs = computed<Record<string, string>>(() => {
  const result: Record<string, string> = {};
  for (const type of documented.value) {
    const a = art(type);
    if (a.kind === 'png') result[type] = a.url;
  }
  return result;
});

/**
 * The buildings that must already stand before this one can go up — the same
 * rule the graph above draws, spelled out for the building's own section.
 */
function prerequisiteLabel(type: string): string | null {
  const prerequisites = prerequisitesOf(catalogue.byType, type);
  if (prerequisites.length === 0) return null;
  return prerequisites.map((p) => `${typeLabel(p.type)} level ${p.level}`).join(' and ');
}

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
  return value === 0 ? '—' : n(Math.round(value), 'integer');
}
</script>

<template>
  <div class="tech-tree">
    <TopBar docked title="Tech tree" caption="DOCS · DEPENDENCIES">
      <HudNav />
    </TopBar>
    <div class="graph-wrap">
      <TechTreeGraph v-if="catalogue.types.length > 0" :by-type="catalogue.byType" />
    </div>
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
              ? $t('docs.status.fallbackSnapshot', { date: d(new Date(catalogue.generatedAt), 'short') })
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
              <p v-if="prerequisiteLabel(type)" class="terrain">
                {{ $t('docs.techTree.needsFirst', { prerequisites: prerequisiteLabel(type) }) }}
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
/* The graph is wider than the prose column, and wider than most windows —
   it gets the full page width and scrolls sideways inside itself. */
.graph-wrap {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 28px;
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
/* Clears the docked TopBar (64px) plus a gap, so a link from the graph or
   the table of contents doesn't land underneath it. Only works because
   .tech-tree is the scroll container the sticky bar is measured against. */
.category-title {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--panel-border);
  scroll-margin-top: 84px;
}
.building {
  margin-top: 32px;
  scroll-margin-top: 84px;
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
</style>
