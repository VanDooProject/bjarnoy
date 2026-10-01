<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { beastName } from '../i18n/catalogueNames';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import MobileHudDrawer from '../components/hud/MobileHudDrawer.vue';
import AtlasSprite from '../components/AtlasSprite.vue';
import AnimatedCamp from '../components/docs/AnimatedCamp.vue';
import AnimationPausedNote from '../components/docs/AnimationPausedNote.vue';
import { findAtlasClip, findAtlasFrame, type AtlasFrameRect } from '../lib/map/atlas';
import { KEY_FAMILY, type TextureKey } from '../lib/map/textures';
import { TILE_ORIENTATIONS, type TileOrientation } from '../lib/map/types';
import { lootKindsOf, lootPoolByKind, type LootShare } from '../lib/map/campRules';
import { CAMP_FAMILIES, MaxCampLevel, guardRange, type CampGround, type CampStrength } from '../lib/map/campPlacement';

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

// A family only gets a card once its art is in the atlas.
const CAMPS: CampEntry[] = CAMP_FAMILIES.map((f) => ({ id: f.family, ground: f.ground, strength: f.strength })).filter(
  (c) => TILE_ORIENTATIONS.some((cam) => frameFor(c.id, cam, false)),
);

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

// The art a camp is drawn with - the map's own alias (`KEY_FAMILY`): the walrus haul-out
// borrows the seal haul-out's art until its own is rendered.
function artOf(id: CampId): string {
  return KEY_FAMILY[id as TextureKey] ?? id;
}

function frameFor(id: CampId, camera: TileOrientation, guarded: boolean): AtlasFrameRect | undefined {
  return findAtlasFrame('showcase', `${artOf(id)}_${camera}_level00${guarded ? 1 : 0}`);
}

/** The hexes a camp of this strength guards at level 1 and at the top level (`guardRange`, the game's own formula). */
function rangeOf(strength: CampStrength): { min: number; max: number; levels: number } {
  return { min: guardRange(1, strength), max: guardRange(MaxCampLevel, strength), levels: MaxCampLevel };
}

// Loot kinds and amounts come from the game's own rules (`campRules.ts`, the mirror of `CampRules`).
// The levels the cards quote loot amounts for: a fresh camp and a mid-level one.
const AMOUNT_LEVELS = [1, 5];
const lootOf = (camp: CampEntry): LootShare[] => lootKindsOf(camp.id);

function hasClip(id: CampId, camera: TileOrientation): boolean {
  return !!findAtlasClip('buildings-anim', `${artOf(id)}_${camera}_level001`);
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

// The page-wide switch: every camp at once. A camp's own pills still change
// just that camp, and the switch then shows neither state as active.
const allState = computed<'guarded' | 'cleared' | null>(() => {
  const states = CAMPS.map((c) => view[c.id].guarded);
  if (states.every(Boolean)) return 'guarded';
  if (states.every((g) => !g)) return 'cleared';
  return null;
});
function setAll(guarded: boolean): void {
  for (const c of CAMPS) setGuarded(c.id, guarded);
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
    <main class="body docs-scale">
      <RouterLink to="/docs" class="breadcrumb">{{ $t('docs.backToDocs') }}</RouterLink>
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
          <li>{{ $t('docs.wildlifeCamps.rules.hunting') }}</li>
          <li>{{ $t('docs.wildlifeCamps.rules.regrowth') }}</li>
          <li>{{ $t('docs.wildlifeCamps.rules.calm') }}</li>
          <li>{{ $t('docs.wildlifeCamps.rules.leveling') }}</li>
          <li>{{ $t('docs.wildlifeCamps.rules.ambush') }}</li>
          <li>{{ $t('docs.wildlifeCamps.rules.leftover') }}</li>
        </ul>
      </section>

      <section id="camps">
        <h2>{{ $t('docs.wildlifeCamps.camps.heading') }}</h2>
        <p>{{ $t('docs.wildlifeCamps.camps.body') }}</p>
        <p>{{ $t('docs.wildlifeCamps.strength.help') }}</p>
        <p>{{ $t('docs.wildlifeCamps.loot.note') }}</p>
        <AnimationPausedNote />
        <div class="filters">
          <div class="pills" data-testid="state-switch">
            <span class="pills-label">{{ $t('docs.wildlifeCamps.state.all') }}</span>
            <button type="button" class="pill" :class="{ active: allState === 'guarded' }" @click="setAll(true)">
              {{ $t('docs.wildlifeCamps.state.guarded') }}
            </button>
            <button type="button" class="pill" :class="{ active: allState === 'cleared' }" @click="setAll(false)">
              {{ $t('docs.wildlifeCamps.state.cleared') }}
            </button>
          </div>
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
              <AnimatedCamp
                v-if="view[camp.id].guarded && hasClip(camp.id, view[camp.id].camera)"
                :family="artOf(camp.id)"
                :orientation="view[camp.id].camera"
              />
              <AtlasSprite
                v-else-if="frameFor(camp.id, view[camp.id].camera, view[camp.id].guarded)"
                :frame="frameFor(camp.id, view[camp.id].camera, view[camp.id].guarded)!"
                :style="fit(frameFor(camp.id, view[camp.id].camera, view[camp.id].guarded), BOX_H)"
              />
            </div>
            <p>{{ t(`docs.wildlifeCamps.list.${camp.id}.guards`) }}</p>
            <p class="beasts" data-testid="beasts">
              <span class="pills-label">{{ $t('docs.wildlifeCamps.beasts.label') }}</span>
              {{
                t('docs.wildlifeCamps.beasts.tiers', {
                  young: beastName(camp.id, 'young'),
                  adult: beastName(camp.id, 'adult'),
                  alpha: beastName(camp.id, 'alpha'),
                })
              }}
            </p>
            <p class="loot" data-testid="loot">
              <span class="pills-label">{{ $t('docs.wildlifeCamps.loot.label') }}</span>
              <span
                v-for="share in lootOf(camp)"
                :key="share.kind"
                class="loot-kind"
                :class="{ more: share.more }"
                :data-loot="share.kind"
                :data-more="share.more ? 'true' : undefined"
                :title="share.more ? t('docs.wildlifeCamps.loot.moreHint') : undefined"
              >
                {{
                  share.more
                    ? t('docs.wildlifeCamps.loot.more', { kind: t(`docs.wildlifeCamps.loot.${share.kind}`) })
                    : t(`docs.wildlifeCamps.loot.${share.kind}`)
                }}
              </span>
            </p>
            <p v-for="level in AMOUNT_LEVELS" :key="level" class="loot-amounts" data-testid="loot-amounts">
              <span class="pills-label">{{ t('docs.wildlifeCamps.loot.atLevel', { level }) }}</span>
              <span v-for="share in lootOf(camp)" :key="share.kind" class="loot-kind">
                {{ lootPoolByKind(camp.id, level)[share.kind] }} {{ t(`docs.wildlifeCamps.loot.${share.kind}`) }}
              </span>
            </p>
            <p class="range" data-testid="guard-range">{{ t('docs.wildlifeCamps.range', rangeOf(camp.strength)) }}</p>
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
.card p.loot,
.card p.loot-amounts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0 0 6px;
}
.loot-kind.more {
  color: #20160a;
  background: var(--gold);
  font-weight: 700;
}
.loot-kind {
  font-size: 12px;
  color: var(--text);
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--panel-border);
}
.card p.range {
  color: var(--text);
  font-size: 12px;
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
</style>
