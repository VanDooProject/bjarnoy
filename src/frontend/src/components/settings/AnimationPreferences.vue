<script setup lang="ts">
// Graphics preferences (per device, localStorage): the motion settings and
// "Smooth edges". Buildings = the map's `buildings-anim` clip art
// (lib/perf/animationPreference.ts); water, fog and HUD menus are
// lib/perf/motionPreferences.ts. Each motion row is Auto | On | Off, where
// Auto follows the device's own "reduce motion" setting, shown at the top so
// the player can see what Auto resolves to and where to change it. Same
// segmented control as HudPreferences.vue directly above it, so the two
// sections read as one set.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { animationPreference, type AnimationSetting } from '../../lib/perf/animationPreference';
import { antialiasPreference, type AntialiasSetting } from '../../lib/perf/antialiasPreference';
import { currentDeviceOs } from '../../lib/perf/deviceOs';
import { motionPreferences, type MotionSetting } from '../../lib/perf/motionPreferences';
import type { MessageSchema } from '../../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const SETTINGS: AnimationSetting[] = ['auto', 'on', 'off'];
const ANTIALIAS_SETTINGS: AntialiasSetting[] = ['on', 'off'];

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

const deviceReduced = computed(() => animationPreference.reducedMotion);
const osHint = computed(() => t(`profile.graphics.device.hint.${currentDeviceOs()}`));

interface MotionRow {
  id: 'buildings' | 'water' | 'fog' | 'menus';
  group: 'map' | 'hud';
  current: () => MotionSetting;
  set: (value: MotionSetting) => void;
}

const ROWS: MotionRow[] = [
  { id: 'buildings', group: 'map', current: () => animationPreference.setting, set: (v) => (animationPreference.setting = v) },
  { id: 'water', group: 'map', current: () => motionPreferences.water, set: (v) => (motionPreferences.water = v) },
  { id: 'fog', group: 'map', current: () => motionPreferences.fog, set: (v) => (motionPreferences.fog = v) },
  { id: 'menus', group: 'hud', current: () => motionPreferences.hud, set: (v) => (motionPreferences.hud = v) },
];
const GROUPS = ['map', 'hud'] as const;
</script>

<template>
  <section class="animation-preferences">
    <h3>{{ t('profile.graphics.title') }}</h3>
    <p class="hint">{{ t('profile.graphics.hint') }}</p>

    <div class="device-line" data-testid="device-motion">
      <p class="device-state">
        {{ t('profile.graphics.device.label') }}
        <strong class="device-badge" :class="{ on: deviceReduced }" data-testid="device-motion-state">{{
          deviceReduced ? t('profile.graphics.device.on') : t('profile.graphics.device.off')
        }}</strong>
      </p>
      <p class="muted small">{{ osHint }} {{ t('profile.graphics.device.autoNote') }}</p>
    </div>

    <template v-for="group in GROUPS" :key="group">
      <p class="group-label">{{ t(group === 'map' ? 'profile.graphics.groupMap' : 'profile.graphics.groupHud') }}</p>
      <div v-for="row in ROWS.filter((r) => r.group === group)" :key="row.id" class="row">
        <p class="field-label">
          <span :id="`motion-${row.id}-label`">{{ t(`profile.graphics.${row.id}`) }}</span>
          <span class="sub">{{ t(`profile.graphics.${row.id}Sub`) }}</span>
        </p>
        <div class="setting-toggle" role="group" :aria-labelledby="`motion-${row.id}-label`" :data-testid="`motion-${row.id}`">
          <button
            v-for="setting in SETTINGS"
            :key="setting"
            type="button"
            class="option"
            :class="{ active: row.current() === setting }"
            :aria-pressed="row.current() === setting"
            @click="row.set(setting)"
          >
            {{ t(`profile.graphics.${setting}`) }}
          </button>
        </div>
        <p v-if="row.id === 'buildings'" class="status muted">{{ statusText }}</p>
      </div>
    </template>

    <p id="map-antialias-label" class="field-label antialias-label">{{ t('profile.graphics.antialias') }}</p>
    <div class="setting-toggle antialias-toggle" role="group" aria-labelledby="map-antialias-label">
      <button
        v-for="setting in ANTIALIAS_SETTINGS"
        :key="setting"
        type="button"
        class="option"
        :class="{ active: antialiasPreference.setting === setting }"
        :aria-pressed="antialiasPreference.setting === setting"
        @click="antialiasPreference.setting = setting"
      >
        {{ t(`profile.graphics.${setting}`) }}
      </button>
    </div>
    <p class="status muted">{{ t('profile.graphics.antialiasHint') }}</p>
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
.row {
  margin-bottom: 12px;
}
.row .field-label {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
}
.sub {
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
}
.group-label {
  margin: 14px 0 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gold);
}
.device-line {
  margin: 0 0 4px;
  padding: 8px 10px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
}
.device-state {
  margin: 0 0 2px;
  font-size: 13px;
  font-weight: 700;
}
.device-badge {
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.06em;
  border: 1px solid var(--panel-border);
  color: var(--muted);
}
.device-badge.on {
  color: #20160a;
  background: var(--gold);
  border-color: var(--gold);
}
.small {
  margin: 0;
  font-size: 12px;
}
.antialias-label {
  margin-top: 14px;
}
</style>
