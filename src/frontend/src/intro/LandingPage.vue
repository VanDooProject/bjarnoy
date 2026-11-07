<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { introText, type IntroLocale } from './introText';

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

const FEATURES = [
  { id: 'multiplayer', key: 'multiplayer' },
  { id: 'noPayToWin', key: 'noPayToWin' },
  { id: 'adFree', key: 'adFree' },
] as const;
</script>

<template>
  <div class="landing-page" data-testid="landing-page">
    <div class="copy">
      <h1 class="title">BJARNØY</h1>
      <p class="tag">{{ t('tagline') }}</p>
      <ul class="usps">
        <li v-for="f in FEATURES" :key="f.id" class="usp" :data-testid="`landing-usp-${f.id}`">
          <b>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <template v-if="f.id === 'multiplayer'">
                <circle cx="8" cy="9" r="3" />
                <circle cx="16" cy="9" r="3" />
                <path d="M2 20c0-3 3-5 6-5s6 2 6 5M12 20c0-3 3-5 4-5 3 0 6 2 6 5" />
              </template>
              <template v-else-if="f.id === 'noPayToWin'">
                <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
                <path d="M8.5 12l2.5 2.5 4.5-5" />
              </template>
              <path v-else d="M12 20.5s-8-4.6-8-10.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8 2.3c0 6-8 10.6-8 10.6z" />
            </svg>
            {{ t(`features.${f.key}.title`) }}
          </b>
          <span>{{ t(`features.${f.key}.text`) }}</span>
        </li>
      </ul>
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
</template>

<style scoped>
/* font inherits the intro's; the page scrolls instead of overlapping on a short landscape phone */
.landing-page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 24px;
  box-sizing: border-box;
  padding: max(72px, 9vh) 16px max(44px, env(safe-area-inset-bottom));
  overflow-y: auto;
  color: #f4f1ea;
}
.landing-page.intro-fade-leave-active {
  pointer-events: none;
}
.copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}
.title {
  margin: 0;
  font-weight: 300;
  font-size: 88px;
  letter-spacing: 0.18em;
  text-indent: 0.18em;
  line-height: 1;
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.8);
}
.tag {
  margin: 0;
  font-size: 19px;
  font-weight: 300;
  color: #e6d9c4;
}
.usps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  max-width: 980px;
  margin: 18px 0 0;
  padding: 0;
  list-style: none;
}
.usp {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  padding: 16px 18px;
  border-radius: 10px;
  background: rgba(18, 12, 8, 0.62);
  border: 1px solid rgba(240, 122, 44, 0.28);
}
.usp b {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 19px;
  font-weight: 600;
  color: #ffc35c;
}
.usp span {
  font-size: 15px;
  font-weight: 300;
  color: #d8ccbb;
  line-height: 1.35;
}
.ctas {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: flex-start;
  gap: 14px;
}
.sw {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.btn {
  position: relative;
  overflow: hidden;
  min-height: 52px;
  min-width: 270px;
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

/* phones */
@media (max-width: 640px) {
  .landing-page {
    padding-bottom: max(24px, env(safe-area-inset-bottom));
  }
  .copy {
    gap: 8px;
  }
  .title {
    font-size: 52px;
  }
  .tag {
    font-size: 16px;
  }
  .usps {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    margin-top: 8px;
  }
  .usp {
    flex-direction: row;
    align-items: baseline;
    gap: 10px;
    padding: 10px 12px;
    text-align: left;
  }
  .usp b {
    font-size: 16px;
    flex: 0 0 auto;
  }
  .usp span {
    font-size: 14px;
  }
  .ctas {
    flex-direction: column;
    align-items: stretch;
  }
  .sw {
    align-self: stretch;
  }
  .sw > .btn {
    align-self: stretch;
  }
  .btn {
    min-width: 0;
  }
}
</style>
