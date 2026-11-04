<script setup lang="ts">
// One-time landing prompt (rendered into ReturningPlayerMenu's `#nudge` slot,
// same speech-bubble look as ProfileNudge.vue minus the bobbing): shown when
// the device asks for reduced motion, so the player knows why menus and the
// map are held still and can turn the animations on. Visibility rules live in
// lib/perf/motionPreferences.ts (`promptVisible`), the answer is persisted
// there too so it never comes back. Non-modal: no backdrop, and like
// ProfileNudge it takes no pointer events itself so it cannot eat map clicks
// (only its buttons do).
import { useI18n } from 'vue-i18n';
import { motionPreferences } from '../../lib/perf/motionPreferences';
import type { MessageSchema } from '../../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
</script>

<template>
  <div v-if="motionPreferences.promptVisible" class="motion-prompt panel" role="region" :aria-label="t('onboarding.motionPrompt.title')" data-testid="motion-prompt">
    <div class="notch" />
    <div class="head">
      <div class="eyebrow">{{ t('onboarding.motionPrompt.eyebrow') }}</div>
      <button
        type="button"
        class="close"
        :aria-label="t('onboarding.motionPrompt.close')"
        data-testid="motion-prompt-close"
        @click="motionPreferences.dismissPrompt()"
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
        </svg>
      </button>
    </div>
    <div class="title">{{ t('onboarding.motionPrompt.title') }}</div>
    <p class="body">{{ t('onboarding.motionPrompt.body') }}</p>
    <div class="actions">
      <button type="button" class="cta" data-testid="motion-prompt-on" @click="motionPreferences.turnAllOn()">
        {{ t('onboarding.motionPrompt.turnOn') }}
      </button>
      <button type="button" class="later" data-testid="motion-prompt-dismiss" @click="motionPreferences.dismissPrompt()">
        {{ t('onboarding.motionPrompt.keep') }}
      </button>
    </div>
    <p class="footer">{{ t('onboarding.motionPrompt.footer') }}</p>
  </div>
</template>

<style scoped>
.motion-prompt {
  position: absolute;
  top: calc(100% + 16px);
  right: 0;
  z-index: 50;
  width: 300px;
  /* Phones: the trigger is compact and sits near the right edge, keep the bubble inside the viewport. */
  max-width: calc(100vw - 32px);
  box-sizing: border-box;
  padding: 18px 20px;
  border-color: rgba(255, 197, 92, 0.55);
  /* Same as ProfileNudge: the bubble's text must not eat clicks meant for the map under it;
     its buttons opt back in below. */
  pointer-events: none;
}
.notch {
  position: absolute;
  right: 18px;
  top: -7px;
  width: 14px;
  height: 14px;
  background: var(--panel-bg);
  border-left: 1px solid rgba(255, 197, 92, 0.55);
  border-top: 1px solid rgba(255, 197, 92, 0.55);
  transform: rotate(45deg);
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gold);
}
.close {
  flex: none;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  margin: -4px -6px 0 0;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  pointer-events: auto;
}
.close:hover {
  color: var(--text);
}
.title {
  font-size: 17px;
  font-weight: 600;
  color: var(--text);
}
.body {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}
.cta {
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: var(--gold);
  color: #20160a;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
}
.later {
  padding: 8px 14px;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  pointer-events: auto;
}
.later:hover {
  color: var(--text);
}
.footer {
  margin: 12px 0 0;
  font-size: 11px;
  color: var(--muted);
}
</style>
