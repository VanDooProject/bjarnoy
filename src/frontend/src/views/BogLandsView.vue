<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsPicker from '../components/docs/DocsPicker.vue';
import DocsTileEntry from '../components/docs/DocsTileEntry.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import DocsAdminNote from '../components/docs/DocsAdminNote.vue';
import { useDocsAdminNotes } from '../composables/useDocsAdminNotes';
import AtlasSprite from '../components/AtlasSprite.vue';
import BogIsland from '../components/docs/BogIsland.vue';
import { findAtlasFrame, type AtlasFrameRect } from '../lib/map/atlas';
import { RETIRED_BOG_VARIANTS } from '../lib/map/textures';
import { TILE_ORIENTATIONS, type TileOrientation } from '../lib/map/types';

const { t, te } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// The bog set (3D_assets hextile109-119 plus the Clay Brickworks moved onto
// bog ground; that repo's docs/bog-tiles.md is the source of truth, and
// docs/design/bog.md here is the game side). How many looks and levels each
// family has is read off the showcase atlas, not typed out here, so a new
// variant shows up with the next art drop.

function showcase(name: string): AtlasFrameRect | undefined {
  return findAtlasFrame('showcase', name);
}

/** `''` for the plain look plus every `_variantNNN` the atlas has for this terrain family, minus the retired ones (slot 0 is the plain look). */
function looksOf(family: string, retired: ReadonlySet<number> = new Set()): string[] {
  const looks = retired.has(0) ? [] : [''];
  for (let i = 1; i < 20; i++) {
    const suffix = `_variant${String(i).padStart(3, '0')}`;
    if (!retired.has(i) && showcase(`${family}_SE${suffix}`)) looks.push(suffix);
  }
  return looks;
}

/** Every `levelNNN` the atlas has for this building family. */
function levelsOf(family: string): number[] {
  const levels: number[] = [];
  for (let i = 0; i < 20 && showcase(`${family}_SE_level${String(i).padStart(3, '0')}`); i++) levels.push(i);
  return levels;
}

// --- Entries -------------------------------------------------------------

// Every entry is one tile (or one building) with its own picture and pickers, laid out like docs/tiles: a thumbnail
// beside the name and text, the pickers underneath. `family` is the showcase atlas family; ground and water entries
// pick a look, buildings a stage, and each has its own camera.

// Look names follow the variant order in 3D_assets' docs/bog-tiles.md, minus the looks the game no longer shows
// (the plain moss and variant006, the peat cuttings: `RETIRED_BOG_VARIANTS`).
const GROUND_LOOKS = ['mire1', 'mire2', 'mire3', 'oreSeep', 'fen', 'copse', 'seepChain'] as const;

const WATER_SHAPES = [
  { id: 'creek', family: 'bogcreek' },
  { id: 'creekBend', family: 'bogcreek_bend' },
  { id: 'spring', family: 'bogcreek_spring' },
  { id: 'lake', family: 'boglake' },
  { id: 'inlet', family: 'boglake_inlet' },
  { id: 'shore', family: 'boglake_shore' },
  { id: 'half', family: 'boglake_half' },
  { id: 'mouth', family: 'boglake_mouth' },
] as const;

const BUILDINGS = [
  { id: 'bogoreworks', family: 'bogoreworks' },
  { id: 'fisherhut', family: 'fisherhut_lake' },
  { id: 'hammerschmiede', family: 'hammerschmiede' },
  { id: 'claybrickworks', family: 'claybrickworks' },
] as const;

interface Entry {
  /** Anchor id, also the key of the entry's picker state. */
  id: string;
  group: 'ground' | 'water' | 'buildings';
  family: string;
  /** `''` for the plain look plus every `_variantNNN` the atlas has (empty for a building). */
  looks: string[];
  /** Every `levelNNN` the atlas has (empty for a ground or water tile). */
  levels: number[];
}

const ENTRIES: Entry[] = [
  {
    id: 'ground',
    group: 'ground',
    family: 'bog',
    looks: looksOf('bog', RETIRED_BOG_VARIANTS.bog),
    levels: [],
  },
  ...WATER_SHAPES.map((s) => ({
    id: s.id,
    group: 'water' as const,
    family: s.family,
    looks: looksOf(s.family),
    levels: [],
  })),
  ...BUILDINGS.map((b) => ({
    id: b.id,
    group: 'buildings' as const,
    family: b.family,
    looks: [],
    levels: levelsOf(b.family),
  })),
];

const GROUPS = ['ground', 'water', 'buildings'] as const;
const entriesIn = (group: Entry['group']) => ENTRIES.filter((e) => e.group === group);

const view = reactive(
  Object.fromEntries(
    ENTRIES.map((e) => [
      e.id,
      {
        // A building opens on its last, finished stage.
        look: 0,
        level: e.levels.at(-1) ?? 0,
        camera: 'SE' as TileOrientation,
      },
    ]),
  ) as Record<string, { look: number; level: number; camera: TileOrientation }>,
);

function frameOf(entry: Entry): AtlasFrameRect | undefined {
  const { look, level, camera } = view[entry.id]!;
  if (entry.group === 'buildings') return showcase(`${entry.family}_${camera}_level${String(level).padStart(3, '0')}`);
  return showcase(`${entry.family}_${camera}${entry.looks[look] ?? ''}`);
}

