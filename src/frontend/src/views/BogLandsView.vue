<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import MobileHudDrawer from '../components/hud/MobileHudDrawer.vue';
import AtlasSprite from '../components/AtlasSprite.vue';
import { findAtlasFrame, type AtlasFrameRect } from '../lib/map/atlas';
import { TILE_ORIENTATIONS, type TileOrientation } from '../lib/map/types';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// The bog set (3D_assets hextile109-119 plus the Clay Brickworks moved onto
// bog ground; that repo's docs/bog-tiles.md is the source of truth, and
// docs/design/bog.md here is the game side). How many looks and levels each
// family has is read off the showcase atlas, not typed out here, so a new
// variant shows up with the next art drop.

function showcase(name: string): AtlasFrameRect | undefined {
  return findAtlasFrame('showcase', name);
}

const BOX_H = 238;
function fit(frame: AtlasFrameRect | undefined, boxHeight: number): { width: string } | undefined {
  if (!frame) return undefined;
  return {
    width: `min(100%, ${(boxHeight * frame.frame.w) / frame.frame.h}px)`,
  };
}

/** `''` for the plain look plus every `_variantNNN` the atlas has for this terrain family. */
function looksOf(family: string): string[] {
  const looks = [''];
  for (let i = 1; i < 20; i++) {
    const suffix = `_variant${String(i).padStart(3, '0')}`;
    if (showcase(`${family}_SE${suffix}`)) looks.push(suffix);
  }
  return looks;
}

/** Every `levelNNN` the atlas has for this building family. */
function levelsOf(family: string): number[] {
  const levels: number[] = [];
  for (let i = 0; i < 20 && showcase(`${family}_SE_level${String(i).padStart(3, '0')}`); i++) levels.push(i);
  return levels;
}

// --- Ground --------------------------------------------------------------

// Look names follow the variant order in 3D_assets' docs/bog-tiles.md.
const GROUND_LOOKS = ['plain', 'mire1', 'mire2', 'mire3', 'oreSeep', 'fen', 'peat', 'copse', 'seepChain'] as const;
// Computed: the looks are read off the atlas, whose manifests arrive lazily.
const groundLooks = computed(() => looksOf('bog'));
// The first decorated look by default; groundFrame falls back to the plain one
// while the manifests are still on their way.
const groundLook = ref(1);
const groundCamera = ref<TileOrientation>('SE');
const groundFrame = computed(() => showcase(`bog_${groundCamera.value}${groundLooks.value[groundLook.value] ?? ''}`));
function groundLookName(i: number): string {
  const key = GROUND_LOOKS[i];
  return key ? t(`docs.bogLands.ground.looks.${key}`) : String(i + 1);
}

// --- Water ---------------------------------------------------------------

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
type WaterShape = (typeof WATER_SHAPES)[number]['id'];
const waterShape = ref<WaterShape>('creek');
const waterCamera = ref<TileOrientation>('SE');
const waterLookIndex = reactive<Record<string, number>>({});
const waterFamily = computed(() => WATER_SHAPES.find((s) => s.id === waterShape.value)!.family);
const waterLooks = computed(() => looksOf(waterFamily.value));
const waterLook = computed(() => Math.min(waterLookIndex[waterFamily.value] ?? 0, waterLooks.value.length - 1));
const waterFrame = computed(() =>
  showcase(`${waterFamily.value}_${waterCamera.value}${waterLooks.value[waterLook.value] ?? ''}`),
);

// --- Buildings -----------------------------------------------------------

const BUILDINGS = [
  { id: 'bogoreworks', family: 'bogoreworks' },
  { id: 'fisherhut', family: 'fisherhut_lake' },
  { id: 'hammerschmiede', family: 'hammerschmiede' },
  { id: 'claybrickworks', family: 'claybrickworks' },
] as const;
type BuildingId = (typeof BUILDINGS)[number]['id'];
const buildingLevels = Object.fromEntries(BUILDINGS.map((b) => [b.id, levelsOf(b.family)])) as Record<
  BuildingId,
  number[]
>;
const buildingView = reactive(
  Object.fromEntries(
    BUILDINGS.map((b) => [
      b.id,
      {
        level: buildingLevels[b.id].at(-1) ?? 0,
        camera: 'SE' as TileOrientation,
      },
    ]),
  ) as Record<BuildingId, { level: number; camera: TileOrientation }>,
);
function buildingFrame(id: BuildingId): AtlasFrameRect | undefined {
  const family = BUILDINGS.find((b) => b.id === id)!.family;
  const { level, camera } = buildingView[id];
  return showcase(`${family}_${camera}_level${String(level).padStart(3, '0')}`);
}
</script>

