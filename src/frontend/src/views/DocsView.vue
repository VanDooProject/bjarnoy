<script setup lang="ts">
import { computed, nextTick, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import DocsPageLayout from '../components/docs/DocsPageLayout.vue';
import AnimatedCamp from '../components/docs/AnimatedCamp.vue';
import AnimatedBuildingSprite from '../components/AnimatedBuildingSprite.vue';
import AtlasSprite from '../components/AtlasSprite.vue';
import { findAtlasFrame, type AtlasFrameRect } from '../lib/map/atlas';
import { buildingLayers } from '../lib/map/buildingArt';
import { useAnimationClock } from '../composables/useAnimationClock';
import { DOCS_GROUPS } from '../lib/docs/docsPages';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const GROUPS = DOCS_GROUPS;

// The page scrolls inside its own container, where the browser's hash scrolling does not reach: `/docs#group-island`
// (the breadcrumb's group menu) scrolls to that group's section here, on arrival and when the hash changes.
const route = useRoute();
async function scrollToHash() {
  await nextTick();
  const id = route.hash.slice(1);
  if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' });
}
onMounted(scrollToHash);
watch(() => route.hash, scrollToHash);

const utgard = computed(() => findAtlasFrame('showcase', 'giantutgard_SE_level000'));
// AtlasSprite keeps the frame's aspect ratio, so a width of min(100%, box
// height x ratio) contain-fits it into a box of the given size.
function fit(frame: AtlasFrameRect, boxHeight: number) {
  return { width: `min(100%, ${(boxHeight * frame.frame.w) / frame.frame.h}px)` };
}
function frameOf(art: string) {
  return art.startsWith('camp:') || art.startsWith('anim:') ? undefined : findAtlasFrame('showcase', art);
}

// A building card plays its `buildings-anim` clip on the docs clock, which holds
// still under reduced motion, Save-Data or "animations off" (useAnimationClock.ts).
const now = useAnimationClock();
function animatedOf(art: string) {
  if (!art.startsWith('anim:')) return undefined;
  const [, family, level] = art.split(':');
  const layers = buildingLayers(family!, Number(level));
  const canvas = layers.base?.sourceSize ?? layers.top?.sourceSize;
  if (!layers.clip || !canvas) return undefined;
  return { layers, style: { width: `min(100%, ${(84 * canvas.w) / canvas.h}px)` } };
}
/** The still showcase frame of an `anim:` card, for as long as its clip is not there. */
function stillOf(art: string) {
  const [, family, level] = art.split(':');
  return findAtlasFrame('showcase', `${family}_SE_level${String(level).padStart(3, '0')}`);
}
</script>

<template>
  <DocsPageLayout class="docs" :title="$t('docs.hub.title')" caption="DOCS" :breadcrumb="false" hero>
    <section class="hero">
      <div class="hero-text">
        <h1>{{ t('docs.hub.heading') }}</h1>
        <p class="lede">{{ t('docs.hub.intro') }}</p>
      </div>
      <div class="hero-art" data-testid="docs-hero-art">
        <AtlasSprite v-if="utgard" :frame="utgard" :aria-label="t('docs.hub.artAlt')" :style="fit(utgard, 250)" class="utgard" />
      </div>
    </section>

    <div class="groups">
      <section v-for="group in GROUPS" :id="`group-${group.id}`" :key="group.id" class="group" :data-group="group.id">
        <h2>{{ t(group.titleKey) }}</h2>
        <p class="group-desc">{{ t(group.descriptionKey) }}</p>
        <RouterLink v-for="page in group.pages" :key="page.id" :to="page.to" class="card" :data-page="page.id">
          <span class="art" data-testid="docs-card-art" aria-hidden="true">
            <AnimatedCamp v-if="page.art.startsWith('camp:')" :family="page.art.slice(5)" orientation="SE" />
            <AnimatedBuildingSprite
              v-else-if="animatedOf(page.art)"
              :layers="animatedOf(page.art)!.layers"
              :elapsed-ms="now"
              :style="animatedOf(page.art)!.style"
            />
            <AtlasSprite v-else-if="page.art.startsWith('anim:') && stillOf(page.art)" :frame="stillOf(page.art)!" :style="fit(stillOf(page.art)!, 84)" />
            <AtlasSprite v-else-if="frameOf(page.art)" :frame="frameOf(page.art)!" :style="fit(frameOf(page.art)!, 84)" />
          </span>
          <span class="text">
            <span class="title">{{ t(page.titleKey) }}</span>
            <span class="desc">{{ t(page.descriptionKey) }}</span>
          </span>
        </RouterLink>
      </section>
    </div>

    <p class="footer">
      {{ t('docs.hub.footer.lead') }}
      <RouterLink to="/showcase">{{ t('docs.hub.footer.link') }}</RouterLink>
    </p>
  </DocsPageLayout>
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 24px;
  padding: 28px 32px;
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  background:
    radial-gradient(ellipse at 75% 60%, rgba(79, 209, 197, 0.12), transparent 60%),
    linear-gradient(180deg, #0e161c, #0b1116);
}
.hero h1 {
  margin: 0 0 12px;
  font-size: 34px;
  font-weight: 700;
}
.lede {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}
.hero-art {
  width: 300px;
  height: 250px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.utgard {
  filter: drop-shadow(0 10px 14px rgba(0, 0, 0, 0.55));
}
.groups {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 28px;
  margin-top: 28px;
}
/* Four groups of 2-4 cards: one column on a phone, two from a tablet up (the page column is only 90ch wide). */
@media (min-width: 700px) {
  .groups {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 32px 28px;
  }
}
.group {
  scroll-margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.group h2 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gold);
}
.group-desc {
  margin: -8px 0 0;
  font-size: 13px;
  color: var(--muted);
}
.card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 12px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: var(--panel, #1c1710);
  color: var(--text);
  text-decoration: none;
  transition:
    border-color 0.15s,
    transform 0.15s;
}
.art {
  flex: none;
  width: 84px;
  height: 84px;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.5));
  transition: transform 0.15s;
}
.text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.title {
  font-size: 16px;
  font-weight: 700;
}
.desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.45;
}
.card:hover,
.card:focus-visible {
  border-color: var(--gold);
  transform: translateY(-2px);
}
.card:hover .art,
.card:focus-visible .art {
  transform: translateY(-4px) scale(1.05);
}
.card:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}
.footer {
  margin: 32px 0 0;
  padding-top: 16px;
  border-top: 1px solid var(--panel-border);
  font-size: 14px;
  color: var(--muted);
}
.footer a {
  color: var(--gold);
}
@media (max-width: 760px) {
  .hero {
    grid-template-columns: 1fr;
    padding: 22px 20px;
  }
  .hero-art {
    width: 100%;
    height: 220px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .card,
  .art {
    transition: none;
  }
  .card:hover,
  .card:focus-visible,
  .card:hover .art,
  .card:focus-visible .art {
    transform: none;
  }
}
</style>