function lookName(entry: Entry, i: number): string {
  if (entry.group !== 'ground') return String(i + 1);
  const key = GROUND_LOOKS[i];
  return key ? t(`docs.bogLands.ground.looks.${key}`) : String(i + 1);
}

function keyPrefix(entry: Entry): string {
  return entry.group === 'water' ? 'docs.bogLands.water.shapes' : 'docs.bogLands.buildings';
}
function titleOf(entry: Entry): string {
  return entry.group === 'ground' ? t('docs.bogLands.ground.heading') : t(`${keyPrefix(entry)}.${entry.id}.name`);
}
function textOf(entry: Entry): string {
  return entry.group === 'ground' ? t('docs.bogLands.ground.body') : t(`${keyPrefix(entry)}.${entry.id}.body`);
}

function artNoteOf(entry: Entry): string | undefined {
  const key = `${keyPrefix(entry)}.${entry.id}.artNote`;
  return entry.group !== 'ground' && te(key) ? t(key) : undefined;
}

const { visible: adminNotes } = useDocsAdminNotes();
const tocLinks = computed(() => [
  { href: '#example-map', label: t('docs.bogLands.example.heading') },
  ...ENTRIES.map((entry) => ({ href: `#${entry.id}`, label: titleOf(entry) })),
  ...(adminNotes.value ? [{ href: '#map-rules', label: t('docs.bogLands.rules.heading') }] : []),
]);
</script>

<template>
  <DocsPageLayout
    class="bog-lands"
    :title="$t('docs.bogLands.title')"
    caption="DOCS · BOG LANDS"
    :intro="$t('docs.bogLands.intro')"
  >
    <template #status>
      <DocsAdminNote>
        <p class="status">{{ $t('docs.bogLands.status') }}</p>
      </DocsAdminNote>
    </template>

    <DocsToc :links="tocLinks" />

    <section id="example-map" class="block">
      <h2>{{ $t('docs.bogLands.example.heading') }}</h2>
      <p class="group-body">{{ $t('docs.bogLands.example.body') }}</p>
      <BogIsland />
    </section>

    <template v-for="group in GROUPS" :key="group">
      <h2 class="group-heading">
        {{ $t(`docs.bogLands.${group}.heading`) }}
      </h2>
      <p v-if="group !== 'ground'" class="group-body">
        {{ $t(`docs.bogLands.${group}.body`) }}
      </p>

      <DocsTileEntry
        v-for="entry in entriesIn(group)"
        :id="entry.id"
        :key="entry.id"
        :title="titleOf(entry)"
        :level="3"
      >
        <template #thumb>
          <AtlasSprite v-if="frameOf(entry)" :frame="frameOf(entry)!" />
        </template>
        <p class="lore">{{ textOf(entry) }}</p>
        <DocsAdminNote v-if="artNoteOf(entry)">{{ artNoteOf(entry) }}</DocsAdminNote>
        <template #pickers>
          <DocsPicker
            v-if="entry.looks.length > 1"
            v-model="view[entry.id]!.look"
            :label="$t('docs.bogLands.looks')"
            :options="entry.looks.map((_, i) => ({ value: i, label: lookName(entry, i) }))"
          />
          <DocsPicker
            v-if="entry.levels.length > 1"
            v-model="view[entry.id]!.level"
            :label="$t('docs.bogLands.stage')"
            :options="entry.levels.map((level) => ({ value: level, label: String(level + 1) }))"
          />
          <DocsPicker
            v-model="view[entry.id]!.camera"
            :label="$t('docs.bogLands.camera')"
            :options="TILE_ORIENTATIONS.map((cam) => ({ value: cam, label: cam }))"
          />
        </template>
      </DocsTileEntry>
    </template>

    <DocsAdminNote id="map-rules" as="section" class="block">
      <h2>{{ $t('docs.bogLands.rules.heading') }}</h2>
      <p class="group-body">{{ $t('docs.bogLands.rules.body') }}</p>
      <ol class="rules">
        <li>{{ $t('docs.bogLands.rules.waterEdges') }}</li>
        <li>{{ $t('docs.bogLands.rules.lakesApart') }}</li>
        <li>{{ $t('docs.bogLands.rules.creeks') }}</li>
        <li>{{ $t('docs.bogLands.rules.mouth') }}</li>
        <li>{{ $t('docs.bogLands.rules.weir') }}</li>
        <li>{{ $t('docs.bogLands.rules.boats') }}</li>
        <li>{{ $t('docs.bogLands.rules.river') }}</li>
        <li>{{ $t('docs.bogLands.rules.inland') }}</li>
        <li>{{ $t('docs.bogLands.rules.landing') }}</li>
      </ol>
    </DocsAdminNote>
  </DocsPageLayout>
</template>

<style scoped>
.group-body {
  color: var(--muted);
  line-height: 1.6;
}
.group-heading {
  margin: 40px 0 8px;
}
.block {
  margin-top: 40px;
  scroll-margin-top: 84px;
}
.block h2 {
  margin: 0 0 8px;
}
.rules {
  color: var(--muted);
  line-height: 1.6;
  padding-left: 22px;
}
.rules li {
  margin-bottom: 6px;
}
</style>
