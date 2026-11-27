<script setup lang="ts">
// The ‹ week › stepper of a weekly board: "Current" or "Week of <date>", a "Final" badge for a closed window, and for a
// player without week history a disabled, locked ‹ with a one-line note saying what premium adds (the control is
// disabled, not hidden: docs/design/premium-gating-ux.md).
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { useLeaderboardStore } from '../../stores/leaderboard';
import type { MessageSchema } from '../../i18n/schema';
import LeaderboardIcon from './LeaderboardIcon.vue';

const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const auth = useAuthStore();
const leaderboard = useLeaderboardStore();

const steps = computed(() => leaderboard.weekSteps);
const index = computed(() => Math.max(0, steps.value.indexOf(leaderboard.selectedPeriodStart)));
const hasHistory = computed(() => auth.isPremium || auth.isAdmin);
// The server only lists windows a caller may open; the free case is gated here too so the control never offers a step it would refuse.
const canStepBack = computed(() => hasHistory.value && index.value > 0);
const canStepForward = computed(() => hasHistory.value && index.value < steps.value.length - 1);

const label = computed(() =>
  leaderboard.selectedPeriodStart === null
    ? t('leaderboard.current')
    : t('leaderboard.weekOf', { date: d(new Date(leaderboard.selectedPeriodStart), 'short') }),
);

function step(delta: number) {
  const target = steps.value[index.value + delta];
  if (target !== undefined) void leaderboard.selectWindow(target);
}
</script>

<template>
  <div class="week">
    <div class="stepper" role="group" :aria-label="$t('leaderboard.weekLabel')">
      <button
        type="button"
        class="step"
        :disabled="!canStepBack"
        :aria-label="$t('leaderboard.earlierWeek')"
        data-testid="week-earlier"
        @click="step(-1)"
      >
        <LeaderboardIcon :name="hasHistory ? 'chevron-left' : 'lock'" />
      </button>
      <span class="week-label" aria-live="polite">{{ label }}</span>
      <button
        type="button"
        class="step"
        :disabled="!canStepForward"
        :aria-label="$t('leaderboard.laterWeek')"
        data-testid="week-later"
        @click="step(1)"
      >
        <LeaderboardIcon name="chevron-right" />
      </button>
    </div>
    <span v-if="leaderboard.isFinal" class="final">{{ $t('leaderboard.final') }}</span>
    <span v-if="!hasHistory" class="note" data-testid="week-premium-note">{{ $t('leaderboard.premiumWeeks') }}</span>
  </div>
</template>

<style scoped>
.week {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.stepper {
  display: flex;
  align-items: center;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 8px;
  overflow: hidden;
}
.step {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text);
  cursor: pointer;
}
.step:first-child {
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}
.step:last-child {
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}
.step:disabled {
  color: var(--muted-2);
  cursor: default;
}
.week-label {
  padding: 0 14px;
  font-size: 14px;
  white-space: nowrap;
}
.final {
  font-size: 12px;
  font-weight: 600;
  color: var(--shell);
  background: var(--muted);
  border-radius: 999px;
  padding: 4px 10px;
}
.note {
  font-size: 12px;
  color: var(--muted);
}
</style>
