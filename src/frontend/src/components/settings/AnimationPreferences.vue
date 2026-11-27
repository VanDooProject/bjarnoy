<script setup lang="ts">
// Graphics preferences (per device, localStorage): the motion settings, the
// render resolution and "Smooth edges". Buildings = the map's
// `buildings-anim` clip art (lib/perf/animationPreference.ts); resolution is
// lib/perf/resolutionPreference.ts; water, fog and HUD menus are
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
import { frameActivityState } from '../../lib/perf/frameGovernors';
import type { GovernorProgress } from '../../lib/perf/fpsGovernor';
import { motionPreferences, type MotionSetting } from '../../lib/perf/motionPreferences';
import { resolutionPreference, type ResolutionSetting } from '../../lib/perf/resolutionPreference';
import type { MessageSchema } from '../../i18n/schema';

const { t, n } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

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

const RESOLUTION_STATUS_KEY = {
  forced: 'forced',
  'device-max': 'deviceMax',
  measuring: 'measuring',
  'auto-max': 'autoMax',
  'auto-down': 'autoDown',
} as const;

const statusText = computed(() => t(`profile.graphics.status.${STATUS_KEY[animationPreference.reason]}`));

const resolutionValue = (value: number) => t('profile.graphics.resolutionValue', { value: n(value, 'scale') });
const resolutionStatusText = computed(() =>
  t(`profile.graphics.resolutionStatus.${RESOLUTION_STATUS_KEY[resolutionPreference.reason]}`, {
    value: resolutionValue(resolutionPreference.effective),
  }),
);

/** The one formatter of a governor's live readout, for the buildings and the resolution row. */
function measureLine(progress: GovernorProgress): string {
  const { fps, window, goodMs, requiredMs, thresholdFps } = progress;
  if (fps === null) return t('profile.graphics.measure.none');
  if (window === null) return t('profile.graphics.measure.current', { fps: Math.round(fps) });
  return t(`profile.graphics.measure.${window}`, {
    fps: Math.round(fps),
    good: Math.floor(goodMs / 1000),
    required: Math.round(requiredMs / 1000),
    threshold: thresholdFps,
  });
}

// Counting pauses while frames do not measure the device (hidden tab, unfocused window, browser frame cap, just resumed).
function liveMeasureText(progress: GovernorProgress): string {
  if (frameActivityState.mode === 'background' && frameActivityState.reason) {
    return t(`profile.graphics.measure.paused.${frameActivityState.reason}`);
  }
  return measureLine(progress);
}

const measureText = computed(() => liveMeasureText(animationPreference.progress));
const resolutionMeasureText = computed(() => liveMeasureText(resolutionPreference.progress));

const deviceReduced = computed(() => animationPreference.reducedMotion);
const osHint = computed(() => t(`profile.graphics.device.hint.${currentDeviceOs()}`));

interface MotionRow {
  id: 'buildings' | 'resolution' | 'water' | 'lakes' | 'fog' | 'menus';
  group: 'map' | 'hud';
  options: () => { value: string; label: string; active: boolean }[];
  set: (value: string) => void;
}

function motionOptions(current: () => MotionSetting) {
  return () => SETTINGS.map((value) => ({ value, label: t(`profile.graphics.${value}`), active: current() === value }));
}

// Auto, then the levels this screen offers from the highest to the lowest.
function resolutionOptions() {
  const auto = resolutionPreference.setting === 'auto';
  return [
    { value: 'auto', label: t('profile.graphics.auto'), active: auto },
    ...[...resolutionPreference.levels].reverse().map((level) => ({
      value: String(level),
      label: resolutionValue(level),
      active: !auto && resolutionPreference.effective === level,
    })),
  ];
}

const ROWS: MotionRow[] = [
  {
    id: 'buildings',
    group: 'map',
    options: motionOptions(() => animationPreference.setting),
    set: (v) => (animationPreference.setting = v as AnimationSetting),
  },
  {
    id: 'resolution',
    group: 'map',
    options: resolutionOptions,
    set: (v) => (resolutionPreference.setting = v as ResolutionSetting),
  },
  { id: 'water', group: 'map', options: motionOptions(() => motionPreferences.water), set: (v) => (motionPreferences.water = v as MotionSetting) },
  { id: 'lakes', group: 'map', options: motionOptions(() => motionPreferences.lakes), set: (v) => (motionPreferences.lakes = v as MotionSetting) },
  { id: 'fog', group: 'map', options: motionOptions(() => motionPreferences.fog), set: (v) => (motionPreferences.fog = v as MotionSetting) },
  { id: 'menus', group: 'hud', options: motionOptions(() => motionPreferences.hud), set: (v) => (motionPreferences.hud = v as MotionSetting) },
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
      <div
        v-for="row in ROWS.filter((r) => r.group === group)"
        :key="row.id"
        class="row"
        :data-testid="row.id === 'resolution' ? 'graphics-resolution' : undefined"
      >
        <p class="field-label">
          <span :id="`motion-${row.id}-label`">{{ t(`profile.graphics.${row.id}`) }}</span>
          <span class="sub">{{ t(`profile.graphics.${row.id}Sub`) }}</span>
        </p>
        <div class="setting-toggle" role="group" :aria-labelledby="`motion-${row.id}-label`" :data-testid="`motion-${row.id}`">
          <button
            v-for="option in row.options()"
            :key="option.value"
            type="button"
            class="option"
            :class="{ active: option.active }"
            :aria-pressed="option.active"
            @click="row.set(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
        <template v-if="row.id === 'buildings'">
          <p class="status muted">{{ statusText }}</p>
          <p class="status muted small" data-testid="animation-measure">{{ measureText }}</p>
        </template>
        <template v-else-if="row.id === 'resolution'">
          <p class="status muted" data-testid="resolution-status">{{ resolutionStatusText }}</p>
          <p class="status muted small" data-testid="resolution-measure">{{ resolutionMeasureText }}</p>
        </template>
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
  flex-wrap: wrap;
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
