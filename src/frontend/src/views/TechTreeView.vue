<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import AtlasSprite from '../components/AtlasSprite.vue';
import AnimatedBuildingSprite from '../components/AnimatedBuildingSprite.vue';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import TechTreeGraph from '../components/docs/TechTreeGraph.vue';
import type { AtlasFrameRect } from '../lib/map/atlas';
import {
  buildingArt,
  buildingArtByFamily,
  buildingLayersForType,
  buildingLayers,
  terrainArt,
  type ArtRef,
} from '../lib/map/buildingArt';
import type { MessageSchema } from '../i18n/schema';
import { HIDDEN_FROM_DOCS } from '../lib/techtree/layout';
import { prerequisitesOf } from '../lib/techtree/nodes';
import { GRAPH_CATEGORY_ORDER, graphCategoryOf } from '../lib/techtree/buildingPresentation';

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

// The same categorisation the dependency graph above draws its legend
// from (buildingPresentation.ts's GRAPH_CATEGORY_ORDER/graphCategoryOf) —
// this page used to keep its own separate, coarser copy that never
// listed the shrine types at all, so they silently fell into the generic
// "production" section here while the graph correctly grouped them under
// "Shrines". One shared table now, so this page and the graph can't drift.
const CATEGORY_LABELS: Record<(typeof GRAPH_CATEGORY_ORDER)[number], string> = {
  anchor: t('docs.techTree.categories.anchor'),
  production: t('docs.techTree.categories.production'),
  military: t('docs.techTree.categories.military'),
  logistics: t('docs.techTree.categories.logistics'),
  religion: t('docs.techTree.categories.religion'),
  water: t('docs.techTree.categories.water'),
};

// Buildings on their way out of the game are left off the page entirely —
// graph and tables both — so the docs stop advertising something a player
// shouldn't invest in. They stay in the catalogue; this is a docs-only
// omission (see HIDDEN_FROM_DOCS).
const documented = computed(() => catalogue.types.filter((t) => !HIDDEN_FROM_DOCS.includes(t)));

const categories = computed(() =>
  GRAPH_CATEGORY_ORDER.map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    types: documented.value.filter((t) => graphCategoryOf(t) === id),
  })).filter((c) => c.types.length > 0),
);

/**
 * A building's thumbnail follows the level row the pointer is over, so the
 * picture actually changes as the table below it is read — undefined means
 * "no row hovered", which shows the richest (max) level rather than one
 * hardcoded rung. Keyed by type so hovering one building's table never
 * moves another's thumbnail.
 */
const hoveredLevel = ref<Record<string, number>>({});

/**
 * Whether every building's thumbnail is shown large (roughly double the
 * long-standing 96x144 size, for a closer look at the art) — one shared
 * setting for the whole page, same as the old Normal/Large buttons, just
 * toggled by clicking any thumbnail instead of a separate control.
 */
const thumbsLarge = ref(false);

/**
 * Toggling resizes every thumbnail on the page at once, which reflows
 * everything below (and, for a thumbnail partway down the page, above) the
 * one that was clicked — left alone, the browser keeps the scroll position
 * in pixels, so the clicked thumbnail visibly jumps out from under the
 * pointer. Recording its viewport position before the resize and scrolling
 * by exactly how far it moved after Vue re-renders keeps it (and whatever
 * the reader was looking at) exactly where it was.
 */
async function toggleThumbSize(event: MouseEvent | KeyboardEvent) {
  const el = event.currentTarget as HTMLElement;
  const before = el.getBoundingClientRect().top;
  thumbsLarge.value = !thumbsLarge.value;
  await nextTick();
  window.scrollBy(0, el.getBoundingClientRect().top - before);
}

function maxLevelOf(type: string): number {
  const levels = catalogue.byType[type];
  return levels && levels.length > 0 ? levels[levels.length - 1]!.level : 1;
}

/** Hovering the picture itself previews level 0 — the art pack's own starting rung, one below the level-1 a building's first table row is (buildingArt/terrainArt fall back to the bare plot for the handful of types with no level-0 art at all). */
function hoverThumb(type: string) {
  hoveredLevel.value[type] = 0;
}
function hoverRow(type: string, level: number) {
  hoveredLevel.value[type] = level;
}
function resetThumb(type: string) {
  delete hoveredLevel.value[type];
}

/**
 * Building types with more than one art family — e.g. the Sawmill looks
 * different inland vs. next to a river or a river bend (see this page's
 * `docs.techTree.lore.sawmill` string and `textures.ts`'s `TextureKey`).
 * Only types listed here get a variant picker; everything else keeps the
 * single family `buildingArt` already resolves from the wire type.
 */
const ART_VARIANTS: Partial<Record<string, { id: string; family: string; labelKey: string }[]>> = {
  sawmill: [
    { id: 'inland', family: 'sawmill', labelKey: 'docs.techTree.sawmillVariants.inland' },
    { id: 'river', family: 'sawmillriver', labelKey: 'docs.techTree.sawmillVariants.river' },
    { id: 'bend', family: 'sawmillbend', labelKey: 'docs.techTree.sawmillVariants.bend' },
  ],
  // The two mountain landforms the pack carves a quarry into.
  quarry: [
    { id: 'corrie', family: 'quarry_corrie', labelKey: 'docs.techTree.quarryVariants.corrie' },
    { id: 'saddleback', family: 'quarry_saddleback', labelKey: 'docs.techTree.quarryVariants.saddleback' },
  ],
};

