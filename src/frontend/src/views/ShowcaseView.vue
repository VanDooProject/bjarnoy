<script setup lang="ts">
// Public marketing/portfolio page (issue: "showcase page"). Deliberately a
// route inside the game app rather than a static page of screenshots: the
// hero and "one view" sections mount the *real* WorldMapCanvas/
// SettlementCanvas components against a standalone, backend-free WorldModel
// (same trick stores/world.ts's own DEMO_MODE model uses), so this page can
// never go stale relative to what the live renderer actually looks like.
import { computed, markRaw, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import TopBar from '../components/hud/TopBar.vue';
import HudNav from '../components/hud/HudNav.vue';
import WorldMapCanvas from '../components/map/WorldMapCanvas.vue';
import SettlementCanvas from '../components/map/SettlementCanvas.vue';
import AtlasSprite from '../components/AtlasSprite.vue';
import { WorldModel } from '../lib/map/WorldModel';
import { DEFAULT_GENERATION, enumerateIslands } from '../lib/map/worldGenerator';
import { buildingArt, terrainArt, type ArtRef } from '../lib/map/buildingArt';
import type { AtlasFrameRect } from '../lib/map/atlas';

const router = useRouter();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

// Same seed stores/world.ts's own demo model uses (DEMO_SEED) — a familiar,
// known-good archipelago rather than a fresh roll on every page load.
const DEFAULT_SEED = 20260824;
// Generous enough to show a real spread of islands in the hero frame without
// paying DEMO_MASK_RADIUS's full fog-mask cost (this page never fogs — see
// `heroModel` below, no settlement is ever owned by the "showcase" player id).
const SHOWCASE_RADIUS = 40;
const PLAYER_ID = 'showcase';

const seed = ref(DEFAULT_SEED);

function buildHeroModel(worldSeed: number): WorldModel {
  const model = new WorldModel(worldSeed);
  model.setIslands(enumerateIslands({ seed: worldSeed, generation: DEFAULT_GENERATION }, SHOWCASE_RADIUS));
  return model;
}

// `markRaw`: same reasoning as stores/world.ts's own model — a plain class
// meant to be read directly by the renderer, not walked by Vue's reactivity
// proxy on every tile access.
const heroModel = ref(markRaw(buildHeroModel(seed.value)));

// useHexMapRenderer captures its options once at mount (see
// SettlementCanvas.vue's own comment on `mode`) — a `:key="seed"` on the
// canvas is what forces a real remount when the re-roll button below swaps
// the model out from under it.
function reroll() {
  seed.value = Math.floor(Math.random() * 2 ** 31);
  heroModel.value = markRaw(buildHeroModel(seed.value));
}

// "One view" section: a second, independent standalone model (same seed,
// so it's the same archipelago the hero frame shows) previewing its first
// island — same pattern LandingView.vue uses pre-founding. The hero map pans
// to that same island, so the two frames read as one island at two zooms.
const villageModel = computed(() => markRaw(buildHeroModel(seed.value)));
const islandCenter = computed(() => {
  const islands = enumerateIslands({ seed: seed.value, generation: DEFAULT_GENERATION }, SHOWCASE_RADIUS);
  const first = islands[0];
  return first ? { q: first.q, r: first.r } : { q: 0, r: 0 };
});

// The world-mode camera always starts at (0, 0), which for most seeds is open
// sea — recentre on the showcased island once the renderer has mounted (it's
// only set after the async Pixi init, hence a watch rather than onMounted).
const heroCanvas = ref<InstanceType<typeof WorldMapCanvas> | null>(null);
watch(
  () => heroCanvas.value?.renderer,
  (renderer) => renderer?.panTo(islandCenter.value),
);

// The map frames sit in a scrolling page, but the renderer claims every
// wheel/touch gesture over its canvas (zoom, pan, pinch). Until the visitor
// opts in, the frames are pointer-transparent so scrolling past them works —
// the usual "click to interact" pattern for maps embedded in a page.
const exploring = ref(false);

function goPlay() {
  router.push('/');
}
function goDocs() {
  router.push('/docs');
}

interface FeatureCard {
  key: string;
  art: ArtRef;
}

// Player-pitch feature grid — one small tile-art thumbnail per card, picked
// to match the feature's own copy (prototypes/MECHANICS.md is the source for
// all of these). Thumbnails render exactly as TileDocsView.vue does: an
// AtlasSprite for a 'atlas' ArtRef, a plain <img> for the 'png' fallback.
const FEATURES: FeatureCard[] = [
  { key: 'sharedIslands', art: featureArt('hut', 3) },
  { key: 'borders', art: featureArt('longhouse', 5) },
  { key: 'realTime', art: featureArt('sawmill', 3) },
  { key: 'fogOfWar', art: featureArt('tower', 3) },
  { key: 'expansion', art: featureArt('dockyard', 3) },
  { key: 'trade', art: featureArt('storagehouse', 3) },
  { key: 'guilds', art: featureArt('shrineofthor', 3) },
  { key: 'battles', art: featureArt('barracks', 3) },
];

/** A building's in-game art, or a plain grass hex should the pack ever drop that family. */
function featureArt(type: string, level: number): ArtRef {
  return buildingArt(type, level) ?? terrainArt('grass');
}

function thumbFrame(art: ArtRef): AtlasFrameRect | null {
  return art.kind === 'atlas' ? art.frame : null;
}
function thumbUrl(art: ArtRef): string | null {
  return art.kind === 'png' ? art.url : null;
}

interface EngineeringCard {
  key: string;
  to?: string;
}

const ENGINEERING: EngineeringCard[] = [
  { key: 'renderer' },
  { key: 'generation' },
  { key: 'backend' },
  { key: 'e2e' },
  { key: 'deploy' },
  { key: 'i18n' },
];
</script>

<template>
  <div class="showcase">
    <TopBar docked :title="t('showcase.brand')" caption="SHOWCASE">
      <HudNav />
    </TopBar>

    <main class="body">
      <!-- Hero -->
      <section id="hero" class="hero">
        <div class="hero-copy">
          <div class="eyebrow">{{ t('showcase.hero.eyebrow') }}</div>
          <h1>{{ t('showcase.hero.title') }}</h1>
          <p class="tagline">{{ t('showcase.hero.tagline') }}</p>
          <p class="pitch">{{ t('showcase.hero.pitch') }}</p>
          <div class="cta-row">
            <button type="button" class="cta primary" @click="goPlay">{{ t('showcase.hero.playCta') }}</button>
            <button type="button" class="cta secondary" @click="goDocs">{{ t('showcase.hero.docsCta') }}</button>
          </div>
        </div>
        <div class="hero-map">
          <div class="map-frame" :class="{ exploring }">
            <WorldMapCanvas ref="heroCanvas" :key="seed" :world-model="heroModel" :player-id="PLAYER_ID" />
            <button type="button" class="explore" @click="exploring = !exploring">
              {{ exploring ? t('showcase.hero.exploreDone') : t('showcase.hero.explore') }}
            </button>
          </div>
          <div class="map-meta">
            <span class="seed">{{ t('showcase.hero.seed', { seed }) }}</span>
            <button type="button" class="reroll" @click="reroll">{{ t('showcase.hero.reroll') }}</button>
          </div>
        </div>
      </section>

      <!-- One view -->
      <section id="one-view" class="one-view">
        <div class="one-view-frame">
          <SettlementCanvas
            :key="seed"
            :world-model="villageModel"
            :player-id="PLAYER_ID"
            :preview-center="islandCenter"
            lock-camera
            hide-settlement-badge
            background="radial-gradient(120% 100% at 68% 42%, #16414f 0%, #0d2530 55%, #0b1116 100%)"
          />
        </div>
        <div class="one-view-copy">
          <h2>{{ t('showcase.oneView.title') }}</h2>
          <p>{{ t('showcase.oneView.body') }}</p>
        </div>
      </section>

      <!-- Feature grid -->
      <section id="features" class="features">
        <h2>{{ t('showcase.features.title') }}</h2>
        <p class="section-intro">{{ t('showcase.features.intro') }}</p>
        <div class="grid">
          <div v-for="feature in FEATURES" :key="feature.key" class="card feature-card">
            <div class="thumb">
              <AtlasSprite v-if="thumbFrame(feature.art)" :frame="thumbFrame(feature.art)!" />
              <img v-else-if="thumbUrl(feature.art)" class="thumb-img" :src="thumbUrl(feature.art)!" alt="" />
            </div>
            <div class="card-text">
              <h3>{{ t(`showcase.features.items.${feature.key}.title`) }}</h3>
              <p>{{ t(`showcase.features.items.${feature.key}.body`) }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Engineering -->
      <section id="engineering" class="engineering">
        <h2>{{ t('showcase.engineering.title') }}</h2>
        <p class="section-intro">{{ t('showcase.engineering.intro') }}</p>
        <div class="grid">
          <div v-for="item in ENGINEERING" :key="item.key" class="card engineering-card">
            <h3>{{ t(`showcase.engineering.items.${item.key}.title`) }}</h3>
            <p>{{ t(`showcase.engineering.items.${item.key}.body`) }}</p>
          </div>
        </div>
        <div class="doc-links">
          <RouterLink to="/tech-tree" class="doc-link">{{ t('showcase.engineering.techTreeLink') }}</RouterLink>
          <RouterLink to="/docs/tiles" class="doc-link">{{ t('showcase.engineering.tileDocsLink') }}</RouterLink>
        </div>
      </section>

      <footer class="footer">
        <RouterLink to="/docs" class="footer-link">{{ t('showcase.footer.docs') }}</RouterLink>
        <RouterLink to="/impressum" class="footer-link">{{ t('showcase.footer.impressum') }}</RouterLink>
        <button type="button" class="footer-link footer-play" @click="goPlay">
          {{ t('showcase.footer.play') }}
        </button>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.showcase {
  width: 100%;
  height: 100vh;
  /* Mobile-readiness audit: 100dvh tracks mobile Safari's real visible
     viewport, as a progressive enhancement over the 100vh above. */
  height: 100dvh;
  overflow: auto;
  background: var(--shell);
}
.body {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px 60px;
  color: var(--text);
}

section {
  scroll-margin-top: 84px;
}

.eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold);
}

