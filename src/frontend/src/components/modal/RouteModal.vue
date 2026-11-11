<script setup lang="ts">
// Reusable dialog chrome for every modal-route page (see lib/modalRoute.ts
// and App.vue's own comment on the background-route pattern this sits on
// top of): backdrop, close/back button, desktop vs. mobile layout, focus
// handling, and the close() = history-back-if-we-came-from-a-backgroundView-
// else-replace logic. Originally ProfileModal.vue's own template/script;
// extracted so LeaderboardModal.vue/GuildModal.vue can reuse the exact same
// chrome instead of copy-pasting it. The caller supplies the actual content
// via the default slot and a `title` (used verbatim on mobile's header bar,
// and as the panel's aria-label).
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useMediaQuery } from '../../composables/useMediaQuery';
import { useCoversMap } from '../../composables/useMapCover';
import { MOBILE_MODAL_QUERY } from '../../lib/breakpoints';
import { closeModalRoute } from '../../lib/modalRoute';
import type { MessageSchema } from '../../i18n/schema';

const props = defineProps<{
  title: string;
  /** `data-testid` for the panel, for e2e tests that need to find a specific modal. */
  testid?: string;
  /**
   * What mobile's back chevron does. Defaults to `close()`, same as the
   * desktop × and Escape — a modal with its own "up one level" step (e.g.
   * ReportsModal.vue's detail -> list) overrides it instead of closing
   * straight through to the background route.
   */
  onBack?: () => void;
  /** `wide` is the two-pane dialog (rail + content, ~980px by ~700px); `default` is the ~720px reading column. */
  size?: 'default' | 'wide';
  /**
   * The content draws its own title and × on desktop (a wide dialog whose rail carries the heading). It gets `close`
   * as a slot prop so there is still exactly one close action. Phones always get the shared header bar.
   */
  contentHeader?: boolean;
}>();

const router = useRouter();
const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const isMobile = useMediaQuery(MOBILE_MODAL_QUERY);
// The mobile panel fills the screen opaque, so the map behind it is hidden;
// the desktop panel floats over a translucent backdrop with the map visible.
useCoversMap(isMobile);

const panelEl = ref<HTMLElement | null>(null);

// Closing is lib/modalRoute.ts's closeModalRoute: history-back when we came from the background view, else a replace.
function close() {
  closeModalRoute(router);
}

defineExpose({ close });

// Focus the dialog on open, both for a11y (focus moves into the modal, same
// as any other dialog in this app) and so a bare Escape press — with focus
// not sitting inside some nested dialog the content renders — reaches this
// panel's own keydown handler below rather than doing nothing.
onMounted(() => {
  void nextTick(() => panelEl.value?.focus());
});

// A nested dialog the slotted content renders (e.g. ProfileView's report
// dialog) owns its own Escape handling (`@keydown.esc.stop`) and, being the
// deeper element, runs first and stops the event from bubbling here while
// it's open — so this only ever fires when no such nested dialog is open.
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

const handleBack = computed(() => props.onBack ?? close);

const backLabel = computed(() => t('profile.back'));
const backChevron = computed(() => t('profile.backChevron'));
const closeLabel = computed(() => t('profile.close'));
</script>

<template>
  <div class="modal-backdrop" :class="{ 'modal-backdrop--mobile': isMobile }" @click.self="close">
    <div
      ref="panelEl"
      class="modal-panel"
      :class="{ 'modal-panel--mobile': isMobile, 'modal-panel--wide': props.size === 'wide' }"
      role="dialog"
      aria-modal="true"
      :aria-label="props.title || undefined"
      :data-testid="props.testid"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <div v-if="isMobile" class="mobile-header">
        <button type="button" class="back-button" :aria-label="backLabel" @click="handleBack">
          <span aria-hidden="true">{{ backChevron }}</span>
        </button>
        <span class="mobile-title">{{ props.title }}</span>
      </div>
      <button v-else-if="!props.contentHeader" type="button" class="close-button" :aria-label="closeLabel" @click="close">
        <span aria-hidden="true">×</span>
      </button>
      <div class="modal-content">
        <slot :close="close" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  /* Above the HUD bar (40), its drawer (39) and the anchored account/
     returning-player menus (50) — opening any modal-route page from any of
     those should sit on top of them all. A nested dialog the content
     renders (e.g. ProfileView's report dialog) goes above this again. */
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

/* Wide: a fixed-height two-pane dialog; the content scrolls inside its own panes, not the panel. */
.modal-panel--wide {
  max-width: 980px;
  height: min(700px, calc(100vh - 32px));
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.modal-panel--wide .modal-content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
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
  min-height: 0;
  overflow-y: auto;
}
</style>
