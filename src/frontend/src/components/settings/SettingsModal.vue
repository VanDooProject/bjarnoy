<script setup lang="ts">
// The per-device settings as a modal over whatever page was showing before —
// see lib/modalRoute.ts and App.vue's own comment on the background-route
// pattern. No account needed: the settings are stored on this device.
import { useI18n } from 'vue-i18n';
import RouteModal from '../modal/RouteModal.vue';
import DeviceSettings from './DeviceSettings.vue';
import type { MessageSchema } from '../../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
</script>

<template>
  <RouteModal :title="t('hud.accountMenu.settings')" testid="settings-modal">
    <DeviceSettings />
  </RouteModal>
</template>