/* Hero */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
  padding-top: 12px;
}
@media (min-width: 860px) {
  .hero {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    align-items: center;
  }
}
.hero-copy h1 {
  font-size: clamp(32px, 5vw, 52px);
  margin: 8px 0 4px;
}
.tagline {
  font-size: 18px;
  color: var(--gold);
  margin: 0 0 12px;
}
.pitch {
  color: var(--muted);
  line-height: 1.6;
  max-width: 52ch;
  margin: 0 0 20px;
}
.cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.cta {
  border-radius: 999px;
  padding: 12px 22px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  border: 1px solid var(--panel-border);
}
.cta.primary {
  background: var(--gold);
  color: #20160a;
  border-color: var(--gold);
}
.cta.secondary {
  background: transparent;
  color: var(--text);
}
.cta:hover {
  filter: brightness(1.08);
}
.hero-map {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.map-frame {
  position: relative;
  height: 60vh;
  min-height: 320px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--panel-border);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
}
/* See `exploring` in the script: the canvas ignores the pointer until opted in. */
.map-frame:not(.exploring) :deep(.map-container),
.one-view-frame :deep(.map-container) {
  pointer-events: none;
}
.explore {
  position: absolute;
  right: 12px;
  bottom: 12px;
  border-radius: 999px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  background: rgba(11, 17, 22, 0.8);
  color: var(--text);
  border: 1px solid var(--panel-border);
}
.explore:hover {
  border-color: var(--gold);
  color: var(--gold);
}
.map-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.seed {
  font-size: 12px;
  color: var(--muted);
}
.reroll {
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  background: transparent;
  color: var(--text);
  border: 1px solid var(--panel-border);
}
.reroll:hover {
  border-color: var(--gold);
  color: var(--gold);
}

