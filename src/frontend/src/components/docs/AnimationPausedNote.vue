<script setup lang="ts">
// Shown on a docs page whose art animates (the wildlife camps, the wasted lands' giants) while the
// docs' animation clock is held still (useAnimationClock.ts): the device asks for reduced motion
// or saves data on the 'auto' setting, or animations are switched off. The setting is per device
// and lives on the profile page, which needs an account - so without this a visitor who has none
// only ever sees still frames, with no way to start them. "Play animations" sets the same
// per-device setting the profile page does, and the clocks pick it up at once.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { animationPreference } from '../../lib/perf/animationPreference';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

/** Why the docs' clock is held, or null when it runs - the same rule as `useAnimationClock`'s `clockShouldRun`. */
const reason = computed<'off' | 'reducedMotion' | 'saveData' | null>(() => {
  const setting = animationPreference.setting;
  if (setting === 'on') return null;
  if (setting === 'off') return 'off';
  if (animationPreference.reducedMotion) return 'reducedMotion';
  if (animationPreference.saveData) return 'saveData';
  return null;
});
</script>

<template>
  <p v-if="reason" class="animation-paused" role="status" data-testid="animation-paused">
    <span>{{ t(`docs.animations.paused.${reason}`) }}</span>
    <button type="button" class="play" @click="animationPreference.setting = 'on'">
      {{ t('docs.animations.play') }}
    </button>
  </p>
</template>

<style scoped>
.animation-paused {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 12px 0;
  padding: 10px 14px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--panel, #1c1710);
  color: var(--muted);
  font-size: 13px;
}
.play {
  background: var(--gold);
  border: 1px solid var(--gold);
  color: #20160a;
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
}
</style>
