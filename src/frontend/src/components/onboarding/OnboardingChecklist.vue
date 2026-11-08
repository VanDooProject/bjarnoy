<script setup lang="ts">
// The landing page's guided-onboarding progress: a stepper line of three hex nodes (step number, a check once
// done) joined by a thin line, each with its building's name under it; the current step also says what to do. A
// step reads "done" the instant its building is actually standing (see onboardingGuidance.ts), not by a fixed
// step counter. Pulled out of LandingView.vue so the derivation (onboardingGuidance.ts) and the render can each
// be tested on their own. One element per node and one per connecting line segment, so each can be animated.
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { buildingName } from '../../i18n/catalogueNames';
import type { ChecklistRow, ChecklistRowKey, OnboardingGuidance } from '../../lib/map/onboardingGuidance';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { TOUCH_QUERY } from '../../lib/breakpoints';
import { motionPreferences } from '../../lib/perf/motionPreferences';

const props = defineProps<{
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

// Progress animation. Only a real state change plays it, never the first render. Per step the classes are:
// `just-done` (the node flips to its tick), `line-in` (the ember runs along the line into the step and fills it),
// `ignite` (the step becomes current: glow, colours, instruction). They stay until the next change, so nothing
// restarts mid-way; the timings live in the CSS custom properties on `.steps`. With the HUD motion setting off
// (which also follows the device's reduced-motion setting, see motionPreferences) nothing of it plays and states
// just fade.
const reduced = computed(() => !motionPreferences.hudEnabled);
const fx = ref<string[]>(props.guidance.rows.map(() => ''));
const allDone = ref(false);
watch(
  () => props.guidance.rows.map((row) => row.state),
  (now, before) => {
    if (reduced.value) {
      fx.value = now.map(() => '');
      allDone.value = false;
      return;
    }
    const next = now.map(() => new Set<string>());
    before.forEach((was, i) => {
      if (was === 'done' || now[i] !== 'done') return;
      next[i].add('just-done');
      if (i + 1 < now.length) {
        next[i + 1].add('line-in');
        if (now[i + 1] === 'current') next[i + 1].add('ignite');
      }
    });
    fx.value = next.map((classes) => [...classes].join(' '));
    allDone.value = now.every((state) => state === 'done') && before.some((state) => state !== 'done');
  },
);

/** What to do now; only the current step says it. */
function instructionFor(row: ChecklistRow): string {
  if (row.key === 'longhouse') return isTouch.value ? t('landing.tray.tapToPlace') : t('landing.tray.clickToPlace');
  return isTouch.value ? t('landing.tray.tapEmptyHex') : t('landing.tray.clickEmptyHex');
}
</script>

<template>
  <nav
    class="steps"
    :class="{ 'is-reduced': reduced, 'all-done': allDone }"
    data-testid="onboarding-checklist"
    :aria-label="t('landing.tray.stepOf', { step: guidance.step, total: guidance.totalSteps })"
  >
    <component
      :is="row.state === 'current' && canFocus ? 'button' : 'div'"
      v-for="(row, index) in guidance.rows"
      :key="row.key"
      class="step"
      :class="[row.state, fx[index]]"
      :type="row.state === 'current' && canFocus ? 'button' : undefined"
      :data-testid="row.state === 'current' && canFocus ? 'onboarding-focus' : undefined"
      @click="row.state === 'current' && canFocus && emit('focus')"
    >
      <span v-if="index > 0" class="seg" aria-hidden="true"><i class="fill" /><i class="ember" /></span>
      <i class="glow" aria-hidden="true" />
      <span class="node">
        <span class="num">{{ index + 1 }}</span>
        <svg class="check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
      <b class="name">{{ nameFor(row.key) }}</b>
      <span v-if="row.state === 'current'" class="sub">{{ instructionFor(row) }}</span>
    </component>
  </nav>
</template>

<style scoped>
/* Timings of the progress animation, in one place (the JS only decides which classes apply). */
.steps {
  --t-state: 300ms;
  --t-flip: 0.5s;
  --t-tick-delay: 0.25s;
  --t-ember: 0.7s;
  --t-ember-delay: 0.3s;
  --t-ember-ease: cubic-bezier(0.5, 0, 0.5, 1);
  --t-ignite-at: 0.95s;
  --t-ignite: 0.6s;
  --t-sub-at: 1.15s;
  --t-breathe: 2.4s;
  --t-wave: 0.6s;
  --t-wave-stagger: 0.12s;
  --node-w: 34px;
  --node-h: 38px;
}
.steps.is-reduced {
  --t-state: 150ms;
}

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
/* the line from the previous node's centre to this one's, under the nodes; the fill is gold once the step is reached */
.seg {
  position: absolute;
  top: calc(var(--node-h) / 2 - 1px);
  right: 50%;
  width: 100%;
  height: 2px;
  background: rgba(255, 255, 255, 0.18);
  z-index: 0;
}
.fill {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #ffc35c, #ffb13b);
  transform: scaleX(0);
  transform-origin: left;
}
.current .fill,
.done .fill {
  transform: scaleX(1);
}
.ember {
  position: absolute;
  top: -3px;
  left: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ffd27a;
  box-shadow: 0 0 10px 3px rgba(255, 170, 60, 0.8);
  opacity: 0;
  z-index: 2;
}
.glow {
  position: absolute;
  top: -12px;
  left: calc(50% - (var(--node-w) + 24px) / 2);
  width: calc(var(--node-w) + 24px);
  height: calc(var(--node-h) + 24px);
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(255, 195, 92, 0.55), transparent);
  opacity: 0;
  pointer-events: none;
}
/* hex node: the element is the outline, ::after the fill */
.node {
  position: relative;
  z-index: 1;
  isolation: isolate;
  display: grid;
  place-items: center;
  width: var(--node-w);
  height: var(--node-h);
  clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
  background: #4a4743;
  color: #b9b4ab;
  font-size: 15px;
  font-weight: 600;
  transition: background-color var(--t-state) ease, color var(--t-state) ease;
}
.node::after {
  content: '';
  position: absolute;
  inset: 2px;
  z-index: -1;
  clip-path: inherit;
  background: #2a2826;
  transition: background-color var(--t-state) ease;
}
.num,
.check {
  grid-area: 1 / 1;
  transition: opacity 0.25s ease, transform var(--t-state) ease;
}
.check {
  width: 16px;
  height: 16px;
  fill: none;
  stroke: #ffc35c;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0;
  transform: scale(0.4);
}
.name {
  font-size: 15px;
  font-weight: 600;
  color: #b9b4ab;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.85), 0 0 3px rgba(0, 0, 0, 0.5);
  transition: color var(--t-state) ease;
}
.sub {
  font-size: 13px;
  color: #ffc35c;
  text-wrap: balance;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.85), 0 0 3px rgba(0, 0, 0, 0.5);
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
}
.done .node::after {
  background: #3a3122;
}
.done .num {
  opacity: 0;
}
.done .check {
  opacity: 1;
  transform: none;
}