/* One view */
.one-view {
  margin-top: 72px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}
@media (min-width: 860px) {
  .one-view {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    align-items: center;
  }
}
.one-view-frame {
  position: relative;
  height: 48vh;
  min-height: 280px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid var(--panel-border);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
}
.one-view-copy h2 {
  margin: 0 0 10px;
}
.one-view-copy p {
  color: var(--muted);
  line-height: 1.6;
  max-width: 56ch;
}

/* Feature grid & engineering */
.features,
.engineering {
  margin-top: 72px;
}
.features h2,
.engineering h2 {
  margin: 0 0 6px;
}
.section-intro {
  color: var(--muted);
  line-height: 1.6;
  max-width: 70ch;
  margin: 0 0 24px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 16px;
}
.card {
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  background: var(--panel, #1c1710);
  padding: 16px;
}
.feature-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.thumb {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  flex: none;
  width: 56px;
  height: 84px;
  overflow: hidden;
  border-radius: 6px;
}
.thumb-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.card-text h3 {
  margin: 0 0 4px;
  font-size: 15px;
}
.card-text p,
.engineering-card p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.engineering-card h3 {
  margin: 0 0 6px;
  font-size: 15px;
}
.doc-links {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 20px;
}
.doc-link {
  color: var(--gold);
  font-size: 13px;
  text-decoration: none;
}
.doc-link:hover {
  text-decoration: underline;
}

/* Footer */
.footer {
  margin-top: 72px;
  padding-top: 24px;
  border-top: 1px solid var(--panel-border);
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  align-items: center;
}
.footer-link {
  color: var(--muted);
  font-size: 13px;
  text-decoration: none;
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  padding: 0;
}
.footer-link:hover {
  color: var(--text);
}
.footer-play {
  color: var(--gold);
  font-weight: 700;
}
</style>