<template>
  <div class="bog-lands">
    <TopBar docked :title="$t('docs.bogLands.title')" caption="DOCS · BOG LANDS">
      <HudNav />
      <template #drawer="{ close }">
        <MobileHudDrawer @close="close" />
      </template>
    </TopBar>
    <main class="body docs-scale">
      <h1>{{ $t('docs.bogLands.title') }}</h1>
      <p class="intro">{{ $t('docs.bogLands.intro') }}</p>
      <p class="status">{{ $t('docs.bogLands.status') }}</p>

      <section id="ground">
        <h2>{{ $t('docs.bogLands.ground.heading') }}</h2>
        <p>{{ $t('docs.bogLands.ground.body') }}</p>
        <div class="card">
          <div class="art-box">
            <AtlasSprite v-if="groundFrame" :frame="groundFrame" :style="fit(groundFrame, BOX_H)" />
          </div>
          <div class="pills">
            <span class="pills-label">{{ $t('docs.bogLands.looks') }}</span>
            <button
              v-for="(suffix, i) in groundLooks"
              :key="suffix"
              type="button"
              class="pill"
              :class="{ active: groundLook === i }"
              @click="groundLook = i"
            >
              {{ groundLookName(i) }}
            </button>
          </div>
          <div class="pills">
            <span class="pills-label">{{ $t('docs.bogLands.camera') }}</span>
            <button
              v-for="cam in TILE_ORIENTATIONS"
              :key="cam"
              type="button"
              class="pill"
              :class="{ active: groundCamera === cam }"
              @click="groundCamera = cam"
            >
              {{ cam }}
            </button>
          </div>
        </div>
      </section>

      <section id="water">
        <h2>{{ $t('docs.bogLands.water.heading') }}</h2>
        <p>{{ $t('docs.bogLands.water.body') }}</p>
        <div class="card">
          <div class="art-box">
            <AtlasSprite v-if="waterFrame" :frame="waterFrame" :style="fit(waterFrame, BOX_H)" />
          </div>
          <p class="shape-note">
            {{ t(`docs.bogLands.water.shapes.${waterShape}.body`) }}
          </p>
          <div class="pills">
            <span class="pills-label">{{ $t('docs.bogLands.water.shape') }}</span>
            <button
              v-for="shape in WATER_SHAPES"
              :key="shape.id"
              type="button"
              class="pill"
              :class="{ active: waterShape === shape.id }"
              @click="waterShape = shape.id"
            >
              {{ t(`docs.bogLands.water.shapes.${shape.id}.name`) }}
            </button>
          </div>
          <div v-if="waterLooks.length > 1" class="pills">
            <span class="pills-label">{{ $t('docs.bogLands.looks') }}</span>
            <button
              v-for="(suffix, i) in waterLooks"
              :key="suffix"
              type="button"
              class="pill"
              :class="{ active: waterLook === i }"
              @click="waterLookIndex[waterFamily] = i"
            >
              {{ i + 1 }}
            </button>
          </div>
          <div class="pills">
            <span class="pills-label">{{ $t('docs.bogLands.camera') }}</span>
            <button
              v-for="cam in TILE_ORIENTATIONS"
              :key="cam"
              type="button"
              class="pill"
              :class="{ active: waterCamera === cam }"
              @click="waterCamera = cam"
            >
              {{ cam }}
            </button>
          </div>
        </div>
      </section>

      <section id="buildings">
        <h2>{{ $t('docs.bogLands.buildings.heading') }}</h2>
        <p>{{ $t('docs.bogLands.buildings.body') }}</p>
        <div class="cards">
          <div v-for="building in BUILDINGS" :id="`building-${building.id}`" :key="building.id" class="card">
            <h3>{{ t(`docs.bogLands.buildings.${building.id}.name`) }}</h3>
            <p>{{ t(`docs.bogLands.buildings.${building.id}.body`) }}</p>
            <div class="art-box">
              <AtlasSprite
                v-if="buildingFrame(building.id)"
                :frame="buildingFrame(building.id)!"
                :style="fit(buildingFrame(building.id), BOX_H)"
              />
            </div>
            <div class="pills">
              <span class="pills-label">{{ $t('docs.bogLands.stage') }}</span>
              <button
                v-for="level in buildingLevels[building.id]"
                :key="level"
                type="button"
                class="pill"
                :class="{ active: buildingView[building.id].level === level }"
                @click="buildingView[building.id].level = level"
              >
                {{ level + 1 }}
              </button>
            </div>
            <div class="pills">
              <span class="pills-label">{{ $t('docs.bogLands.camera') }}</span>
              <button
                v-for="cam in TILE_ORIENTATIONS"
                :key="cam"
                type="button"
                class="pill"
                :class="{ active: buildingView[building.id].camera === cam }"
                @click="buildingView[building.id].camera = cam"
              >
                {{ cam }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="map-rules">
        <h2>{{ $t('docs.bogLands.rules.heading') }}</h2>
        <p>{{ $t('docs.bogLands.rules.body') }}</p>
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
      </section>
    </main>
  </div>
</template>

<style scoped>
.bog-lands {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: auto;
  background: var(--shell);
}
.body {
  max-width: 90ch;
  margin: 0 auto;
  padding: 24px 28px 60px;
  color: var(--text);
}
.intro,
section > p {
  color: var(--muted);
  line-height: 1.6;
}
.status {
  font-size: 13px;
  border-left: 3px solid var(--gold);
  padding-left: 12px;
  color: var(--muted);
}
section {
  margin-top: 36px;
  scroll-margin-top: 84px;
}
h2 {
  margin: 0 0 12px;
}
.rules {
  color: var(--muted);
  line-height: 1.6;
  padding-left: 22px;
}
.rules li {
  margin-bottom: 6px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
  margin-top: 16px;
}
.card {
  padding: 16px 18px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel, #1c1710);
  scroll-margin-top: 84px;
}
.card h3 {
  margin: 0 0 4px;
}
.card p {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.art-box {
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0b1116;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  overflow: hidden;
}
.pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 8px;
}
.pills-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-right: 4px;
}
.pill {
  background: var(--panel, #1c1710);
  border: 1px solid var(--panel-border);
  color: var(--muted);
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.pill:hover {
  color: var(--text);
  border-color: var(--gold);
}
.pill.active {
  color: #20160a;
  background: var(--gold);
  border-color: var(--gold);
}
</style>