/* the current node breathes while it waits */
.steps:not(.is-reduced) .current .glow {
  animation: step-breathe var(--t-breathe) ease-in-out infinite;
}
@keyframes step-breathe {
  0%,
  100% {
    opacity: 0.15;
    transform: scale(0.9);
  }
  50% {
    opacity: 0.55;
    transform: scale(1.1);
  }
}

/* a step finishes: its node flips edge-on, the number gives way to the tick */
.steps:not(.is-reduced) .just-done .node {
  animation: step-flip var(--t-flip) both;
}
.just-done .node,
.just-done .node::after {
  transition-delay: var(--t-tick-delay);
}
.just-done .check {
  transition-delay: var(--t-tick-delay);
}
@keyframes step-flip {
  0% {
    transform: rotateY(0);
  }
  50% {
    transform: rotateY(90deg);
  }
  100% {
    transform: rotateY(0);
  }
}

/* an ember runs along the line into the next step, the gold fills behind it */
.steps:not(.is-reduced) .line-in .ember {
  animation: step-ember var(--t-ember) var(--t-ember-delay) var(--t-ember-ease) both;
}
.steps:not(.is-reduced) .line-in .fill {
  animation: step-fill var(--t-ember) var(--t-ember-delay) var(--t-ember-ease) both;
}
@keyframes step-ember {
  0% {
    opacity: 0;
    left: 0;
  }
  10%,
  90% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    left: calc(100% - 8px);
  }
}
@keyframes step-fill {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

/* the next step ignites once the ember arrives: glow, then colours, then its instruction */
.steps:not(.is-reduced) .ignite .glow {
  animation: step-ignite var(--t-ignite) var(--t-ignite-at) both, step-breathe var(--t-breathe) calc(var(--t-ignite-at) + var(--t-ignite)) ease-in-out infinite;
}
.ignite .node,
.ignite .node::after,
.ignite .name {
  transition-delay: var(--t-ignite-at);
}
.steps:not(.is-reduced) .ignite .sub {
  animation: step-sub-in var(--t-state) var(--t-sub-at) both;
}
@keyframes step-ignite {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }
  50% {
    opacity: 1;
    transform: scale(1.6);
  }
  100% {
    opacity: 0.4;
    transform: scale(1);
  }
}
@keyframes step-sub-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

/* all three done: the nodes do one small wave */
.steps.all-done:not(.is-reduced) .node {
  animation: step-wave var(--t-wave) var(--t-flip) both;
}
.steps.all-done:not(.is-reduced) .step:nth-child(2) .node {
  animation-delay: calc(var(--t-flip) + var(--t-wave-stagger));
}
.steps.all-done:not(.is-reduced) .step:nth-child(3) .node {
  animation: step-flip var(--t-flip) both, step-wave var(--t-wave) calc(var(--t-flip) + 2 * var(--t-wave-stagger)) both;
}
@keyframes step-wave {
  0%,
  100% {
    transform: none;
  }
  40% {
    transform: translateY(-6px) scale(1.08);
  }
}

/* portrait phones: full width above the Impressum row */
@media (max-width: 640px) {
  .steps {
    --node-w: 30px;
    --node-h: 34px;
    left: 16px;
    right: 16px;
    width: auto;
    transform: none;
    bottom: calc(44px + var(--hud-inset-bottom, 0px) + env(safe-area-inset-bottom, 0px));
  }
  .node {
    font-size: 14px;
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
    --node-w: 24px;
    --node-h: 27px;
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
    font-size: 12px;
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
