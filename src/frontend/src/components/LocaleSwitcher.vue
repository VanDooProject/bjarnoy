<script setup lang="ts">
// A small always-visible EN/DE toggle rather than a <select>: only two
// locales exist right now (see i18n/locale.ts's SUPPORTED_LOCALES), and a
// toggle shows both options and the active one at a glance without opening
// anything. Reused across the HUD nav and every standalone page's topbar.
import { useI18n } from 'vue-i18n';
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../i18n';
import type { MessageSchema } from '../i18n/schema';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';

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
  <div class="locale-switcher" role="group" :aria-label="t('common.localeSwitcher.label')">
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
</style>
