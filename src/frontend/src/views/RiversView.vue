<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import AtlasSprite from '../components/AtlasSprite.vue';
import BuildingLink from '../components/docs/BuildingLink.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsPageLink from '../components/docs/DocsPageLink.vue';
import DocsPicker from '../components/docs/DocsPicker.vue';
import DocsTileEntry from '../components/docs/DocsTileEntry.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import RiverIsland from '../components/docs/RiverIsland.vue';
import { riverPieces, type RiverPieceWidth } from '../lib/docs/riverPieces';

// The rivers page: how a river runs from spring to sea, the pieces it is drawn from, how armies cross it and what stands on it.
// The example map comes first, above the separate pieces; the pieces are read off the atlas (riverPieces.ts).
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const pieces = riverPieces();
const view = reactive(
  Object.fromEntries(
    pieces.map((p) => [p.id, { width: (p.widths.river ? 'river' : 'stream') as RiverPieceWidth, look: '' }]),
  ) as Record<string, { width: RiverPieceWidth; look: string }>,
);

function looksOf(id: string) {
  const piece = pieces.find((p) => p.id === id)!;
  return piece.widths[view[id]!.width] ?? [];
}
function lookOf(id: string) {
  const looks = looksOf(id);
  return looks.find((l) => l.id === view[id]!.look) ?? looks[0];
}
function widthsOf(id: string): RiverPieceWidth[] {
  return (Object.keys(pieces.find((p) => p.id === id)!.widths) as RiverPieceWidth[]).sort().reverse();
}

const RIVER_BUILDINGS = ['sawmill', 'cropmill', 'bridge'] as const;

const tocLinks = computed(() =>
  ['example', 'course', 'pieces', 'crossing', 'building', 'camps', 'lava'].map((id) => ({
    href: `#${id}`,
    label: t(`docs.rivers.${id}.heading`),
  })),
);
</script>

