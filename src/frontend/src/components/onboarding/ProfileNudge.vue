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

// Mobile HUD bar rework, phase 2: on an in-game phone bar the anonymous
// trigger this nudge normally anchors to (ReturningPlayerMenu's own
// `#nudge` slot) is hidden entirely — MobileHudDrawer.vue renders this same
// component inline in its account section instead, `inDrawer`, dropping the
// absolute-positioned floating-tooltip look for a plain block that sits in
// the drawer's own flow. Same pattern as LocaleSwitcher.vue's `inDrawer`.
defineProps<{ inDrawer?: boolean }>();

const player = usePlayerStore();
const router = useRouter();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

function nameYourJarl() {
  router.push('/register');
}
</script>

<template>
  <div class="nudge panel" :class="{ 'in-drawer': inDrawer }" data-testid="profile-nudge">
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
  /* Regression found while verifying finding #1: ReturningPlayerMenu.vue's
     own root deliberately stays `pointer-events: none` so this panel's
     non-button text doesn't eat clicks meant for whatever is underneath it
     (its own comment: caught once already by trade.spec.ts's `.trade-toggle`
     click). That relied on nothing upstream re-enabling pointer events —
     true on desktop, but `.hud-bar--drag-enabled` (the mobile-only drag
     surface) sets `pointer-events: auto` on the *whole bar* on a phone, so
     every descendant, this panel included, inherits `auto` there regardless
     of ReturningPlayerMenu's own choice. Finding #1's removal of
     `.hud-bar-scroll`'s clipping wrapper is what actually surfaced this in
     practice: this panel used to be clipped down to near-nothing by that
     wrapper's implied `overflow-y: auto` (an `overflow-x` value other than
     `visible` forces the *other* axis to `auto` too, per spec), which
     incidentally also hid this exact interception from ever mattering.
     Setting it explicitly here — rather than depending on an ancestor's
     default that a mobile-only rule can override out from under it — is
     correct on both desktop and mobile; the panel's own buttons
     (`.cta`/`.later`) opt back in via `.hud-bar-right :deep(button)`, same
     as every other HUD control. */
  pointer-events: none;
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

/* Mobile HUD bar rework, phase 2: MobileHudDrawer's own account section
   renders this inline, in normal flow — none of the floating-tooltip
   positioning/animation makes sense sitting inside a drawer that already
   scrolls with the rest of its content. */
.nudge.in-drawer {
  position: static;
  width: auto;
  margin-top: 10px;
  animation: none;
}
.nudge.in-drawer .notch {
  display: none;
}
</style>
