<script setup lang="ts">
// Desktop settlement view: the Reports panel in the dock (lib/hud/hudPanelDock.ts). The newest few reports as shared rows
// (components/reports/ReportInboxRow.vue), unread ones marked; a row opens that report in the Reports window, which marks it
// read, and the footer opens the whole list.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { MessageSchema } from '../../i18n/schema';
import { useInboxRowView } from '../../composables/useInboxRows';
import { reportsLocation } from '../../lib/modalRoute';
import { REPORTS_PANEL_ROWS } from '../../lib/units/inbox';
import { useReportsStore } from '../../stores/reports';
import ReportInboxRow from '../reports/ReportInboxRow.vue';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const router = useRouter();
const reports = useReportsStore();
const rowView = useInboxRowView();

const rows = computed(() => reports.inboxItems.slice(0, REPORTS_PANEL_ROWS).map(rowView));
</script>

<template>
  <section class="status-card reports-panel" data-testid="reports-panel">
    <div class="status-card-header" data-dock-handle>
      <span class="status-card-title">{{ t('reports.title') }}</span>
      <span v-if="reports.unreadCount > 0" class="status-card-count unread-count">{{ t('reports.panel.unread', { count: reports.unreadCount }) }}</span>
    </div>
    <div class="rows">
      <ReportInboxRow v-for="row in rows" :key="row.key" :row="row" :tile="34" short @open="router.push(reportsLocation(router, row.id))" />
    </div>
    <button type="button" class="all" data-testid="reports-panel-all" @click="router.push(reportsLocation(router))">
      {{ t('reports.allReports') }}
      <span class="chevron" aria-hidden="true" />
    </button>
  </section>
</template>

<style scoped>
.status-card {
  width: 280px;
  padding: 12px 0 0;
}
.status-card-header {
  padding: 0 14px 10px;
  margin-bottom: 0;
}
.unread-count {
  color: var(--gold);
}
.rows {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
}
/* The rows sit flush in the card: a divider instead of each row's own box. */
.rows :deep(.report-inbox-row) {
  border-width: 1px 0 0;
  border-color: rgba(255, 255, 255, 0.07);
}
.rows :deep(.report-inbox-row.unread) {
  border-color: rgba(255, 255, 255, 0.07);
}
.all {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 40px;
  padding: 10px;
  background: none;
  border: 0;
  border-top: 1px solid var(--panel-border);
  color: var(--gold);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.chevron {
  width: 6px;
  height: 6px;
  border-right: 2px solid currentColor;
  border-top: 2px solid currentColor;
  transform: rotate(45deg);
}
</style>
