// The rows of the report inbox: one display model per report (title, summary, date, tone, location, unread) that every list
// of reports draws from — the Reports window, the desktop Reports panel and the phone sheet — so a report reads the same
// everywhere. Plus the split of a list into "unread" and "earlier".
import { computed, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { MessageSchema } from '../i18n/schema';
import { campName } from '../i18n/catalogueNames';
import { useReportsStore } from '../stores/reports';
import { missionLabel, outcomeLabel, reportSummaryLine } from '../lib/units/battleReports';
import { isCampReportVictory, totalBeastsLost, totalCampLoot, totalUnitsLost } from '../lib/units/campReports';
import { fieldBattleOutcomeLabel, fieldBattleSummaryLine } from '../lib/units/fieldBattleReports';
import {
  type InboxItem,
  type InboxKind,
  type InboxTone,
  fieldSideOf,
  inboxKey,
  inboxLocation,
  inboxTimestamp,
  inboxTone,
  sideOf,
  tradeSideOf,
} from '../lib/units/inbox';
import { tradeSummaryLine } from '../lib/units/tradeReports';

export { fieldSideOf, sideOf, tradeSideOf };

export interface InboxRowView {
  /** `kind:id`, unique across kinds. */
  key: string;
  id: string;
  kind: InboxKind;
  item: InboxItem;
  tone: InboxTone;
  /** "Outcome · Mission" (just the mission for a trade). */
  title: string;
  summary: string;
  /** Date and time, long form. */
  when: string;
  /** Date, short form, for the narrow panel rows. */
  whenShort: string;
  location: { q: number; r: number } | null;
  unread: boolean;
}

/** Turns an inbox item into its row. Reads the unread state from the reports store, so it is reactive to marking read. */
export function useInboxRowView(): (item: InboxItem) => InboxRowView {
  const { t, d } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
  const reports = useReportsStore();

  function parts(item: InboxItem): { outcome: string | null; mission: string; summary: string } {
    switch (item.kind) {
      case 'battle': {
        const side = sideOf(item.report);
        return {
          outcome: outcomeLabel(item.report, side),
          mission: missionLabel(item.report.mission),
          summary: reportSummaryLine(item.report, side),
        };
      }
      case 'field': {
        const side = fieldSideOf(item.report);
        return {
          outcome: fieldBattleOutcomeLabel(item.report, side),
          mission: t('hud.fieldBattleReport.title'),
          summary: fieldBattleSummaryLine(item.report, side),
        };
      }
      case 'camp': {
        const report = item.report;
        return {
          outcome: isCampReportVictory(report) ? t('hud.campReport.won') : t('hud.campReport.lost'),
          mission: t(`hud.campReport.kind.${report.kind}`),
          summary: t('hud.campReport.summary', {
            title: t(`hud.campReport.title.${report.kind}`, { camp: campName(report.camp.family) }),
            lost: totalUnitsLost(report),
            beasts: totalBeastsLost(report),
            loot: totalCampLoot(report.loot),
          }),
        };
      }
      case 'army': {
        const report = item.report;
        return {
          outcome: t(`reports.army.kind.${report.kind}`),
          mission: t('reports.tabs.army'),
          summary: t(`reports.army.${report.kind}`, { hex: t('common.reportLocation.coord', { q: report.hex.q, r: report.hex.r }) }),
        };
      }
      case 'trade':
        return {
          outcome: null,
          mission: item.report.guildTrade ? t('reports.trade.guildTrade') : t('reports.trade.trade'),
          summary: tradeSummaryLine(item.report, tradeSideOf(item.report)),
        };
    }
  }

  return (item) => {
    const { outcome, mission, summary } = parts(item);
    const date = new Date(inboxTimestamp(item));
    return {
      key: inboxKey(item),
      id: item.report.id,
      kind: item.kind,
      item,
      tone: inboxTone(item),
      title: outcome === null ? mission : t('reports.row.title', { outcome, mission }),
      summary,
      when: d(date, 'long'),
      whenShort: d(date, 'dayTime'),
      location: inboxLocation(item),
      unread: reports.isUnread(item),
    };
  };
}

/**
 * Splits `items` (newest first) into the unread rows and the rest. A row the player just opened stays in the unread group
 * while its key is in `keptOpen`, so it does not jump away under the cursor.
 */
export function useInboxGroups(items: Ref<InboxItem[]>, keptOpen?: Ref<Set<string>>) {
  const rowView = useInboxRowView();
  const rows = computed(() => items.value.map(rowView));
  const unread = computed(() => rows.value.filter((row) => row.unread || keptOpen?.value.has(row.key)));
  const earlier = computed(() => rows.value.filter((row) => !(row.unread || keptOpen?.value.has(row.key))));
  return { unread, earlier };
}
