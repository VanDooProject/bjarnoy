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
import { CAMP_FAMILIES, type CampGround, type CampStrength } from '../lib/map/campPlacement';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// The wildlife camps (3D_assets hextile120-128, see that repo's
// docs/wildlife-camps.md): two states per camp, `level000` cleared and
// `level001` guarded. The guarded level only ships the one to three
// rotations that show its animals best, so which cameras a camp offers in
// that state is read off the showcase atlas rather than typed out here — a
// re-rated camp picks up its new rotations with the next art drop.

// Which camps exist, their ground and whether they are strong or weak come
// from the game's own family table (`CAMP_FAMILIES`, the TS mirror of
// `CampFamilies.All`), so the badges and filters here always say what world
// generation actually places.
type Ground = CampGround;
type CampId = string;
interface CampEntry {
  id: CampId;
  ground: Ground;
  strength: CampStrength;
}

// Camps whose art is drawn but which the family table does not list yet
// (3D_assets hextile130-132, the weak deer, hare and otter camps). Each one
// only gets a card once its art is in the atlas, and the family table wins
// as soon as it lists the family.
const UPCOMING: CampEntry[] = [
  { id: 'deerglade', ground: 'forest', strength: 'weak' },
  { id: 'harewarren', ground: 'grass', strength: 'weak' },
  { id: 'otterslide', ground: 'riverStraight', strength: 'weak' },
];

const CAMPS: CampEntry[] = [
  ...CAMP_FAMILIES.map((f) => ({ id: f.family, ground: f.ground, strength: f.strength })),
  ...UPCOMING.filter((u) => !CAMP_FAMILIES.some((f) => f.family === u.id)),
].filter((c) => TILE_ORIENTATIONS.some((cam) => frameFor(c.id, cam, false)));

const STRENGTHS: CampStrength[] = ['strong', 'weak'];
// Grounds in the order the family table first mentions them, only those with a camp on the page.
const GROUNDS: Ground[] = [...new Set(CAMPS.map((c) => c.ground))];
const strengthFilter = ref<CampStrength | 'all'>('all');
const groundFilter = ref<Ground | 'all'>('all');
const shownCamps = computed(() =>
  CAMPS.filter(
    (c) =>
      (strengthFilter.value === 'all' || c.strength === strengthFilter.value) &&
      (groundFilter.value === 'all' || c.ground === groundFilter.value),
  ),
);

const BOX_H = 238;
function fit(frame: AtlasFrameRect | undefined, boxHeight: number): { width: string } | undefined {
  if (!frame) return undefined;
  return {
    width: `min(100%, ${(boxHeight * frame.frame.w) / frame.frame.h}px)`,
  };
}

function frameFor(id: CampId, camera: TileOrientation, guarded: boolean): AtlasFrameRect | undefined {
  return findAtlasFrame('showcase', `${id}_${camera}_level00${guarded ? 1 : 0}`);
}

function keptCameras(id: CampId): TileOrientation[] {
  return TILE_ORIENTATIONS.filter((cam) => frameFor(id, cam, true));
}

const view = reactive(
  Object.fromEntries(
    CAMPS.map(({ id }) => {
      const kept = keptCameras(id);
      return [
        id,
        {
          guarded: kept.length > 0,
          camera: kept.includes('SE') ? 'SE' : (kept[0] ?? 'SE'),
        },
      ];
    }),
  ) as Record<CampId, { guarded: boolean; camera: TileOrientation }>,
);

function setGuarded(id: CampId, guarded: boolean): void {
  const state = view[id];
  state.guarded = guarded;
  const kept = keptCameras(id);
  if (guarded && !kept.includes(state.camera) && kept[0]) state.camera = kept[0];
}

function cameraAvailable(id: CampId, camera: TileOrientation): boolean {
  return !!frameFor(id, camera, view[id].guarded);
}
</script>

