<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import AtlasSprite from '../components/AtlasSprite.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import RealmExample from '../components/docs/RealmExample.vue';
import { buildingArtByFamily } from '../lib/map/buildingArt';
import { claimRadiusForLevel } from '../lib/map/shoreline';
import { FIRST_TOWER_LONGHOUSE_LEVEL, towerLimitRows } from '../lib/docs/realmDocs';

// The realm page: what the longhouse claims, how towers push the border out, how many you may build and where they stand.
// The numbers come from the game's own functions (claimRadiusForLevel, maxTowers); the example map is drawn by the game's renderer.

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

/** A tower replaces the tile it stands on, so each ground has its own look (buildingArt.ts, buildingArtOnTile). */
const TOWER_GROUNDS = [
  { id: 'grass', family: 'stavetower' },
  { id: 'sand', family: 'stavetower_sand' },
  { id: 'forest', family: 'stavetower_forest' },
  { id: 'bog', family: 'stavetower_bog' },
] as const;
/** The tower level the picture shows. */
const TOWER_ART_LEVEL = 3;

const looks = TOWER_GROUNDS.map((g) => {
  const art = buildingArtByFamily(g.family, TOWER_ART_LEVEL);
  return { ...g, frame: art?.kind === 'atlas' ? art.frame : null, url: art?.kind === 'png' ? art.url : null };
});

const rows = towerLimitRows();

const tocLinks = computed(() =>
  ['claim', 'towers', 'count', 'where', 'giants'].map((id) => ({ href: `#${id}`, label: t(`docs.realm.${id}.heading`) })),
);
</script>

<template>
  <DocsPageLayout class="realm" :title="$t('docs.realm.title')" caption="DOCS · REALM" :intro="$t('docs.realm.intro')">
    <DocsToc :links="tocLinks" />

    <section id="claim" class="block">
      <h2>{{ $t('docs.realm.claim.heading') }}</h2>
      <i18n-t keypath="docs.realm.claim.body" tag="p" class="text" scope="global">
        <template #longhouse><BuildingLink type="longhouse" /></template>
        <template #level1>{{ claimRadiusForLevel(1) }}</template>
        <template #level2>{{ claimRadiusForLevel(2) }}</template>
      </i18n-t>
      <p class="text">{{ $t('docs.realm.claim.destroyed') }}</p>
    </section>

    <section id="towers" class="block">
      <h2>{{ $t('docs.realm.towers.heading') }}</h2>
      <i18n-t keypath="docs.realm.towers.body" tag="p" class="text" scope="global">
        <template #tower><BuildingLink type="tower" /></template>
        <template #level>{{ FIRST_TOWER_LONGHOUSE_LEVEL }}</template>
      </i18n-t>
      <ul class="rules">
        <li>{{ $t('docs.realm.towers.rules.inside') }}</li>
        <li>{{ $t('docs.realm.towers.rules.chain') }}</li>
        <li>{{ $t('docs.realm.towers.rules.cut') }}</li>
        <li>{{ $t('docs.realm.towers.rules.built') }}</li>
      </ul>
      <RealmExample />
    </section>

    <section id="count" class="block">
      <h2>{{ $t('docs.realm.count.heading') }}</h2>
      <p class="text">{{ $t('docs.realm.count.body', { level: FIRST_TOWER_LONGHOUSE_LEVEL }) }}</p>
      <div class="table-scroll">
        <table class="small" data-testid="tower-limit-table">
          <thead>
            <tr>
              <th>{{ $t('docs.realm.count.levels') }}</th>
              <th>{{ $t('docs.realm.count.towers') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.from" :data-from="row.from">
              <th scope="row" class="name">{{ row.from }}</th>
              <td class="value">{{ row.towers }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section id="where" class="block">
      <h2>{{ $t('docs.realm.where.heading') }}</h2>
      <p class="text">{{ $t('docs.realm.where.body') }}</p>
      <div class="grounds">
        <figure v-for="look in looks" :key="look.id" class="ground" :data-ground="look.id">
          <div class="ground-art">
            <AtlasSprite v-if="look.frame" :frame="look.frame" />
            <img v-else-if="look.url" :src="look.url" :alt="$t('docs.realm.where.alt', { ground: $t(`docs.realm.where.grounds.${look.id}`) })" />
          </div>
          <figcaption>{{ $t(`docs.realm.where.grounds.${look.id}`) }}</figcaption>
        </figure>
      </div>
    </section>

    <section id="giants" class="block">
      <h2>{{ $t('docs.realm.giants.heading') }}</h2>
      <p class="text">{{ $t('docs.realm.giants.body') }}</p>
    </section>
  </DocsPageLayout>
</template>

<style scoped>
.block {
  margin-top: 40px;
  scroll-margin-top: 84px;
}
.block h2 {
  margin: 0 0 8px;
}
.text {
  margin: 0 0 12px;
  line-height: 1.6;
  color: var(--muted);
}
.rules {
  margin: 0 0 16px;
  padding-left: 22px;
  line-height: 1.6;
  color: var(--muted);
}
.rules li {
  margin-bottom: 6px;
}
.table-scroll {
  overflow-x: auto;
  margin: 0 -4px 12px;
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
}
thead th {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.name {
  white-space: nowrap;
  font-weight: 600;
}
.value {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.small {
  width: auto;
}
.grounds {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 16px;
  margin-top: 16px;
}
.ground {
  margin: 0;
  padding: 12px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel, #1c1710);
  text-align: center;
}
.ground-art {
  width: 96px;
  min-height: 96px;
  margin: 0 auto;
}
.ground-art img {
  width: 100%;
}
.ground figcaption {
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
}
</style>
