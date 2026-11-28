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
  padding: 12px 14px 0;
}
.unread-count {
  color: var(--gold);
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
}
.all {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 40px;
  margin-top: 6px;
  padding: 10px;
  background: none;
  border: 0;
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
