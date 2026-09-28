<script setup lang="ts">
// The profile (own or someone else's) as a modal over whatever page was
// showing before — see lib/profileRoute.ts and App.vue's own comment on the
// background-route pattern this sits on top of. ProfileView.vue keeps all of
// the actual profile logic (data loading, bio editing, the report dialog,
// and — on the viewer's own profile — the Profile/Settings tabs); this
// component is only the dialog chrome around it: backdrop, close/back
// button, and desktop/mobile layout.
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { MOBILE_MODAL_QUERY } from '../../lib/breakpoints';
import type { MessageSchema } from '../../i18n/schema';
import ProfileView from '../../views/ProfileView.vue';

const router = useRouter();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const isMobile = useMediaQuery(MOBILE_MODAL_QUERY);

const panelEl = ref<HTMLElement | null>(null);
const profileViewRef = ref<InstanceType<typeof ProfileView> | null>(null);

// Mobile's header bar shows the profile's own name once it has loaded —
// exposed by ProfileView rather than fetched again here.
const modalTitle = computed(
  () => profileViewRef.value?.profile?.displayName || profileViewRef.value?.profile?.userName || '',
);

// Closing: if we got here from an in-app navigation (history.state.
// backgroundView set, and it's genuinely the page we came from — history.
// state.back matches it), going back lands exactly where the player was,
// scroll position and all. Otherwise (direct load, reload, a link opened in
// a new tab) there is nothing to go "back" to, so replace with the
// background view instead of leaving a stray profile entry in history.
function close() {
  // Via the router's own history object, not the global `window.history` —
  // works the same way against a `createMemoryHistory` router in tests. See
  // lib/profileRoute.ts's own comment.
  const state = router.options.history.state as { backgroundView?: unknown; back?: unknown };
  const backgroundView = typeof state.backgroundView === 'string' ? state.backgroundView : null;
  if (backgroundView && state.back === backgroundView) {
    router.back();
  } else {
    router.replace(backgroundView ?? '/settlement');
  }
}

// Focus the dialog on open, both for a11y (focus moves into the modal, same
// as any other dialog in this app) and so a bare Escape press — with focus
// not sitting inside the nested report dialog — reaches this panel's own
// keydown handler below rather than doing nothing.
onMounted(() => {
  void nextTick(() => panelEl.value?.focus());
});

// The report dialog nested inside ProfileView owns its own Escape handling
// (`@keydown.esc.stop`) and, being the deeper element, runs first and stops
// the event from bubbling here while it's open — so this only ever fires
// when the report dialog isn't open.
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}
</script>

<template>
  <div class="modal-backdrop" :class="{ 'modal-backdrop--mobile': isMobile }" @click.self="close">
    <div
      ref="panelEl"
      class="modal-panel"
      :class="{ 'modal-panel--mobile': isMobile }"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-name"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <div v-if="isMobile" class="mobile-header">
        <button type="button" class="back-button" :aria-label="t('profile.back')" @click="close">
          <span aria-hidden="true">{{ t('profile.backChevron') }}</span>
        </button>
        <span class="mobile-title">{{ modalTitle }}</span>
      </div>
      <button v-else type="button" class="close-button" :aria-label="t('profile.close')" @click="close">
        <span aria-hidden="true">×</span>
      </button>
      <div class="modal-content">
        <ProfileView ref="profileViewRef" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  /* Above the HUD bar (40), its drawer (39) and the anchored account/
     returning-player menus (50) — opening the profile modal from any of
     those should sit on top of them all. The nested report dialog (in
     ProfileView.vue) goes above this again. */
  z-index: 60;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal-panel {
  position: relative;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  width: 100%;
  max-width: 720px;
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  outline: none;
}
.close-button {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 50%;
  color: var(--text);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.close-button:hover {
  border-color: var(--gold);
  color: var(--gold);
}

/* Mobile: the panel fills the screen instead of floating over the backdrop,
   with a header bar (back chevron + title) replacing the floating × —
   there's no backdrop left visible to click through to anyway. */
.modal-backdrop--mobile {
  padding: 0;
}
.modal-panel--mobile {
  max-width: none;
  max-height: none;
  height: 100%;
  border-radius: 0;
  border: none;
  display: flex;
  flex-direction: column;
}
.mobile-header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--panel-border);
  background: var(--panel-bg);
}
.back-button {
  flex: none;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 22px;
  cursor: pointer;
}
.mobile-title {
  font-weight: 700;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.modal-panel--mobile .modal-content {
  flex: 1 1 auto;
  overflow-y: auto;
}
</style>
