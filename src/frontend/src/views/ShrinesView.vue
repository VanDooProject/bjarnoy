<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import { useBuildingCatalogueStore } from '../stores/buildingCatalogue';
import { runeRarityName, runeTypeName, terrainName } from '../i18n/catalogueNames';
import { maxLevelFor, type BuildingKind } from '../lib/map/buildingEconomy';
import { prerequisitesOf } from '../lib/techtree/nodes';
import {
  FAVOUR_LEVELS,
  MAX_EFFECT_BONUS_PERCENT,
  RUNES,
  RUNE_RARITIES,
  SHRINE_GODS,
  favourAt,
  runeSlots,
} from '../lib/docs/shrineDocs';

// The shrines page: the one-shrine rule, what each god gives, and (admin note,
// unfinished) the runes. Every number comes from the building catalogue or the
// mirrors of the backend formulas (shrineDocs.ts), not from the text.

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const catalogue = useBuildingCatalogueStore();
onMounted(() => catalogue.load());

const loaded = computed(() => SHRINE_GODS.every((g) => catalogue.byType[g.type]?.length));
const maxLevel = computed(() => maxLevelFor('shrineofthor' as BuildingKind));
/** The Longhouse level every shrine asks for (the catalogue gives the same one for each). */
const longhouseLevel = computed(() => catalogue.byType.shrineofthor?.[0]?.requiredLonghouseLevel ?? 0);

const rows = computed(() =>
  SHRINE_GODS.map((god) => {
    const first = catalogue.byType[god.type]?.[0];
    return {
      ...god,
      cells: FAVOUR_LEVELS.map((level) => ({ level, favour: favourAt(god.type, level) })),
      needs: prerequisitesOf(catalogue.byType, god.type),
      standsOn: first
        ? first.requiresCoastalWater
          ? t('docs.techTree.terrainCoastal')
          : first.allowedTerrain.length === 0
            ? t('docs.techTree.terrainAny')
            : first.allowedTerrain.map(terrainName).join(', ')
        : '',
    };
  }),
);

const slotRows = [
  { levels: '1–2', slots: runeSlots(1) },
  { levels: '3–4', slots: runeSlots(3) },
  { levels: '5', slots: runeSlots(5) },
];
</script>

