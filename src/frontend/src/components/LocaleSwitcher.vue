<script setup lang="ts">
// A small always-visible EN/DE toggle rather than a <select>: only two
// locales exist right now (see i18n/locale.ts's SUPPORTED_LOCALES), and a
// toggle shows both options and the active one at a glance without opening
// anything. Reused across the HUD nav and every standalone page's topbar.
//
// On a phone it never sits in a bar: there's no room for it next to the
// game's own controls, and the initial locale already follows the browser
// (i18n/locale.ts's detectInitialLocale). The only place it shows at phone
// width is inside the HUD's pull-down drawer (MobileHudDrawer.vue passes
// `inDrawer`); every other mount hides itself below the breakpoint.
import { useI18n } from 'vue-i18n';
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../i18n';
import type { MessageSchema } from '../i18n/schema';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

defineProps<{
  /** Rendered inside the mobile HUD drawer — the one mount that stays visible at phone width. */
  inDrawer?: boolean;
}>();

const { t, locale } = useI18n<{ message: MessageSchema }, SupportedLocale>({ useScope: 'global' });
const authStore = useAuthStore();

function label(code: SupportedLocale): string {
  return t(`common.localeSwitcher.${code}`);
}

function selectLocale(code: SupportedLocale): void {
  setLocale(code);
  if (authStore.isAuthenticated) {
    // Best-effort: the switch already applied locally either way.
    api.updateMyLocale({ preferredLocale: code }).catch(() => {});
  }
}
</script>

<template>
  <div class="locale-switcher" :class="{ 'in-drawer': inDrawer }" role="group" :aria-label="t('common.localeSwitcher.label')">
    <button
      v-for="code in SUPPORTED_LOCALES"
      :key="code"
      type="button"
      class="option"
      :class="{ active: locale === code }"
      :aria-pressed="locale === code"
      :title="label(code)"
      @click="selectLocale(code)"
    >
      {{ code.toUpperCase() }}
    </button>
  </div>
</template>

<style scoped>
.locale-switcher {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}
.option {
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--muted);
  padding: 3px 7px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  font-family: inherit;
  line-height: 1;
}
.option:hover {
  color: var(--text);
  border-color: var(--gold);
}
.option.active {
  color: #20160a;
  background: var(--gold);
  border-color: var(--gold);
}
/* Same breakpoint as lib/breakpoints.ts's HUD_COMPACT_MAX_WIDTH. */
@media (max-width: 768px) {
  .locale-switcher:not(.in-drawer) {
    display: none;
  }
}
.locale-switcher.in-drawer {
  gap: 6px;
}
.locale-switcher.in-drawer .option {
  min-width: 44px;
  min-height: 36px;
  font-size: 13px;
}
</style>
