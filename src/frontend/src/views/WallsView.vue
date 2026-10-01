<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import DocsPicker from '../components/docs/DocsPicker.vue';
import DocsTileEntry from '../components/docs/DocsTileEntry.vue';
import DocsToc from '../components/docs/DocsToc.vue';
import WallExample from '../components/docs/WallExample.vue';
import WallMovementDiagram from '../components/docs/WallMovementDiagram.vue';
import WallPiece from '../components/docs/WallPiece.vue';
import { findAtlasFrame } from '../lib/map/atlas';
import { TILE_ORIENTATIONS, type TileOrientation } from '../lib/map/types';
import type { PalisadePiece } from '../lib/map/palisadeTiles';
import { PALISADE_PIECES, WALL_GROUNDS, usePieceStages } from '../lib/docs/palisadeDocs';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// The palisade set (3D_assets hextile055-060, docs/wall-tiles.md; docs/design/economy.md section 5 here is the
// game side). How many stages each piece has is read off the atlas, so the stage the art adds next shows up with
// the next art drop.

const NAME_KEY: Record<PalisadePiece, string> = {
  straight180: 'straight',
  bend60: 'bend60',
  bend120: 'bend120',
  gate180: 'gate',
  end: 'end',
  end_coast: 'seaEnd',
};

const { stages, stageOf, pick } = usePieceStages((name) => !!findAtlasFrame('buildings-static', name));

const PIECES = PALISADE_PIECES.map((piece) => ({ piece, id: `piece-${piece}`, key: NAME_KEY[piece] }));

const dirs = reactive(Object.fromEntries(PIECES.map((p) => [p.piece, 'SE'])) as Record<PalisadePiece, TileOrientation>);

function stageLabel(stage: number): string {
  return stage === 0 ? t('docs.walls.stages.construction') : t('docs.walls.stages.level', { n: stage });
}

const straightStage = computed(() => stageOf('straight180'));

const tocLinks = [
  ...PIECES.map((p) => ({ href: `#${p.id}`, label: t(`docs.walls.pieces.${p.key}.name`) })),
  { href: '#choosing', label: t('docs.walls.choosing.heading') },
  { href: '#where', label: t('docs.walls.where.heading') },
  { href: '#movement', label: t('docs.walls.movement.heading') },
  { href: '#not-built', label: t('docs.walls.notBuilt.heading') },
];
</script>

<template>
  <DocsPageLayout class="walls" :title="$t('docs.walls.title')" caption="DOCS · WALLS" :intro="$t('docs.walls.intro')">
    <DocsToc :links="tocLinks" />

    <h2 class="group-heading">{{ $t('docs.walls.pieces.heading') }}</h2>
    <p class="group-body">{{ $t('docs.walls.pieces.body') }}</p>

    <DocsTileEntry
      v-for="p in PIECES"
      :id="p.id"
      :key="p.piece"
      :title="$t(`docs.walls.pieces.${p.key}.name`)"
      :level="3"
    >
      <template #thumb>
        <WallPiece :piece="p.piece" :dir="dirs[p.piece]" :stage="stageOf(p.piece)" />
      </template>
      <p>{{ $t(`docs.walls.pieces.${p.key}.body`) }}</p>
      <template #pickers>
        <DocsPicker
          v-if="stages[p.piece].length > 1"
          :model-value="stageOf(p.piece)"
          :label="$t('docs.walls.stage')"
          :options="stages[p.piece].map((stage) => ({ value: stage, label: stageLabel(stage) }))"
          @update:model-value="pick(p.piece, $event)"
        />
        <DocsPicker
          v-model="dirs[p.piece]"
          :label="$t('docs.walls.camera')"
          :options="TILE_ORIENTATIONS.map((dir) => ({ value: dir, label: dir }))"
        />
      </template>
    </DocsTileEntry>

    <section id="choosing" class="block">
      <h2>{{ $t('docs.walls.choosing.heading') }}</h2>
      <p class="group-body">{{ $t('docs.walls.choosing.body') }}</p>
      <ul class="rules">
        <li>{{ $t('docs.walls.choosing.rules.fork') }}</li>
        <li>{{ $t('docs.walls.choosing.rules.gate') }}</li>
        <li>{{ $t('docs.walls.choosing.rules.sea') }}</li>
      </ul>
      <p class="group-body">{{ $t('docs.walls.choosing.example') }}</p>
      <WallExample />
    </section>

    <section id="where" class="block">
      <h2>{{ $t('docs.walls.where.heading') }}</h2>
      <p class="group-body">{{ $t('docs.walls.where.body') }}</p>
      <div class="grounds">
        <figure v-for="ground in WALL_GROUNDS" :key="ground.id" class="ground" :data-ground="ground.id">
          <div class="ground-art">
            <WallPiece piece="straight180" dir="SE" :stage="straightStage" :ground="ground.id" />
          </div>
          <figcaption>{{ $t(`docs.walls.where.grounds.${ground.id}`) }}</figcaption>
        </figure>
      </div>
    </section>

    <section id="movement" class="block">
      <h2>{{ $t('docs.walls.movement.heading') }}</h2>
      <p class="group-body">{{ $t('docs.walls.movement.body') }}</p>
      <ul class="rules">
        <li>{{ $t('docs.walls.movement.rules.block') }}</li>
        <li>{{ $t('docs.walls.movement.rules.gate') }}</li>
        <li>{{ $t('docs.walls.movement.rules.end') }}</li>
        <li>{{ $t('docs.walls.movement.rules.sea') }}</li>
        <li>{{ $t('docs.walls.movement.rules.natural') }}</li>
        <li>{{ $t('docs.walls.movement.rules.fleets') }}</li>
      </ul>
      <WallMovementDiagram />
    </section>

    <section id="not-built" class="block">
      <h2>{{ $t('docs.walls.notBuilt.heading') }}</h2>
      <p class="group-body">{{ $t('docs.walls.notBuilt.body') }}</p>
    </section>
  </DocsPageLayout>
</template>

<style scoped>
.group-heading {
  margin: 40px 0 8px;
}
.group-body {
  color: var(--muted);
  line-height: 1.6;
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
  margin: 0 auto;
}
.ground figcaption {
  margin-top: 6px;
  font-size: 13px;
  color: var(--muted);
}
</style>
