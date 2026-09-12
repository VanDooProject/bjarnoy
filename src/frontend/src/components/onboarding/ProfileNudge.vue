<script setup lang="ts">
// The avatar-mark tooltip from the design handoff "2a", replacing the old
// forced end-of-flow nickname popup: shown once onboarding is done, until
// the player either registers or dismisses it. "Name your jarl" routes to
// /register (a real account — the anonymous local nickname the removed
// modal set doesn't actually follow the player to another device, but a
// registered account does; the avatar's own anonymous-state click already
// goes there too, see HudNav.vue).
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '../../stores/player';
import type { MessageSchema } from '../../i18n/schema';

const player = usePlayerStore();
const router = useRouter();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

function nameYourJarl() {
  router.push('/register');
}
</script>

<template>
  <div class="nudge panel" data-testid="profile-nudge">
    <div class="notch" />
    <div class="eyebrow">{{ t('onboarding.profileNudge.eyebrow') }}</div>
    <div class="title">{{ t('onboarding.profileNudge.title') }}</div>
    <p class="body">{{ t('onboarding.profileNudge.body') }}</p>
    <div class="actions">
      <button type="button" class="cta" data-testid="profile-nudge-cta" @click="nameYourJarl">
        {{ t('onboarding.profileNudge.cta') }}
      </button>
      <button type="button" class="later" data-testid="profile-nudge-later" @click="player.dismissProfileNudge()">
        {{ t('onboarding.profileNudge.later') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
@keyframes nudge-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}
.nudge {
  position: absolute;
  top: calc(100% + 16px);
  right: 0;
  z-index: 50;
  width: 300px;
  padding: 18px 20px;
  border-color: rgba(255, 197, 92, 0.55);
  animation: nudge-bob 2.4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .nudge {
    animation: none;
  }
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
.eyebrow {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 8px;
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
}
.later:hover {
  color: var(--text);
}
</style>
