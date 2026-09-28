<script setup lang="ts">
// The battle-reports inbox (list and detail) as a modal over whatever page
// was showing before — see lib/modalRoute.ts and App.vue's own comment on
// the background-route pattern this sits on top of, and profile/
// ProfileModal.vue for the sibling this mirrors. ReportsView.vue keeps all
// of the actual reports logic (data loading, the kind filter, the list/
// detail split); this component only wires it into RouteModal.vue's shared
// dialog chrome.
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import RouteModal from '../modal/RouteModal.vue';
import ReportsView from '../../views/ReportsView.vue';
import type { MessageSchema } from '../../i18n/schema';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

const reportsViewRef = ref<InstanceType<typeof ReportsView> | null>(null);

// Mobile header: the list's own title until a detail is open, then a short
// label for whichever report that is (mission/"Trade") — both exposed by
// ReportsView rather than recomputed here.
const modalTitle = computed(() => reportsViewRef.value?.detailTitle ?? t('reports.title'));

// On a detail, the mobile chevron goes up one level to the list
// (ReportsView's own backToList — it knows whether that's `router.back()`
// or a `replace`). On the list itself there's nowhere "up" to go, so it
// falls through to RouteModal's default: close the whole modal, same as
// the desktop × button.
const handleBack = computed(() => (reportsViewRef.value?.isDetail ? reportsViewRef.value.backToList : undefined));
</script>

<template>
  <RouteModal :title="modalTitle" testid="reports-modal" :on-back="handleBack">
    <ReportsView ref="reportsViewRef" />
  </RouteModal>
</template>
