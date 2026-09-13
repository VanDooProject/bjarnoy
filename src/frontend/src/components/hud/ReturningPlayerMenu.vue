<script setup lang="ts">
// "I already have a realm" / "or want to join another world" — the entry
// point for a returning/anonymous visitor to either log in or pick a
// different world to join (WorldPickerView.vue). Replaces two previous,
// separate things: LandingView's pre-founding `.have-realm-link` and
// HudNav's anonymous-state avatar (which only ever routed to /register) —
// this is now also where the account-creation nudge (ProfileNudge.vue,
// design handoff "2a" frame 5) anchors, via the `nudge` slot, since the
// avatar circle it used to glow around no longer exists in the anonymous
// state.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';

withDefaults(defineProps<{ nudging?: boolean }>(), { nudging: false });

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const route = useRoute();
const router = useRouter();

const open = ref(false);
const rootEl = ref<HTMLDivElement | null>(null);

function toggle() {
  open.value = !open.value;
}

function close() {
  open.value = false;
}

function go(path: string) {
  close();
  router.push(path);
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!open.value) return;
  const target = event.target as Node | null;
  if (rootEl.value && target && !rootEl.value.contains(target)) close();
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close();
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onDocumentKeydown);
});

// A navigation while the panel is open (e.g. the browser back button, or
// some other control on the page) should close it same as clicking a row
// would — it makes no sense pinned open over a different route.
watch(() => route.fullPath, close);
</script>

<template>
  <div ref="rootEl" class="returning-player-menu">
    <button
      type="button"
      class="trigger"
      :class="{ 'is-nudging': nudging }"
      aria-haspopup="menu"
      :aria-expanded="open"
      data-testid="returning-player-trigger"
      @click="toggle"
    >
      <span class="trigger-text">
        <span class="trigger-main">{{ t('hud.returningPlayer.trigger') }}</span>
        <span class="trigger-sub">{{ t('hud.returningPlayer.triggerSub') }}</span>
      </span>
      <span class="caret" aria-hidden="true">▾</span>
      <span v-if="nudging" class="nudge-dot" aria-hidden="true" />
    </button>
    <div v-if="open" class="panel menu" role="menu" data-testid="returning-player-menu">
      <div class="notch" />
      <button type="button" role="menuitem" class="row" data-testid="returning-player-login" @click="go('/login')">
        {{ t('hud.returningPlayer.logIn') }}
      </button>
      <button
        type="button"
        role="menuitem"
        class="row"
        data-testid="returning-player-join-world"
        @click="go('/worlds')"
      >
        {{ t('hud.returningPlayer.joinAnotherWorld') }}
      </button>
    </div>
    <slot name="nudge" />
  </div>
</template>

<style scoped>
/* TopBar's own `.hud-bar-right :deep(button)` rule already re-enables
   pointer-events for every `<button>` rendered in its slot, in both
   places this component is used (HudNav's slot and LandingView's bare
   `TopBar` slot alike — `:deep()` reaches into slotted content regardless
   of which component rendered it), so `.trigger` and the `.row` buttons
   below already work without this root opting in. Deliberately NOT also
   setting `pointer-events: auto` on the root itself: that would inherit
   onto every descendant, including the non-button parts of a slotted
   `ProfileNudge` (its `.eyebrow`/`.title`/`.body` text) — which then sat
   over whatever the map/page had underneath it and silently ate clicks
   meant for that (caught by trade.spec.ts in CI: the profile nudge's
   eyebrow line was intercepting a `.trade-toggle` click). */
.returning-player-menu {
  position: relative;
  display: flex;
  flex: none;
}
.trigger {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  color: var(--muted);
  padding: 6px 10px;
  cursor: pointer;
  font-family: inherit;
  max-width: 260px;
}
.trigger:hover {
  color: var(--text);
  border-color: rgba(255, 255, 255, 0.22);
}
.trigger[aria-expanded='true'] {
  color: var(--gold);
  border-color: rgba(255, 197, 92, 0.4);
}
.trigger-text {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.25;
}
.trigger-main {
  font-size: 13px;
  font-weight: 600;
}
.trigger-sub {
  font-size: 11px;
  font-weight: 500;
  color: var(--muted-2);
}
.caret {
  flex: none;
  font-size: 10px;
  transition: transform 0.15s ease;
}
.trigger[aria-expanded='true'] .caret {
  transform: rotate(180deg);
}
/* Design handoff "2a" frame 5: the profile-mark glow/badge pointing at the
   nudge — moved here from HudNav.vue's own `.avatar.is-nudging` now that
   this trigger, not the anonymous avatar circle, is what the nudge anchors
   to. */
@keyframes avatar-glow {
  0%,
  100% {
    box-shadow: 0 0 0 3px rgba(255, 197, 92, 0.3), 0 0 18px 4px rgba(255, 197, 92, 0.35);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(255, 197, 92, 0.18), 0 0 30px 10px rgba(255, 197, 92, 0.6);
  }
}
.trigger.is-nudging {
  border-radius: 8px;
  animation: avatar-glow 1.5s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .trigger.is-nudging {
    animation: none;
    box-shadow: 0 0 0 3px rgba(255, 197, 92, 0.3), 0 0 18px 4px rgba(255, 197, 92, 0.35);
  }
}
.nudge-dot {
  position: absolute;
  right: -3px;
  top: -3px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--rival);
  border: 2px solid var(--shell);
}
.menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 50;
  min-width: 220px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.notch {
  position: absolute;
  right: 18px;
  top: -7px;
  width: 14px;
  height: 14px;
  background: var(--panel-bg);
  border-left: 1px solid var(--panel-border);
  border-top: 1px solid var(--panel-border);
  transform: rotate(45deg);
}
.row {
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text);
  padding: 9px 10px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
}
.row:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--gold);
}
</style>