<template>
  <DocsPageLayout class="rivers" :title="$t('docs.rivers.title')" caption="DOCS · RIVERS" :intro="$t('docs.rivers.intro')">
    <DocsToc :links="tocLinks" />

    <section id="example" class="block">
      <h2>{{ $t('docs.rivers.example.heading') }}</h2>
      <p class="text">{{ $t('docs.rivers.example.body') }}</p>
      <RiverIsland />
    </section>

    <section id="course" class="block">
      <h2>{{ $t('docs.rivers.course.heading') }}</h2>
      <p class="text">{{ $t('docs.rivers.course.rise') }}</p>
      <p class="text">{{ $t('docs.rivers.course.widen') }}</p>
      <p class="text">{{ $t('docs.rivers.course.delta') }}</p>
      <i18n-t keypath="docs.rivers.course.bog" tag="p" class="text" scope="global">
        <template #link>
          <DocsPageLink to="/docs/bog-lands">{{ $t('docs.rivers.course.bogLink') }}</DocsPageLink>
        </template>
      </i18n-t>
      <p class="text">{{ $t('docs.rivers.course.valleys') }}</p>
      <DocsAdminNote>
        <p class="text">{{ $t('docs.rivers.course.courseTechNote') }}</p>
      </DocsAdminNote>
    </section>

    <section id="pieces" class="block">
      <h2>{{ $t('docs.rivers.pieces.heading') }}</h2>
      <p class="text">{{ $t('docs.rivers.pieces.body') }}</p>
      <DocsTileEntry v-for="piece in pieces" :id="`piece-${piece.id}`" :key="piece.id" :title="$t(`docs.rivers.pieces.entries.${piece.id}.name`)" :level="3">
        <template #thumb>
          <AtlasSprite v-if="lookOf(piece.id)" :frame="lookOf(piece.id)!.frame" />
        </template>
        <p class="lore">{{ $t(`docs.rivers.pieces.entries.${piece.id}.body`) }}</p>
        <template #pickers>
          <DocsPicker
            v-if="widthsOf(piece.id).length > 1"
            v-model="view[piece.id]!.width"
            :label="$t('docs.rivers.pieces.widthLabel')"
            :options="widthsOf(piece.id).map((w) => ({ value: w, label: $t(`docs.rivers.pieces.widths.${w}`) }))"
            @update:model-value="view[piece.id]!.look = ''"
          />
          <DocsPicker
            v-if="looksOf(piece.id).length > 1"
            :label="$t('docs.rivers.pieces.lookLabel')"
            :options="looksOf(piece.id).map((l) => ({ value: l.id, label: $t(`docs.rivers.pieces.looks.${l.id}`) }))"
            :model-value="lookOf(piece.id)?.id"
            @update:model-value="view[piece.id]!.look = $event"
          />
        </template>
      </DocsTileEntry>
    </section>

    <section id="crossing" class="block">
      <h2>{{ $t('docs.rivers.crossing.heading') }}</h2>
      <p class="text">{{ $t('docs.rivers.crossing.stream') }}</p>
      <i18n-t keypath="docs.rivers.crossing.river" tag="p" class="text" scope="global">
        <template #bridge><BuildingLink type="bridge" /></template>
        <template #link>
          <DocsPageLink to="/docs/land-movement">{{ $t('docs.rivers.crossing.moveLink') }}</DocsPageLink>
        </template>
      </i18n-t>
      <i18n-t keypath="docs.rivers.crossing.walls" tag="p" class="text" scope="global">
        <template #link>
          <DocsPageLink to="/docs/walls">{{ $t('docs.rivers.crossing.wallsLink') }}</DocsPageLink>
        </template>
      </i18n-t>
    </section>

    <section id="building" class="block">
      <h2>{{ $t('docs.rivers.building.heading') }}</h2>
      <p class="text">{{ $t('docs.rivers.building.body') }}</p>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{{ $t('docs.rivers.building.building') }}</th>
              <th scope="col">{{ $t('docs.rivers.building.stands') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="type in RIVER_BUILDINGS" :key="type">
              <th scope="row"><BuildingLink :type="type" always /></th>
              <td>{{ $t(`docs.rivers.building.rows.${type}`) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text">{{ $t('docs.rivers.building.nothing') }}</p>
      <i18n-t keypath="docs.rivers.building.mills" tag="p" class="text" scope="global">
        <template #lumberjack><BuildingLink type="lumberjack" /></template>
        <template #farm><BuildingLink type="farm" /></template>
        <template #link>
          <DocsPageLink to="/docs/production">{{ $t('docs.rivers.building.productionLink') }}</DocsPageLink>
        </template>
      </i18n-t>
      <i18n-t keypath="docs.rivers.building.creek" tag="p" class="text" scope="global">
        <template #hammer><BuildingLink type="hammerschmiede" /></template>
        <template #link>
          <DocsPageLink to="/docs/bog-lands">{{ $t('docs.rivers.course.bogLink') }}</DocsPageLink>
        </template>
      </i18n-t>
    </section>

    <section id="camps" class="block">
      <h2>{{ $t('docs.rivers.camps.heading') }}</h2>
      <i18n-t keypath="docs.rivers.camps.body" tag="p" class="text" scope="global">
        <template #link>
          <DocsPageLink to="/docs/wildlife-camps">{{ $t('docs.rivers.camps.link') }}</DocsPageLink>
        </template>
      </i18n-t>
    </section>

    <section id="lava" class="block">
      <h2>{{ $t('docs.rivers.lava.heading') }}</h2>
      <i18n-t keypath="docs.rivers.lava.body" tag="p" class="text" scope="global">
        <template #link>
          <DocsPageLink to="/docs/wasted-lands">{{ $t('docs.rivers.lava.link') }}</DocsPageLink>
        </template>
      </i18n-t>
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
  color: var(--muted);
  line-height: 1.6;
  max-width: 70ch;
}
.table-scroll {
  overflow-x: auto;
  margin: 0 -4px 12px;
  padding: 0 4px;
}
table {
  width: 100%;
  max-width: 70ch;
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
tbody th {
  white-space: nowrap;
  font-weight: 600;
}
</style>
