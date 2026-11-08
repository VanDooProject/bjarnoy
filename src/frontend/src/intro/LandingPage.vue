<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { introText, type IntroLocale } from './introText';
import FeatureList from './FeatureList.vue';
import ImpressumLink from './ImpressumLink.vue';

/**
 * The landing page: shown over the intro's first scene until the player starts the saga (with or without sound) or goes
 * to the map. The map button shows how far the map has loaded; pressed while loading it arms and opens the map as
 * soon as loading completes.
 */
const props = defineProps<{ locale: IntroLocale; /** 0..1, see `mapLoadFraction` */ loadFraction: number }>();
const emit = defineEmits<{ hear: []; muted: []; map: [] }>();

const t = (key: string, params?: Record<string, string | number>) => introText(props.locale, `landing.${key}`, params);

const pct = computed(() => Math.floor(Math.min(1, Math.max(0, props.loadFraction)) * 100));
const ready = computed(() => props.loadFraction >= 1);
const armed = ref(false);
const loadState = computed(() => (ready.value ? 'ready' : armed.value ? 'armed' : 'loading'));
const mapLabel = computed(() => (ready.value ? t('map') : armed.value ? t('mapArmed', { pct: pct.value }) : t('mapLoading', { pct: pct.value })));

function onMap(): void {
  if (ready.value) emit('map');
  else armed.value = !armed.value;
}
watch(ready, (isReady) => {
  if (isReady && armed.value) {
    armed.value = false;
    emit('map');
  }
});

// the game's name is not translated
const TITLE = 'BJARNØY';
</script>

<template>
  <div class="landing-page" data-testid="landing-page">
    <div class="left">
      <div class="copy">
        <h1 class="title">{{ TITLE }}</h1>
        <p class="tag">{{ t('tagline') }}</p>
      </div>
      <div class="ctas">
        <div class="sw">
          <button type="button" class="btn saga" data-testid="landing-hear" @click="emit('hear')">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
            {{ t('hear') }}
          </button>
          <button type="button" class="mlink" data-testid="landing-muted" @click="emit('muted')">{{ t('muted') }}</button>
        </div>
        <button
          type="button"
          class="btn map"
          :class="loadState"
          :aria-pressed="ready ? undefined : armed"
          data-testid="landing-map"
          :data-load-state="loadState"
          @click="onMap"
        >
          <span class="lbl">
            {{ mapLabel }}
            <span v-if="ready" class="rtag">{{ t('ready') }}</span>
          </span>
          <span class="bar" :style="{ width: ready ? '0%' : `${pct}%` }" />
        </button>
      </div>
    </div>

    <FeatureList class="usps" :locale="locale" />

    <ImpressumLink class="legal" :locale="locale" />
  </div>
</template>

