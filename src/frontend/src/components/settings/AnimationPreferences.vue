<script setup lang="ts">
// The map's `buildings-anim` clip-art setting (lib/perf/animationPreference.ts)
// — a per-device graphics preference, so it lives on the player's own
// profile next to HudPreferences.vue rather than a HUD-adjacent quick menu.
// Real radio inputs (not HudPreferences' segmented-button toggle) since
// there are three named, mutually exclusive choices rather than a two-way
// toggle, and the live status line below needs to read naturally as
// describing "the current choice", which a labelled radio group does for
// free via its own semantics.
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
    <h2>{{ t('profile.graphics.title') }}</h2>
    <p class="hint">{{ t('profile.graphics.hint') }}</p>
    <div class="setting-row" role="radiogroup" :aria-label="t('profile.graphics.animations')">
      <label v-for="setting in SETTINGS" :key="setting" class="option">
        <input
          type="radio"
          name="animation-setting"
          :value="setting"
          :checked="animationPreference.setting === setting"
          @change="animationPreference.setting = setting"
        />
        {{ t(`profile.graphics.${setting}`) }}
      </label>
    </div>
    <p class="status muted">{{ statusText }}</p>
  </section>
</template>

<style scoped>
.animation-preferences h2 {
  margin: 0 0 4px;
}
.hint {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--muted);
}
.setting-row {
  display: flex;
  gap: 16px;
}
.option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
}
.status {
  margin: 8px 0 0;
  font-size: 13px;
}
.muted {
  color: var(--muted);
}
</style>
