<script setup lang="ts">
// The map's `buildings-anim` clip-art setting (lib/perf/animationPreference.ts)
// — a per-device graphics preference, so it lives on the player's own
// profile next to HudPreferences.vue rather than a HUD-adjacent quick menu.
// Same segmented control as HudPreferences.vue directly above it, so the two
// settings on the page read as one set; the status line under it says what
// the current choice actually resolves to right now.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { animationPreference, type AnimationSetting } from '../../lib/perf/animationPreference';
import type { MessageSchema } from '../../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const SETTINGS: AnimationSetting[] = ['auto', 'on', 'off'];

// AnimationReason ('forced-on', ...) -> profile.graphics.status's camelCase
// key ('forcedOn', ...) — kept as a lookup rather than a string transform so
// a typo here is a missing-property error against MessageSchema instead of
// a silently-wrong runtime key.
const STATUS_KEY = {
  'forced-on': 'forcedOn',
  'forced-off': 'forcedOff',
  'reduced-motion': 'reducedMotion',
  'save-data': 'saveData',
  measuring: 'measuring',
  'auto-on': 'autoOn',
  'auto-off-slow': 'autoOffSlow',
} as const;

const statusText = computed(() => t(`profile.graphics.status.${STATUS_KEY[animationPreference.reason]}`));
</script>

<template>
  <section class="animation-preferences">
    <h3>{{ t('profile.graphics.title') }}</h3>
    <p class="hint">{{ t('profile.graphics.hint') }}</p>
    <p id="map-animations-label" class="field-label">{{ t('profile.graphics.animations') }}</p>
    <div class="setting-toggle" role="group" aria-labelledby="map-animations-label">
      <button
        v-for="setting in SETTINGS"
        :key="setting"
        type="button"
        class="option"
        :class="{ active: animationPreference.setting === setting }"
        :aria-pressed="animationPreference.setting === setting"
        @click="animationPreference.setting = setting"
      >
        {{ t(`profile.graphics.${setting}`) }}
      </button>
    </div>
    <p class="status muted">{{ statusText }}</p>
  </section>
</template>

<style scoped>
.animation-preferences h3 {
  margin: 0 0 4px;
  font-size: 16px;
}
.hint {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--muted);
}
.field-label {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 700;
}
.setting-toggle {
  display: flex;
  gap: 4px;
}
.option {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--muted);
  padding: 6px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  font-family: inherit;
}
.option:hover {
  color: var(--text);
  border-color: var(--gold);
}
.option.active {
  color: #20160a;
  background: var(--gold);
  border-color: var(--gold);
}
.status {
  margin: 8px 0 0;
  font-size: 13px;
}
.muted {
  color: var(--muted);
}
</style>