const selectedVariant = ref<Record<string, string>>({});

function variantsOf(type: string) {
  return ART_VARIANTS[type] ?? [];
}

function selectedVariantId(type: string): string {
  return selectedVariant.value[type] ?? variantsOf(type)[0]?.id ?? '';
}

function thumbArt(type: string): ArtRef {
  const level = hoveredLevel.value[type] ?? maxLevelOf(type);
  const variants = variantsOf(type);
  if (variants.length > 0) {
    const variant = variants.find((v) => v.id === selectedVariantId(type)) ?? variants[0]!;
    return buildingArtByFamily(variant.family, level) ?? terrainArt('grass');
  }
  return buildingArt(type, level) ?? terrainArt('grass');
}

// Split into two lookups (rather than exposing one ArtRef-keyed function) so
// the template doesn't need to narrow a discriminated union through a call.
function thumbFrame(type: string): AtlasFrameRect | null {
  const a = thumbArt(type);
  return a.kind === 'atlas' ? a.frame : null;
}
function thumbUrl(type: string): string | null {
  const a = thumbArt(type);
  return a.kind === 'png' ? a.url : null;
}

/**
 * A moving part (waterwheel, walk cycle, smoke) beats the flattened
 * `showcase` picture `thumbArt` otherwise shows — only set when this exact
 * type/level (and, for a type with a variant picker, the currently
 * selected variant's own family) has a `buildings-anim` clip; everything
 * else keeps the static picture, `AnimatedBuildingSprite` isn't rendered
 * at all for those.
 */
function thumbAnimatedLayers(type: string) {
  const level = hoveredLevel.value[type] ?? maxLevelOf(type);
  const variants = variantsOf(type);
  const layers =
    variants.length > 0
      ? buildingLayers((variants.find((v) => v.id === selectedVariantId(type)) ?? variants[0]!).family, level)
      : buildingLayersForType(type, level);
  return layers?.clip ? layers : undefined;
}

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
    <div class="page">
    <div class="head">
      <RouterLink to="/docs" class="breadcrumb">{{ $t('docs.backToDocs') }}</RouterLink>
      <h1>{{ $t('docs.techTree.title') }}</h1>
      <p class="intro">
        {{ $t('docs.techTree.intro') }}
      </p>
    </div>
    <div class="graph-wrap">
      <TechTreeGraph v-if="catalogue.types.length > 0" :by-type="catalogue.byType" />
    </div>
    <main class="body">
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
            <div
              class="thumb"
              :class="{ large: thumbsLarge }"
              role="button"
              tabindex="0"
              :aria-label="$t('docs.techTree.imageSize.toggle')"
              @mouseenter="hoverThumb(type)"
              @mouseleave="resetThumb(type)"
              @click="toggleThumbSize($event)"
              @keydown.enter="toggleThumbSize($event)"
              @keydown.space.prevent="toggleThumbSize($event)"
            >
              <AnimatedBuildingSprite v-if="thumbAnimatedLayers(type)" :layers="thumbAnimatedLayers(type)!" />
              <AtlasSprite v-else-if="thumbFrame(type)" :frame="thumbFrame(type)!" />
              <img v-else-if="thumbUrl(type)" class="thumb-img" :src="thumbUrl(type)!" alt="" />
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
              <div v-if="variantsOf(type).length > 0" class="variants">
                <span class="variants-label">{{ $t('docs.techTree.artVariant') }}</span>
                <button
                  v-for="variant in variantsOf(type)"
                  :key="variant.id"
                  type="button"
                  class="variant-button"
                  :class="{ active: selectedVariantId(type) === variant.id }"
                  @click="selectedVariant[type] = variant.id"
                >
                  {{ $t(variant.labelKey) }}
                </button>
              </div>
            </div>
          </div>
          <div class="table-scroll">
            <table @mouseleave="resetThumb(type)">
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
                <tr v-for="def in catalogue.byType[type]" :key="def.level" @mouseenter="hoverRow(type, def.level)">
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
  </div>
</template>

<style scoped>
.tech-tree {
  width: 100%;
  height: 100vh;
  /* Mobile-readiness audit: 100dvh tracks mobile Safari's real visible
     viewport, as a progressive enhancement over the 100vh above. */
  height: 100dvh;
  overflow: auto;
  background: var(--shell);
}
/* One shared column, so the graph above and the prose below start at the
   same left edge instead of each centering itself independently (the graph
   is wider than 90ch, so two independent auto-margins landed at two
   different left edges). */
.page {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 28px;
}
/* The graph is wider than the prose column, and wider than most windows —
   it gets the full page width and scrolls sideways inside itself. */
.head {
  max-width: 90ch;
  padding-top: 24px;
  color: var(--text);
}
.graph-wrap {
  padding-top: 24px;
}
.body {
  max-width: 90ch;
  padding: 24px 0 60px;
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
  align-items: flex-end;
  justify-content: center;
  flex: none;
  width: 96px;
  height: 144px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--panel, #1c1710);
  border: 1px solid var(--panel-border);
  cursor: pointer;
}
.thumb:hover,
.thumb:focus-visible {
  border-color: var(--gold);
  outline: none;
}
.thumb.large {
  width: 176px;
  height: 264px;
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
.variants {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 8px;
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
