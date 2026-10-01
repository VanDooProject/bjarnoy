<script setup lang="ts">
// The landing page's guided-onboarding tray, rebuilt as a live checklist
// (design handoff "Landing Onboarding Flow 2a"): a header with a step
// count, a progress bar, and three rows that read "done" the instant their
// building is actually standing (see onboardingGuidance.ts) rather than a
// fixed step counter. Previously this markup lived inline in
// LandingView.vue; pulled out so the derivation (onboardingGuidance.ts) and
// the render can each be tested on their own.
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { buildingName } from '../../i18n/catalogueNames';
import type { ChecklistRow, ChecklistRowKey, OnboardingGuidance } from '../../lib/map/onboardingGuidance';

const props = defineProps<{
  guidance: OnboardingGuidance;
  hasFounded: boolean;
}>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

function nameFor(key: ChecklistRowKey): string {
  return key === 'longhouse' ? t('landing.tray.longhouseName') : buildingName(key);
}

function subtextFor(row: ChecklistRow): string {
  if (row.state === 'done') return t('landing.tray.placed');
  if (row.key === 'longhouse') return t('landing.tray.clickToPlace');
  return props.hasFounded ? t('landing.tray.clickEmptyHex') : t('landing.tray.foundFirst');
}
</script>

<template>
  <div class="tray panel" data-testid="onboarding-checklist">
    <div class="tray-header">
      <span class="tray-title">{{ t('landing.tray.title') }}</span>
      <span class="tray-step">{{ t('landing.tray.stepOf', { step: guidance.step, total: guidance.totalSteps }) }}</span>
    </div>
    <div class="tray-progress">
      <div class="tray-progress-fill" :style="{ width: `${Math.round(guidance.progress * 100)}%` }" />
    </div>
    <div class="tray-rows">
      <div v-for="row in guidance.rows" :key="row.key" class="tray-item" :class="row.state">
        <div class="dot" />
        <div>
          <div class="name">{{ nameFor(row.key) }}</div>
          <div class="sub">{{ subtextFor(row) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes checklist-tick {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.09);
  }
}
.tray {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 96px;
  z-index: 15;
  width: 712px;
  max-width: calc(100vw - 32px);
  padding: 14px 14px 12px;
}
.tray-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}
.tray-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text);
  white-space: nowrap;
}
.tray-step {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--muted);
  white-space: nowrap;
}
.tray-progress {
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.1);
  margin-bottom: 12px;
  overflow: hidden;
}
.tray-progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--gold);
  transition: width 0.3s ease;
}
.tray-rows {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tray-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 15px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.tray-item.current {
  background: var(--gold);
  border-color: var(--gold);
  animation: checklist-tick 1.6s ease-in-out infinite;
  transform-origin: center;
}
@media (prefers-reduced-motion: reduce) {
  .tray-item.current {
    animation: none;
  }
}
.tray-item.current .name,
.tray-item.current .sub {
  color: #20160a;
}
.tray-item.done {
  opacity: 0.55;
}
.dot {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tray-item.done .dot {
  background: var(--gold);
  color: #20160a;
  font-size: 15px;
  font-weight: 700;
}
.tray-item.done .dot::after {
  content: '✓';
}
.name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.sub {
  font-size: 12px;
  color: var(--muted);
}

/* Mobile-readiness audit (finding a): at 390px-wide the 3-card row put the
   3rd card's right edge past the viewport (x 320..468) and squeezed each
   card down to one-word-per-line text, while the whole tray sat ~250px
   tall at `bottom: 96px`, covering the map and the ring-menu bubbles below
   it. The header's step count + progress bar already say where the player
   is overall, so on a narrow/short viewport only the CURRENT row needs to
   render at all, full-width, keeping the tray to a couple of rows tall
   instead of three side by side. `(max-height: 500px)` also catches a
   landscape phone (844x390) even though its width is well past 768px. */
@media (max-width: 768px), (max-height: 500px) {
  .tray {
    bottom: calc(12px + var(--hud-inset-bottom, 0px) + env(safe-area-inset-bottom, 0px));
    padding: 10px 12px;
    width: calc(100vw - 24px);
  }
  .tray-item:not(.current) {
    display: none;
  }
}

/* Short-landscape phones (e.g. iPhone 13 landscape, 844x390): the preview
   plot sits centred on screen, so a tray still centred at the bottom would
   cover it and swallow the founding tap (finding b) — dock it to the
   bottom-right corner instead, out of the plot's way. */
@media (max-height: 500px) {
  .tray {
    left: auto;
    right: 12px;
    transform: none;
    width: min(340px, calc(100vw - 24px));
  }
}

/* Short-landscape phones, slim strip: docked in the corner the tray still
   stood ~150px tall, and at 667x375 the landfall plot (the island is
   framed, not the plot) ended up under it, swallowing the founding tap.
   Here the tray is one line instead of three: the current step's card on
   the left, the step count on the right, and the progress bar as a thin
   rule along the bottom edge. The title goes — the step count and the
   card already say what it is. */
@media (max-height: 500px) {
  .tray {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px 10px;
  }
  .tray-title {
    display: none;
  }
  .tray-header {
    order: 2;
    margin-bottom: 0;
  }
  .tray-rows {
    order: 1;
    flex: 1;
    min-width: 0;
  }
  .tray-progress {
    position: absolute;
    left: 10px;
    right: 10px;
    bottom: 4px;
    height: 3px;
    margin-bottom: 0;
  }
  .tray-item {
    gap: 8px;
    padding: 5px 10px;
    border-radius: 8px;
    min-width: 0;
  }
  .tray-item > div:last-child {
    min-width: 0;
  }
  .dot {
    width: 20px;
    height: 20px;
    border-radius: 6px;
  }
  .tray-item.done .dot {
    font-size: 12px;
  }
  .name {
    font-size: 13px;
    line-height: 1.2;
  }
  .sub {
    font-size: 11px;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