<style scoped>
/* font inherits the intro's. Base = portrait phone: title and list on top, buttons at the bottom, Impressum below */
.landing-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: max(80px, calc(env(safe-area-inset-top) + 64px)) 0 max(14px, env(safe-area-inset-bottom));
  overflow: hidden;
  color: #f4f1ea;
}
.landing-page.intro-fade-leave-active {
  pointer-events: none;
}
.left {
  display: contents;
}
/* .left is display: contents here, so its children order against the list and the link */
.copy {
  order: 1;
}
.usps {
  order: 2;
}
.ctas {
  order: 3;
}
.legal {
  order: 4;
}
.copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  text-align: center;
}
.title {
  margin: 0;
  font-weight: 300;
  font-size: 46px;
  letter-spacing: 0.18em;
  text-indent: 0.18em;
  line-height: 1;
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.8);
}
.tag {
  margin: 0;
  font-size: 16px;
  font-weight: 300;
  color: #e6d9c4;
}
.usps {
  position: relative;
  margin: 22px 0 0;
  padding: 0 28px;
}
.usps::before {
  content: '';
  position: absolute;
  inset: -20px -10px;
  z-index: -1;
  background: radial-gradient(closest-side, rgba(10, 6, 4, 0.72), rgba(10, 6, 4, 0.45) 60%, transparent);
  pointer-events: none;
}
.ctas {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  margin-top: auto;
  padding: 0 20px;
}
.sw {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.sw > .btn {
  align-self: stretch;
}
.btn {
  position: relative;
  overflow: hidden;
  min-height: 52px;
  padding: 0 24px;
  border-radius: 8px;
  font: inherit;
  font-size: 18px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-sizing: border-box;
}
.saga {
  background: rgba(36, 16, 8, 0.72);
  border: 1px solid rgba(240, 122, 44, 0.75);
  color: #ffd9a0;
  box-shadow: 0 0 22px rgba(240, 122, 44, 0.22), inset 0 0 14px rgba(240, 122, 44, 0.12);
}
.saga:hover {
  border-color: #f07a2c;
  color: #ffe6c0;
  box-shadow: 0 0 30px rgba(240, 122, 44, 0.35), inset 0 0 14px rgba(240, 122, 44, 0.18);
}
.map {
  background: rgba(14, 12, 11, 0.72);
  border: 1px solid rgba(244, 241, 234, 0.42);
  color: #f4f1ea;
  transition: border-color 400ms ease, box-shadow 400ms ease;
}
.map.ready {
  border-color: rgba(255, 195, 92, 0.9);
  box-shadow: 0 0 18px rgba(255, 195, 92, 0.25);
}
.map.armed {
  border-color: rgba(240, 122, 44, 0.75);
}
.lbl {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-variant-numeric: tabular-nums;
}
.rtag {
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 195, 92, 0.18);
  color: #ffc35c;
}
.bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  background: linear-gradient(90deg, #c2401a, #ffc35c);
  transition: width 300ms linear;
}
.mlink {
  background: none;
  border: none;
  color: #cbbfae;
  font: inherit;
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 4px;
  cursor: pointer;
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legal {
  align-self: center;
  margin-top: 10px;
  font-size: 13px;
}

/* split layout (desktop and landscape phone): title and buttons left, the list right of the fire, Impressum bottom-right */
@media (min-width: 641px), (orientation: landscape) and (max-height: 500px) {
  .landing-page {
    display: block;
    padding: 0;
  }
  .left {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .copy {
    align-items: flex-start;
    padding: 0;
    text-align: left;
  }
  .title {
    text-indent: 0;
  }
  .ctas {
    align-items: stretch;
    margin-top: 0;
    padding: 0;
  }
  .usps {
    position: absolute;
    margin: 0;
    padding: 0;
  }
  .usps::before {
    inset: -40px -50px;
  }
  .legal {
    position: absolute;
    right: max(18px, env(safe-area-inset-right));
    bottom: max(14px, env(safe-area-inset-bottom));
    margin: 0;
  }
}

/* desktop */
@media (min-width: 641px) and (min-height: 501px) {
  .left {
    left: 72px;
    top: 18.5vh;
    width: 290px;
  }
  .copy {
    gap: 14px;
  }
  .title {
    font-size: 76px;
  }
  .tag {
    font-size: 20px;
    width: 400px;
  }
  .ctas {
    gap: 14px;
    margin-top: 38px;
  }
  .usps {
    left: 67%;
    top: 24vh;
    width: 360px;
    --fl-gap: 26px;
    --fl-col-gap: 16px;
    --fl-icon: 34px;
    --fl-title: 19px;
    --fl-text: 15.5px;
  }
  .legal {
    font-size: 14px;
  }
}

/* landscape phone: compact, everything within 390px of height */
@media (orientation: landscape) and (max-height: 500px) {
  .left {
    left: max(28px, env(safe-area-inset-left));
    top: 34px;
    width: 210px;
  }
  .copy {
    gap: 6px;
  }
  .title {
    font-size: 42px;
  }
  .tag {
    font-size: 14.5px;
    width: 340px;
  }
  .ctas {
    gap: 10px;
    margin-top: 22px;
  }
  .btn {
    min-height: 42px;
    font-size: 15px;
    padding: 0 8px;
  }
  .map {
    font-size: 13px;
    white-space: nowrap;
  }
  .mlink {
    font-size: 12.5px;
    min-height: 28px;
  }
  .usps {
    left: 64%;
    top: 72px;
    width: 280px;
    --fl-gap: 18px;
    --fl-align: center;
    --fl-icon: 24px;
    --fl-title: 15px;
    --fl-text-display: none;
  }
  .usps::before {
    inset: -30px -40px;
  }
  .legal {
    font-size: 12px;
  }
}
</style>
