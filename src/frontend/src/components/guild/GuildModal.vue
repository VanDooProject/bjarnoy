<script setup lang="ts">
// The guild/alliance view as a modal over whatever page was showing before —
// see lib/modalRoute.ts and App.vue's own comment on the background-route
// pattern. RouteModal.vue owns the dialog chrome (backdrop, close/back
// button, desktop/mobile layout); GuildView.vue keeps all of its own data
// loading and directory/detail logic untouched.
import { useI18n } from 'vue-i18n';
import RouteModal from '../modal/RouteModal.vue';
import GuildView from '../../views/GuildView.vue';
import type { MessageSchema } from '../../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
</script>

<template>
  <RouteModal :title="t('guild.title')">
    <GuildView />
  </RouteModal>
</template>
