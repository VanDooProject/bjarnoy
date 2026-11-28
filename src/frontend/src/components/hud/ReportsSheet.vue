<script setup lang="ts">
// Phone: the newest reports in a bottom sheet (components/hud/PhoneSheet.vue), unread ones under "New", the rest under
// "Earlier". A row opens that report in the Reports window, which marks it read; the footer opens the whole list. Opened by
// ReportsChip.vue through composables/useReportsSheet.ts.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import type { MessageSchema } from '../../i18n/schema';
import { useInboxGroups } from '../../composables/useInboxRows';
import { reportsSheetOpen } from '../../composables/useReportsSheet';
import { reportsLocation } from '../../lib/modalRoute';
import { REPORTS_PANEL_ROWS } from '../../lib/units/inbox';
import { useReportsStore } from '../../stores/reports';
import ReportInboxRow from '../reports/ReportInboxRow.vue';
import PhoneSheet from './PhoneSheet.vue';

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const router = useRouter();
const reports = useReportsStore();

const newest = computed(() => reports.inboxItems.slice(0, REPORTS_PANEL_ROWS));
const { unread, earlier } = useInboxGroups(newest);
</script>

<template>
  <PhoneSheet v-model:open="reportsSheetOpen" :label="t('reports.title')" layer-id="reports-sheet" data-testid="reports-sheet">
    <div class="header">
      <span class="status-card-title">{{ t('reports.title') }}</span>
      <button v-if="reports.unreadCount > 0" type="button" class="mark-read" data-testid="reports-sheet-mark-read" @click="reports.markAllRead()">
        {{ t('reports.markRead') }}
      </button>
    </div>
    <template v-if="unread.length">
      <div class="group-title is-new" data-testid="reports-sheet-new">{{ t('reports.groups.new', { count: unread.length }) }}</div>
      <ReportInboxRow
        v-for="row in unread"
        :key="row.key"
        :row="row"
        :tile="40"
        short
        summary
        @open="router.push(reportsLocation(router, row.id))"
        @navigate="reportsSheetOpen = false"
      />
    </template>
    <template v-if="earlier.length">
      <div class="group-title" data-testid="reports-sheet-earlier">{{ t('reports.groups.earlier') }}</div>
      <ReportInboxRow
        v-for="row in earlier"
        :key="row.key"
        :row="row"
        :tile="40"
        short
        @open="router.push(reportsLocation(router, row.id))"
        @navigate="reportsSheetOpen = false"
      />
    </template>
    <button type="button" class="all" data-testid="reports-sheet-all" @click="router.push(reportsLocation(router))">
      {{ t('reports.allReports') }}
      <span class="chevron" aria-hidden="true" />
    </button>
  </PhoneSheet>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 4px;
}
.mark-read {
  min-height: 44px;
  padding: 0;
  background: none;
  border: 0;
  color: var(--muted);
  font: inherit;
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
}
.group-title {
  padding: 8px 16px 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.group-title.is-new {
  color: var(--gold);
}
.all {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 44px;
  padding: 10px;
  background: none;
  border: 0;
  border-top: 1px solid var(--panel-border);
  color: var(--gold);
  font: inherit;
  font-size: 14px;
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
