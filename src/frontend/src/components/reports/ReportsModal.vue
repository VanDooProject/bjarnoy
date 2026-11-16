<script setup lang="ts">
// The battle-reports inbox as a modal over whatever page
// was showing before — see lib/modalRoute.ts and App.vue's own comment on
// the background-route pattern this sits on top of, and profile/
// ProfileModal.vue for the sibling this mirrors. ReportsView.vue keeps all
// of the actual reports logic (data loading, the kind filter, which rows are
// open); this component only wires it into RouteModal.vue's shared
// dialog chrome.
import RouteModal from '../modal/RouteModal.vue';
import ReportsView from '../../views/ReportsView.vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
</script>

<template>
  <RouteModal :title="t('reports.title')" testid="reports-modal">
    <ReportsView />
  </RouteModal>
</template>