<template>
  <DocsPageLayout class="shrines" :title="$t('docs.shrines.title')" caption="DOCS · SHRINES" :intro="$t('docs.shrines.intro')">
    <section id="rules" class="block">
      <h2>{{ $t('docs.shrines.rules.heading') }}</h2>
      <ul class="rules">
        <li>{{ $t('docs.shrines.rules.oneShrine') }}</li>
        <li>{{ $t('docs.shrines.rules.oneGod') }}</li>
        <i18n-t v-if="loaded" keypath="docs.shrines.rules.needs" tag="li" scope="global">
          <template #longhouse>
            <BuildingLink type="longhouse" />
          </template>
          <template #level>{{ longhouseLevel }}</template>
          <template #max>{{ maxLevel }}</template>
        </i18n-t>
      </ul>
    </section>

    <section id="gods" class="block">
      <h2>{{ $t('docs.shrines.gods.heading') }}</h2>
      <p v-if="catalogue.loading" class="muted">{{ $t('docs.status.loading') }}</p>
      <p v-else-if="catalogue.error" class="muted">{{ catalogue.error }}</p>
      <div v-if="loaded" class="table-scroll">
        <table class="gods" data-testid="gods-table">
          <thead>
            <tr>
              <th>{{ $t('docs.shrines.gods.columns.god') }}</th>
              <th>{{ $t('docs.shrines.gods.columns.favour') }}</th>
              <th v-for="level in FAVOUR_LEVELS" :key="level">{{ $t('docs.shrines.gods.columns.level', { n: level }) }}</th>
              <th>{{ $t('docs.shrines.gods.columns.needs') }}</th>
              <th>{{ $t('docs.shrines.gods.columns.standsOn') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" :data-god="row.id">
              <th scope="row" class="god"><BuildingLink :type="row.type" always /></th>
              <td class="favour">{{ $t(`docs.shrines.gods.favour.${row.id}`) }}</td>
              <td v-for="cell in row.cells" :key="cell.level" class="value">
                <template v-if="cell.favour?.kind === 'percent'">{{ $t('docs.shrines.gods.percent', { percent: cell.favour.percent }) }}</template>
                <template v-else-if="cell.favour?.kind === 'odin'">
                  <span class="line">{{ $t('docs.shrines.gods.odinTime', { percent: cell.favour.buildTimePercent }) }}</span>
                  <span class="line">{{ $t('docs.shrines.gods.odinRings', { rings: cell.favour.visionRings }) }}</span>
                </template>
              </td>
              <td class="needs">
                <template v-for="need in row.needs" :key="need.type">
                  <BuildingLink :type="need.type" /> {{ need.level }}
                </template>
              </td>
              <td>{{ row.standsOn }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <i18n-t keypath="docs.shrines.gods.costs" tag="p" class="muted" scope="global">
        <template #link>
          <RouterLink to="/docs/tech-tree">{{ $t('docs.shrines.gods.costsLink') }}</RouterLink>
        </template>
      </i18n-t>
    </section>

    <DocsAdminNote id="runes" as="section" class="block">
      <p class="wip">{{ $t('docs.shrines.runes.wip') }}</p>
      <h2>{{ $t('docs.shrines.runes.heading') }}</h2>
      <p>{{ $t('docs.shrines.runes.body') }}</p>
      <table class="small">
        <thead>
          <tr>
            <th>{{ $t('docs.shrines.runes.slots.level') }}</th>
            <th>{{ $t('docs.shrines.runes.slots.count') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in slotRows" :key="row.levels">
            <td>{{ row.levels }}</td>
            <td>{{ row.slots }}</td>
          </tr>
        </tbody>
      </table>
      <table class="small">
        <thead>
          <tr>
            <th>{{ $t('docs.shrines.runes.table.rune') }}</th>
            <th>{{ $t('docs.shrines.runes.table.gives') }}</th>
            <th v-for="rarity in RUNE_RARITIES" :key="rarity">{{ runeRarityName(rarity) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rune in RUNES" :key="rune.type">
            <td>{{ runeTypeName(rune.type) }}</td>
            <td>{{ $t(`docs.shrines.runes.effects.${rune.effect}`) }}</td>
            <td v-for="(percent, i) in rune.percent" :key="i">{{ $t('docs.shrines.gods.percent', { percent }) }}</td>
          </tr>
        </tbody>
      </table>
      <p>{{ $t('docs.shrines.runes.cap', { percent: MAX_EFFECT_BONUS_PERCENT }) }}</p>
    </DocsAdminNote>
  </DocsPageLayout>
</template>

<style scoped>
.block {
  margin-top: 32px;
  scroll-margin-top: 84px;
}
.block h2 {
  margin: 0 0 10px;
}
.rules {
  margin: 0;
  padding-left: 20px;
  line-height: 1.6;
  color: var(--muted);
}
.rules li {
  margin-bottom: 6px;
}
.muted {
  color: var(--muted);
  line-height: 1.6;
}
.muted a {
  color: var(--gold);
}
.table-scroll {
  overflow-x: auto;
  margin: 0 -4px;
  padding: 0 4px;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
th,
td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--panel-border);
  text-align: left;
  vertical-align: top;
}
thead th {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  white-space: nowrap;
}
.god {
  white-space: nowrap;
  font-weight: 600;
}
.favour {
  min-width: 180px;
  color: var(--muted);
}
.value {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.line {
  display: block;
}
.needs {
  white-space: nowrap;
}
.wip {
  display: inline-block;
  margin: 0 0 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--gold) 20%, transparent);
  color: var(--gold);
  font-size: 12px;
  font-weight: 700;
}
.small {
  width: auto;
  margin: 8px 0 12px;
}
</style>
