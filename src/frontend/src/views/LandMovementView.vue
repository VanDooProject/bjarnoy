<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import DocsHeroArt from '../components/docs/DocsHeroArt.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import { useUnitCatalogueStore } from '../stores/unitCatalogue';
import { terrainName, unitName } from '../i18n/catalogueNames';
import { findAtlasFrame } from '../lib/map/atlas';
import { ravensRings } from '../lib/map/buildingEconomy';
import {
  ARMY_VISION_RINGS,
  GROUND_COSTS,
  STREAM_COST,
  WALL_END_COST,
  formatMinutes,
  minutesPerHex,
  strongCampGuardRange,
} from '../lib/docs/landMovementDocs';

// The land movement page: what one hex costs an army, how fast each unit crosses it, and the rules for food, walls,
// camps and enemies on the road. Speeds come from the unit catalogue; the ground costs are mirrored from the
// pathfinder in landMovementDocs.ts.

const { t, n, locale } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const units = useUnitCatalogueStore();
onMounted(() => units.load());

const art = computed(() => findAtlasFrame('showcase', 'riverbridge_SE_level004'));

/** The columns of the pace table: each ground an army can walk, with its cost. */
const columns = [...GROUND_COSTS.map((g) => ({ id: g.terrain, cost: g.cost })), { id: 'stream', cost: STREAM_COST }];

const landUnits = computed(() => units.definitions.filter((u) => u.class !== 'ship'));
const unitRows = computed(() =>
  landUnits.value.map((u) => ({
    type: u.type,
    speed: u.speed,
    upkeep: u.upkeepPerHour,
    food: u.foodCarryCapacity,
    minutes: columns.map((c) => formatMinutes(minutesPerHex(c.cost, u.speed), String(locale.value))),
  })),
);

const spearman = computed(() => {
  const speed = units.byType.spearman?.speed;
  return speed ? formatMinutes(minutesPerHex(1, speed), String(locale.value)) : '';
});
const slowest = computed(() => {
  const list = landUnits.value;
  if (list.length === 0) return null;
  return list.reduce((a, b) => (b.speed < a.speed ? b : a));
});

const tocLinks = computed(() =>
  ['cost', 'pace', 'food', 'road', 'sight'].map((id) => ({ href: `#${id}`, label: t(`docs.landMovement.toc.${id}`) })),
);
</script>

