<script setup lang="ts">
// The per-device settings as a modal over whatever page was showing before —
// see lib/modalRoute.ts and App.vue's own comment on the background-route
// pattern. No account needed: the settings are stored on this device.
import { useI18n } from 'vue-i18n';
import RouteModal from '../modal/RouteModal.vue';
import DeviceSettings from './DeviceSettings.vue';
import { useIsMobile } from '../../composables/useIsMobile';
import type { MessageSchema } from '../../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
// On a phone RouteModal's header bar already carries the title.
const isMobile = useIsMobile();
</script>

<template>
  <RouteModal :title="t('hud.accountMenu.settings')" testid="settings-modal">
    <div class="settings">
      <h1 v-if="!isMobile">{{ t('hud.accountMenu.settings') }}</h1>
      <DeviceSettings />
    </div>
  </RouteModal>
</template>

<style scoped>
.settings {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
}
.settings h1 {
  margin: 0 0 16px;
}
</style>
