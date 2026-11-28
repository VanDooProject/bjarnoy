<script setup lang="ts">
// Phone: the 40px chip that opens the Reports sheet (ReportsSheet.vue): a letter icon with the unread count. It sits at the
// left edge below the queue drawer's handle (or under the HUD bar when there is none) and steps aside, like all HUD, while a
// phone layer is open. No enter animation: it simply is there while there are reports.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../../i18n/schema';
import { queueHandleBottomPx } from '../../composables/hudBarHeight';
import { useHiddenUnderPhoneLayer, vPhoneHidden } from '../../composables/usePhoneLayer';
import { reportsSheetOpen } from '../../composables/useReportsSheet';
import { useReportsStore } from '../../stores/reports';
import ReportKindIcon from '../battle/ReportKindIcon.vue';
import HudIconButton from './HudIconButton.vue';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const reports = useReportsStore();
const hidden = useHiddenUnderPhoneLayer();

const label = computed(() =>
  reports.unreadCount > 0 ? t('hud.panelColumn.withCount', { panel: t('reports.title'), count: reports.unreadCount }) : t('reports.title'),
);
const style = computed(() => ({ '--queue-handle-bottom': `${queueHandleBottomPx.value}px` }));
</script>

<template>
  <HudIconButton
    v-phone-hidden="hidden"
    class="reports-chip"
    data-testid="reports-chip"
    :style="style"
    :pressed="reportsSheetOpen"
    :aria-label="label"
    @click="reportsSheetOpen = true"
  >
    <ReportKindIcon kind="letter" :size="22" />
    <span v-if="reports.unreadCount > 0" class="hud-count-badge" data-testid="reports-chip-badge" aria-hidden="true">{{ reports.unreadCount }}</span>
  </HudIconButton>
</template>

<style scoped>
.reports-chip {
  position: absolute;
  left: calc(var(--hud-inset-left, 0px) + 16px);
  /* Below the HUD bar, and below the queue drawer's handle when it is there. */
  top: max(calc(var(--hud-inset-top, 0px) + 12px), calc(var(--queue-handle-bottom, 0px) + 8px));
  z-index: 10;
}
</style>
