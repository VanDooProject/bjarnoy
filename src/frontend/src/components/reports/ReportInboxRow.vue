<script setup lang="ts">
// One report in a list: a kind icon tile (tinted by how it went, a gold dot while unread), the title, one summary line and the
// date, plus the "show on map" link when the report has a place. The one row every list of reports uses (the Reports window,
// the desktop panel and the phone sheet). The link is a sibling of the row button, not inside it: a button cannot hold another.
import { useI18n } from 'vue-i18n';
import type { InboxRowView } from '../../composables/useInboxRows';
import type { MessageSchema } from '../../i18n/schema';
import ReportKindIcon from '../battle/ReportKindIcon.vue';
import ReportLocationLink from '../battle/ReportLocationLink.vue';

const props = withDefaults(defineProps<{
  row: InboxRowView;
  /** Edge of the icon tile in px. */
  tile: 34 | 40 | 44;
  /** Show the date short (the narrow panel rows) or long. */
  short?: boolean;
  /** Show the summary line under the title. */
  summary?: boolean;
  /** Set for a row that expands in place: adds aria-expanded and the chevron. Leave undefined for a row that opens elsewhere. */
  expanded?: boolean;
}>(), { expanded: undefined });
const emit = defineEmits<{ open: []; navigate: [] }>();

const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const iconSize = props.tile === 44 ? 24 : 22;
</script>

<template>
  <div
    class="report-inbox-row"
    :class="[`tone-${row.tone}`, { unread: row.unread }]"
    :data-unread="row.unread"
    :data-report-id="row.id"
    :style="{ '--tile': `${tile}px` }"
  >
    <button
      type="button"
      class="main"
      data-testid="report-row"
      :aria-expanded="expanded === undefined ? undefined : expanded"
      @click="emit('open')"
    >
      <span class="tile">
        <ReportKindIcon :kind="row.kind" :size="iconSize" />
        <span v-if="row.unread" class="dot" data-testid="report-row-dot" />
      </span>
      <span class="text">
        <span class="title">
          {{ row.title }}
          <span v-if="row.unread" class="visually-hidden">{{ t('reports.row.unread') }}</span>
        </span>
        <span v-if="summary" class="sub">{{ row.summary }}</span>
      </span>
      <span class="when">{{ short ? row.whenShort : row.when }}</span>
      <span v-if="expanded !== undefined" class="chevron" :class="{ open: expanded }" aria-hidden="true" />
    </button>
    <ReportLocationLink v-if="row.location" class="location" :coord="row.location" pin @navigate="emit('navigate')" />
  </div>
</template>

<style scoped>
.report-inbox-row {
  --tone: var(--muted);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.07);
  color: var(--text);
}
.tone-win {
  --tone: var(--gold);
}
.tone-loss {
  --tone: var(--rival);
}
.tone-tie {
  --tone: var(--muted);
}
.tone-trade {
  --tone: var(--history);
}
.report-inbox-row.unread {
  padding: 10px 12px;
  background: rgba(255, 197, 92, 0.07);
  border-color: rgba(255, 197, 92, 0.3);
}
.main {
  flex: 1;
  min-width: 0;
  min-height: var(--tile);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.tile {
  position: relative;
  flex: none;
  width: var(--tile);
  height: var(--tile);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 1.5px solid rgba(255, 255, 255, 0.16);
  border-radius: 4px;
  color: var(--tone);
  opacity: 0.7;
}
.unread .tile {
  border-color: var(--tone);
  opacity: 1;
}
.dot {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 10px;
  height: 10px;
  border-radius: 5px;
  background: var(--gold);
  box-shadow: 0 0 0 2px #0a141b;
}
.text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.title {
  font-size: 15px;
  color: #cbd5dc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unread .title {
  font-weight: 700;
  color: var(--text);
}
.sub {
  font-size: 13px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.unread .sub {
  color: #b9c7cf;
}
.when {
  flex: none;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.unread .when {
  color: var(--text);
}
.chevron {
  flex: none;
  width: 7px;
  height: 7px;
  margin: 0 4px 3px 2px;
  border-right: 2px solid var(--muted);
  border-bottom: 2px solid var(--muted);
  transform: rotate(45deg);
}
.chevron.open {
  margin-bottom: 0;
  margin-top: 3px;
  transform: rotate(225deg);
}
.location {
  flex: none;
}
.unread .location {
  border: 1px solid rgba(255, 197, 92, 0.4);
  border-radius: 10px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 640px) {
  .report-inbox-row {
    min-height: 44px;
  }
}
</style>