<template>
  <DocsPageLayout class="land-movement" :title="$t('docs.landMovement.title')" caption="DOCS · LAND MOVEMENT" :intro="$t('docs.landMovement.intro')">
    <DocsHeroArt :frame="art" />

    <DocsToc :links="tocLinks" />

    <section id="cost" class="block">
      <h2>{{ $t('docs.landMovement.cost.heading') }}</h2>
      <p class="text">{{ $t('docs.landMovement.cost.body') }}</p>
      <div class="table-scroll">
        <table data-testid="ground-table">
          <thead>
            <tr>
              <th>{{ $t('docs.landMovement.cost.columns.ground') }}</th>
              <th>{{ $t('docs.landMovement.cost.columns.cost') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in GROUND_COSTS" :key="g.terrain" :data-ground="g.terrain">
              <th scope="row" class="name">{{ terrainName(g.terrain) }}</th>
              <td class="value">{{ n(g.cost) }}</td>
            </tr>
            <tr data-ground="stream">
              <th scope="row" class="name">{{ $t('docs.landMovement.cost.stream') }}</th>
              <td class="value">{{ n(STREAM_COST) }} <span class="muted">{{ $t('docs.landMovement.cost.streamNote') }}</span></td>
            </tr>
            <tr data-ground="wallEnd">
              <th scope="row" class="name">{{ $t('docs.landMovement.cost.wallEnd') }}</th>
              <td class="value">{{ n(WALL_END_COST) }} <span class="muted">{{ $t('docs.landMovement.cost.wallEndNote') }}</span></td>
            </tr>
            <tr v-for="id in ['mountain', 'sea', 'lake'] as const" :key="id" :data-ground="id">
              <th scope="row" class="name">{{ terrainName(id) }}</th>
              <td class="blocked">{{ $t('docs.landMovement.cost.blocked') }}</td>
            </tr>
            <tr data-ground="wideRiver">
              <th scope="row" class="name">{{ $t('docs.landMovement.cost.wideRiver') }}</th>
              <td class="blocked">{{ $t('docs.landMovement.cost.blocked') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <i18n-t keypath="docs.landMovement.cost.walls" tag="p" class="text" scope="global">
        <template #walls>
          <DocsPageLink to="/docs/walls">{{ $t('docs.landMovement.cost.wallsLink') }}</DocsPageLink>
        </template>
      </i18n-t>
    </section>

    <section id="pace" class="block">
      <h2>{{ $t('docs.landMovement.pace.heading') }}</h2>
      <p class="text">{{ $t('docs.landMovement.pace.body') }}</p>
      <p v-if="spearman" class="text">{{ $t('docs.landMovement.pace.example', { unit: unitName('spearman'), minutes: spearman }) }}</p>
      <p v-if="units.loading" class="muted">{{ $t('docs.status.loading') }}</p>
      <div v-if="unitRows.length > 0" class="table-scroll">
        <table data-testid="pace-table">
          <thead>
            <tr>
              <th>{{ $t('docs.landMovement.pace.columns.unit') }}</th>
              <th>{{ $t('docs.landMovement.pace.columns.speed') }}</th>
              <th v-for="c in columns" :key="c.id">{{ c.id === 'stream' ? $t('docs.landMovement.cost.stream') : terrainName(c.id) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in unitRows" :key="row.type" :data-unit="row.type">
              <th scope="row" class="name">{{ unitName(row.type) }}</th>
              <td class="value">{{ n(row.speed) }}</td>
              <td v-for="(minutes, i) in row.minutes" :key="columns[i]!.id" class="value">{{ minutes }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted">{{ $t('docs.landMovement.pace.note') }}</p>
      <p v-if="slowest" class="text">{{ $t('docs.landMovement.pace.slowest', { unit: unitName(slowest.type) }) }}</p>
    </section>

    <section id="food" class="block">
      <h2>{{ $t('docs.landMovement.food.heading') }}</h2>
      <ul class="rules">
        <li>{{ $t('docs.landMovement.food.upkeep') }}</li>
        <li>{{ $t('docs.landMovement.food.carry') }}</li>
        <li>{{ $t('docs.landMovement.food.turnBack') }}</li>
      </ul>
      <div v-if="unitRows.length > 0" class="table-scroll">
        <table class="small" data-testid="food-table">
          <thead>
            <tr>
              <th>{{ $t('docs.landMovement.pace.columns.unit') }}</th>
              <th>{{ $t('docs.landMovement.food.columns.upkeep') }}</th>
              <th>{{ $t('docs.landMovement.food.columns.carries') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in unitRows" :key="row.type" :data-unit="row.type">
              <th scope="row" class="name">{{ unitName(row.type) }}</th>
              <td class="value">{{ row.upkeep }}</td>
              <td class="value">{{ row.food }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section id="road" class="block">
      <h2>{{ $t('docs.landMovement.road.heading') }}</h2>
      <ul class="rules">
        <i18n-t keypath="docs.landMovement.road.camps" tag="li" scope="global">
          <template #link>
            <DocsPageLink to="/docs/wildlife-camps">{{ $t('docs.landMovement.road.campsLink') }}</DocsPageLink>
          </template>
          <template #min>{{ strongCampGuardRange(1) }}</template>
          <template #max>{{ strongCampGuardRange(5) }}</template>
        </i18n-t>
        <li>{{ $t('docs.landMovement.road.enemies') }}</li>
        <li>{{ $t('docs.landMovement.road.orders') }}</li>
      </ul>
    </section>

    <section id="sight" class="block">
      <h2>{{ $t('docs.landMovement.sight.heading') }}</h2>
      <i18n-t keypath="docs.landMovement.sight.body" tag="p" class="text" scope="global">
        <template #rings>{{ ARMY_VISION_RINGS }}</template>
        <template #odin><BuildingLink type="odinstatue" /></template>
        <template #bonus>{{ ravensRings(1) }}</template>
      </i18n-t>
    </section>

    <DocsAdminNote class="block">
      <p>{{ $t('docs.landMovement.adminNote.bridges') }}</p>
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
.text {
  margin: 0 0 12px;
  line-height: 1.6;
  color: var(--muted);
}
.muted {
  color: var(--muted);
  line-height: 1.6;
}
.rules {
  margin: 0 0 12px;
  padding-left: 20px;
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
  vertical-align: top;
}
thead th {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  white-space: nowrap;
}
.name {
  white-space: nowrap;
  font-weight: 600;
}
.value {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.blocked {
  color: var(--muted);
}
.small {
  width: auto;
}
</style>
