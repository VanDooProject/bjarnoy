<script setup lang="ts">
// The landing page's guided-onboarding progress: a stepper line of three hex nodes (step number, a check once
// done) joined by a thin line, each with its building's name under it; the current step also says what to do. A
// step reads "done" the instant its building is actually standing (see onboardingGuidance.ts), not by a fixed
// step counter. Pulled out of LandingView.vue so the derivation (onboardingGuidance.ts) and the render can each
// be tested on their own. One element per node and one per connecting line segment, so each can be animated.
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { buildingName } from '../../i18n/catalogueNames';
import type { ChecklistRow, ChecklistRowKey, OnboardingGuidance } from '../../lib/map/onboardingGuidance';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { TOUCH_QUERY } from '../../lib/breakpoints';

defineProps<{
  guidance: OnboardingGuidance;
  /** The guidance arrow is on screen: tapping the current row then makes it poke its target. */
  canFocus?: boolean;
}>();

const emit = defineEmits<{ focus: [] }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const isTouch = useMediaQuery(TOUCH_QUERY);

function nameFor(key: ChecklistRowKey): string {
  return key === 'longhouse' ? t('landing.tray.longhouseName') : buildingName(key);
}

/** What to do now; only the current step says it. */
function instructionFor(row: ChecklistRow): string {
  if (row.key === 'longhouse') return isTouch.value ? t('landing.tray.tapToPlace') : t('landing.tray.clickToPlace');
  return isTouch.value ? t('landing.tray.tapEmptyHex') : t('landing.tray.clickEmptyHex');
}
</script>

<template>
  <nav
    class="steps"
    data-testid="onboarding-checklist"
    :aria-label="t('landing.tray.stepOf', { step: guidance.step, total: guidance.totalSteps })"
  >
    <component
      :is="row.state === 'current' && canFocus ? 'button' : 'div'"
      v-for="(row, index) in guidance.rows"
      :key="row.key"
      class="step"
      :class="row.state"
      :type="row.state === 'current' && canFocus ? 'button' : undefined"
      :data-testid="row.state === 'current' && canFocus ? 'onboarding-focus' : undefined"
      @click="row.state === 'current' && canFocus && emit('focus')"
    >
      <span v-if="index > 0" class="seg" aria-hidden="true" />
      <span class="node">
        <svg v-if="row.state === 'done'" class="check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        <template v-else>{{ index + 1 }}</template>
      </span>
      <b class="name">{{ nameFor(row.key) }}</b>
      <span v-if="row.state === 'current'" class="sub">{{ instructionFor(row) }}</span>
    </component>
  </nav>
</template>

<style scoped>
/* desktop: bottom-centre under the island, clear of the Play intro button at the bottom-right */
.steps {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 44px;
  z-index: 15;
  width: min(560px, calc(100vw - 32px));
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  color: #f1efe9;
  pointer-events: none;
}
.step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: center;
  pointer-events: auto;
}
button.step {
  cursor: pointer;
}
/* the line from the previous node's centre to this one's, under the nodes */
.seg {
  position: absolute;
  top: 18px;
  right: 50%;
  width: 100%;
  height: 2px;
  background: rgba(255, 255, 255, 0.18);
  z-index: 0;
}
/* hex node: the element is the outline, ::after the fill */
.node {
  position: relative;
  z-index: 1;
  isolation: isolate;
  display: grid;
  place-items: center;
  width: 34px;
  height: 38px;
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  background: #4a4743;
  color: #b9b4ab;
  font-size: 15px;
  font-weight: 600;
  transition: background-color 300ms ease, color 300ms ease;
}
.node::after {
  content: '';
  position: absolute;
  inset: 2px;
  z-index: -1;
  clip-path: inherit;
  background: #2a2826;
  transition: background-color 300ms ease;
}
.check {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.name {
  font-size: 15px;
  font-weight: 600;
  color: #b9b4ab;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.85);
  transition: color 300ms ease;
}
.sub {
  font-size: 13px;
  color: #ffc35c;
  text-wrap: balance;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.85);
}
.current .node {
  background: #ffc35c;
  color: #241a08;
}
.current .node::after {
  background: #ffc35c;
}
.current .name {
  color: #f1efe9;
}
.done .node {
  background: #ffc35c;
  color: #ffc35c;
}
.done .node::after {
  background: #3a3122;
}

/* portrait phones: full width above the Impressum row */
@media (max-width: 640px) {
  .steps {
    left: 16px;
    right: 16px;
    width: auto;
    transform: none;
    bottom: calc(44px + var(--hud-inset-bottom, 0px) + env(safe-area-inset-bottom, 0px));
  }
  .node {
    width: 30px;
    height: 34px;
    font-size: 14px;
  }
  .seg {
    top: 16px;
  }
  .name {
    font-size: 12.5px;
  }
  .sub {
    font-size: 11.5px;
  }
}

/* landscape phones: compact, bottom-right */
@media (max-height: 500px) {
  .steps {
    left: auto;
    right: 14px;
    bottom: calc(12px + var(--hud-inset-bottom, 0px) + env(safe-area-inset-bottom, 0px));
    width: 360px;
    transform: none;
  }
  .step {
    gap: 3px;
  }
  .node {
    width: 24px;
    height: 27px;
    font-size: 12px;
  }
  .seg {
    top: 12px;
  }
  .check {
    width: 13px;
    height: 13px;
  }
  .name {
    font-size: 11.5px;
  }
  .sub {
    font-size: 10.5px;
  }
}
</style>