<template>
  <div class="wildlife-camps">
    <TopBar docked :title="$t('docs.wildlifeCamps.title')" caption="DOCS · WILDLIFE CAMPS">
      <HudNav />
      <template #drawer="{ close }">
        <MobileHudDrawer @close="close" />
      </template>
    </TopBar>
    <main class="body">
      <h1>{{ $t('docs.wildlifeCamps.title') }}</h1>
      <p class="intro">{{ $t('docs.wildlifeCamps.intro') }}</p>
      <p class="status">{{ $t('docs.wildlifeCamps.status') }}</p>

      <section id="rules">
        <h2>{{ $t('docs.wildlifeCamps.rules.heading') }}</h2>
        <ul class="rules">
          <li>{{ $t('docs.wildlifeCamps.rules.towers') }}</li>
          <li>{{ $t('docs.wildlifeCamps.rules.range') }}</li>
          <li>{{ $t('docs.wildlifeCamps.rules.bigIslands') }}</li>
          <li>{{ $t('docs.wildlifeCamps.rules.states') }}</li>
          <li>{{ $t('docs.wildlifeCamps.rules.building') }}</li>
          <li>{{ $t('docs.wildlifeCamps.rules.respawn') }}</li>
          <li>{{ $t('docs.wildlifeCamps.rules.neverBuilt') }}</li>
        </ul>
      </section>

      <section id="camps">
        <h2>{{ $t('docs.wildlifeCamps.camps.heading') }}</h2>
        <p>{{ $t('docs.wildlifeCamps.camps.body') }}</p>
        <p>{{ $t('docs.wildlifeCamps.strength.help') }}</p>
        <div class="filters">
          <div class="pills" data-testid="strength-filter">
            <span class="pills-label">{{ $t('docs.wildlifeCamps.strength.label') }}</span>
            <button
              type="button"
              class="pill"
              :class="{ active: strengthFilter === 'all' }"
              @click="strengthFilter = 'all'"
            >
              {{ $t('docs.wildlifeCamps.filters.all') }}
            </button>
            <button
              v-for="strength in STRENGTHS"
              :key="strength"
              type="button"
              class="pill"
              :class="{ active: strengthFilter === strength }"
              @click="strengthFilter = strength"
            >
              {{ t(`docs.wildlifeCamps.strength.${strength}`) }}
            </button>
          </div>
          <div class="pills" data-testid="ground-filter">
            <span class="pills-label">{{ $t('docs.wildlifeCamps.filters.ground') }}</span>
            <button
              type="button"
              class="pill"
              :class="{ active: groundFilter === 'all' }"
              @click="groundFilter = 'all'"
            >
              {{ $t('docs.wildlifeCamps.filters.all') }}
            </button>
            <button
              v-for="ground in GROUNDS"
              :key="ground"
              type="button"
              class="pill"
              :class="{ active: groundFilter === ground }"
              @click="groundFilter = ground"
            >
              {{ t(`docs.wildlifeCamps.grounds.${ground}`) }}
            </button>
          </div>
        </div>
        <p v-if="shownCamps.length === 0" class="empty">{{ $t('docs.wildlifeCamps.filters.none') }}</p>
        <div class="cards">
          <div v-for="camp in shownCamps" :id="`camp-${camp.id}`" :key="camp.id" class="card">
            <h3>{{ t(`docs.wildlifeCamps.list.${camp.id}.name`) }}</h3>
            <div class="tags">
              <span class="ground">{{ t(`docs.wildlifeCamps.grounds.${camp.ground}`) }}</span>
              <span class="strength" :class="camp.strength" :data-strength="camp.strength">
                {{ t(`docs.wildlifeCamps.strength.${camp.strength}`) }}
              </span>
            </div>
            <div class="art-box">
              <AtlasSprite
                v-if="frameFor(camp.id, view[camp.id].camera, view[camp.id].guarded)"
                :frame="frameFor(camp.id, view[camp.id].camera, view[camp.id].guarded)!"
                :style="fit(frameFor(camp.id, view[camp.id].camera, view[camp.id].guarded), BOX_H)"
              />
            </div>
            <p>{{ t(`docs.wildlifeCamps.list.${camp.id}.guards`) }}</p>
            <div class="pills">
              <span class="pills-label">{{ $t('docs.wildlifeCamps.state.label') }}</span>
              <button
                type="button"
                class="pill"
                :class="{ active: view[camp.id].guarded }"
                :disabled="keptCameras(camp.id).length === 0"
                @click="setGuarded(camp.id, true)"
              >
                {{ $t('docs.wildlifeCamps.state.guarded') }}
              </button>
              <button
                type="button"
                class="pill"
                :class="{ active: !view[camp.id].guarded }"
                @click="setGuarded(camp.id, false)"
              >
                {{ $t('docs.wildlifeCamps.state.cleared') }}
              </button>
            </div>
            <div class="pills">
              <span class="pills-label">{{ $t('docs.wildlifeCamps.camera') }}</span>
              <button
                v-for="cam in TILE_ORIENTATIONS"
                :key="cam"
                type="button"
                class="pill"
                :class="{ active: view[camp.id].camera === cam }"
                :disabled="!cameraAvailable(camp.id, cam)"
                :title="cameraAvailable(camp.id, cam) ? undefined : t('docs.wildlifeCamps.notKept')"
                @click="view[camp.id].camera = cam"
              >
                {{ cam }}
              </button>
            </div>
          </div>
        </div>
        <p class="caption-note">
          {{ $t('docs.wildlifeCamps.camps.rotations') }}
        </p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.wildlife-camps {
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
  padding-left: 20px;
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
  margin: 0;
}
.card p {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.filters {
  margin: 12px 0 4px;
}
.empty {
  font-style: italic;
}
.tags {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 10px;
}
.strength {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid currentColor;
}
.strength.strong {
  color: #e0715c;
}
.strength.weak {
  color: #7fc4c9;
}
.ground {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--gold);
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
.pill:hover:not(:disabled) {
  color: var(--text);
  border-color: var(--gold);
}
.pill.active {
  color: #20160a;
  background: var(--gold);
  border-color: var(--gold);
}
.pill:disabled {
  opacity: 0.35;
  cursor: default;
}
.caption-note {
  margin-top: 16px;
  font-size: 12px;
  font-style: italic;
}
</style>
