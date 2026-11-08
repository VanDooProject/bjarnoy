<script setup lang="ts">
import { introText, type IntroLocale } from './introText';

/**
 * The three selling points (Multiplayer / No pay to win / Ad-free) as an icon list, shared by the intro's landing
 * page and the pre-founding map view. Texts come from the intro's `landing.features` keys. Sizes are CSS variables
 * the caller sets on this element (`--fl-icon`, `--fl-title`, `--fl-text`, `--fl-gap`, `--fl-col-gap`, `--fl-align`,
 * `--fl-text-display: none` for titles only); colours `--fl-title-color` and `--fl-text-color`.
 */
withDefaults(defineProps<{ locale: IntroLocale; /** prefix of the rows' test ids (`<prefix>-usp-<id>`); the map view sits behind the intro's landing page, so ids must differ */ idPrefix?: string }>(), { idPrefix: 'landing' });

const FEATURES = [
  { id: 'multiplayer', key: 'multiplayer' },
  { id: 'noPayToWin', key: 'noPayToWin' },
  { id: 'adFree', key: 'adFree' },
] as const;
</script>

<template>
  <ul class="feature-list">
    <li v-for="f in FEATURES" :key="f.id" class="usp" :data-testid="`${idPrefix}-usp-${f.id}`">
      <svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <template v-if="f.id === 'multiplayer'">
          <circle cx="8" cy="9" r="3" />
          <circle cx="16" cy="9" r="3" />
          <path d="M2 20c0-3 3-5 6-5s6 2 6 5M12 20c0-3 3-5 4-5 3 0 6 2 6 5" />
        </template>
        <template v-else-if="f.id === 'noPayToWin'">
          <!-- balance scale: a level field -->
          <path d="M12 3v17M7 20h10M4 7h16" />
          <path d="M6.5 7L3.5 13a3 3 0 0 0 6 0zM17.5 7l-3 6a3 3 0 0 0 6 0z" />
        </template>
        <path v-else d="M12 20.5s-8-4.6-8-10.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8 2.3c0 6-8 10.6-8 10.6z" />
      </svg>
      <b>{{ introText(locale, `landing.features.${f.key}.title`) }}</b>
      <span>{{ introText(locale, `landing.features.${f.key}.text`) }}</span>
    </li>
  </ul>
</template>

<style scoped>
:where(.feature-list) {
  display: flex;
  flex-direction: column;
  gap: var(--fl-gap, 16px);
  margin: 0;
  padding: 0;
  list-style: none;
}
.usp {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: var(--fl-col-gap, 12px);
  align-items: var(--fl-align, start);
}
.ico {
  grid-row: span 2;
  width: var(--fl-icon, 26px);
  height: var(--fl-icon, 26px);
  color: #ffc35c;
}
.usp b {
  font-size: var(--fl-title, 16px);
  font-weight: 600;
  color: var(--fl-title-color, #f4f1ea);
}
.usp span {
  display: var(--fl-text-display, inline);
  font-size: var(--fl-text, 13.5px);
  font-weight: 300;
  color: var(--fl-text-color, #d8ccbb);
  line-height: 1.4;
}
</style>
