<script setup lang="ts">
// The language switcher as a row of the HUD's dropdown menus (HudNav's
// account menu and ReturningPlayerMenu), instead of a control of its own in
// the bar. Hidden at phone width like every bar mount of LocaleSwitcher: the
// phone's only switcher lives in the HUD drawer (MobileHudDrawer.vue).
import { useI18n } from 'vue-i18n';
import LocaleSwitcher from '../LocaleSwitcher.vue';
import type { MessageSchema } from '../../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
</script>

<template>
  <div class="locale-row" data-testid="menu-locale-row">
    <span class="locale-label">{{ t('common.localeSwitcher.label') }}</span>
    <LocaleSwitcher />
  </div>
</template>

<style scoped>
.locale-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 10px 11px;
  margin-bottom: 4px;
  /* Its own separator, so it disappears with the row at phone width. */
  border-bottom: 1px solid var(--panel-border);
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}
.locale-row :deep(button) {
  pointer-events: auto;
}
/* Keep in sync with lib/breakpoints.ts's HUD_COMPACT_QUERY. */
@media (max-width: 768px), (max-height: 500px) {
  .locale-row {
    display: none;
  }
}
</style>
