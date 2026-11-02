<script setup lang="ts">
// The two celebratory pill banners from the design handoff "2a": the
// landfall moment (frame 2) and onboarding's completion (frame 5). Frame 5
// itself has no explicit "go on in" button — but removing the forced
// nickname modal (task 9) removes the only route `/settlement` had, and the
// player needs a reliable, e2e-stable way to actually get there, so
// `complete` adds one.
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { TOUCH_QUERY } from '../../lib/breakpoints';

defineProps<{ variant: 'landfall' | 'complete' }>();
const emit = defineEmits<{ continue: [] }>();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const isTouch = useMediaQuery(TOUCH_QUERY);
</script>

<template>
  <div class="banner" :class="variant" data-testid="onboarding-banner">
    <span class="check" aria-hidden="true" />
    <span class="title">
      {{ variant === 'landfall' ? t('landing.banner.landfallTitle') : t('landing.banner.completeTitle') }}
    </span>
    <span class="body">
      {{ variant === 'landfall' ? t('landing.banner.landfallBody') : isTouch ? t('landing.banner.completeBodyTouch') : t('landing.banner.completeBody') }}
    </span>
    <button v-if="variant === 'complete'" type="button" class="continue" data-testid="onboarding-continue" @click="emit('continue')">
      {{ t('landing.banner.continueCta') }}
    </button>
  </div>
</template>

<style scoped>
.banner {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  border-radius: 999px;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  box-shadow: 0 22px 50px rgba(0, 0, 0, 0.6);
  max-width: calc(100vw - 32px);
}
/* Frame 2: just below the top bar, so it reads as the moment's headline. */
.banner.landfall {
  top: 96px;
  border-color: rgba(255, 197, 92, 0.55);
}
/* Frame 5: docks where the checklist tray sat, now that it's done. */
.banner.complete {
  bottom: 96px;
}
.check {
  width: 26px;
  height: 26px;
  flex: none;
  display: block;
  border-radius: 50%;
  background: var(--gold);
  color: #20160a;
  font-weight: 700;
  font-size: 15px;
  line-height: 26px;
  text-align: center;
}
.check::after {
  content: '✓';
}
.title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
}
.body {
  font-size: 13px;
  color: var(--muted);
}
.continue {
  flex: none;
  margin-left: 4px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--gold);
  color: #20160a;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}

/* Mobile-readiness audit (finding c): the pill's fixed `border-radius: 999px`
   plus nowrap title/unwrapped body forced the body text into a tall, narrow
   column inside the pill on a narrow viewport. A softer, wrappable card
   fixes that; the landfall variant also has to sit below the mobile header
   instead of a flat 96px. `--hud-inset-top`/`--hud-inset-bottom` (set on
   LandingView's root from the HUD bar's measured height) say which edge the
   bar occupies and how tall it is, so the banners clear it whether it's
   docked at the top or the bottom. */
@media (max-width: 768px), (max-height: 500px) {
  /* `--hud-inset-left` (the landscape rail's width, 0 everywhere else) keeps
     the banner out from under the rail: left-anchored and narrowed by it,
     which is the same centred 100vw - 32px box as before when it is 0. */
  .banner {
    left: calc(var(--hud-inset-left, 0px) + 16px);
    transform: none;
    max-width: none;
    border-radius: 16px;
    flex-wrap: wrap;
    width: calc(100vw - 32px - var(--hud-inset-left, 0px));
    padding: 10px 14px;
    gap: 6px 10px;
  }
  .title {
    white-space: normal;
  }
  .body {
    flex: 1 1 100%;
  }
  .banner.landfall {
    top: calc(var(--hud-inset-top, 64px) + 12px);
  }
  .banner.complete {
    bottom: calc(12px + var(--hud-inset-bottom, 0px) + env(safe-area-inset-bottom, 0px));
  }
  .continue {
    min-height: 44px;
    padding: 8px 16px;
    display: inline-flex;
    align-items: center;
  }
}
/* Short landscape: the landfall banner is a compact pill across the top
   instead of a full-width card — title and line side by side, as wide as
   its text. */
@media (max-height: 500px) {
  .banner.landfall {
    left: 50%;
    transform: translateX(-50%);
    width: auto;
    max-width: calc(100vw - 32px - var(--hud-inset-left, 0px));
    flex-wrap: nowrap;
    padding: 6px 16px 6px 8px;
    border-radius: 999px;
  }
  .banner.landfall .body {
    flex: 0 1 auto;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .banner.landfall .title {
    white-space: nowrap;
  }
}
</style>
