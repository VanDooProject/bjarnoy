<script setup lang="ts">
// The ranked rows of the open board: a table on desktop, tall tap-friendly rows on a phone. Both read the same
// entries and mark the player's own row the same way (own player / own settlement realm / own guild).
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { LeaderboardEntryResponse } from '../../api/types';
import { useAuthStore } from '../../stores/auth';
import { useGuildStore } from '../../stores/guild';
import { useLeaderboardStore } from '../../stores/leaderboard';
import { useLeaderboardLabels } from '../../composables/useLeaderboardLabels';
import type { MessageSchema } from '../../i18n/schema';

defineProps<{ compact: boolean }>();

const { t, n } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const auth = useAuthStore();
const guild = useGuildStore();
const leaderboard = useLeaderboardStore();
const { nameHead, valueHead } = useLeaderboardLabels();

const scope = computed(() => leaderboard.scope ?? 'user');

function isOwn(entry: LeaderboardEntryResponse): boolean {
  switch (scope.value) {
    case 'user':
      return auth.user !== null && entry.subjectId === auth.user.id;
    case 'settlement':
      return leaderboard.ownSubjectIds.includes(entry.subjectId);
    case 'guild':
      return guild.current !== null && entry.subjectId === guild.current.id;
  }
}

function displayName(entry: LeaderboardEntryResponse): string {
  if (!isOwn(entry)) return entry.subjectName;
  return t(`leaderboard.own.${scope.value}`, { name: entry.subjectName });
}

/** How an entry's rank moved since the last snapshot: the colour kind and the text for it. */
function change(entry: LeaderboardEntryResponse): { kind: 'new' | 'up' | 'down' | 'flat'; text: string } {
  if (entry.previousRank === null) return { kind: 'new', text: t('leaderboard.badge.new') };
  if (entry.delta && entry.delta > 0) return { kind: 'up', text: `▲ ${entry.delta}` };
  if (entry.delta && entry.delta < 0) return { kind: 'down', text: `▼ ${-entry.delta}` };
  return { kind: 'flat', text: t('leaderboard.badge.flat') };
}

const formatValue = (value: number) => n(Math.round(value), 'integer');
</script>

<template>
  <div v-if="compact" class="rows">
    <div v-for="entry in leaderboard.entries" :key="entry.subjectId" class="row" :class="{ 'my-row': isOwn(entry) }">
      <span class="row-rank">{{ entry.rank }}</span>
      <span class="row-name">{{ displayName(entry) }}</span>
      <span class="row-value">{{ formatValue(entry.value) }}</span>
      <span class="change" :class="change(entry).kind">{{ change(entry).text }}</span>
    </div>
  </div>

  <table v-else class="table">
    <thead>
      <tr>
        <th class="col-rank">{{ $t('leaderboard.table.rank') }}</th>
        <th class="col-name">{{ nameHead(scope) }}</th>
        <th class="col-value">{{ leaderboard.category ? valueHead(leaderboard.category) : '' }}</th>
        <th class="col-change">{{ $t('leaderboard.table.change') }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="entry in leaderboard.entries" :key="entry.subjectId" :class="{ 'my-row': isOwn(entry) }">
        <td class="col-rank rank">{{ entry.rank }}</td>
        <td class="col-name name">{{ displayName(entry) }}</td>
        <td class="col-value">{{ formatValue(entry.value) }}</td>
        <td class="col-change change" :class="change(entry).kind">{{ change(entry).text }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.table th {
  position: sticky;
  top: 0;
  background: var(--shell);
  padding: 10px 12px 8px;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted);
  text-align: left;
}
.table td {
  padding: 8px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.col-rank {
  width: 52px;
  text-align: right !important;
  padding-left: 0 !important;
}
.col-value,
.col-change {
  text-align: right !important;
}
.col-change {
  width: 68px;
  padding-right: 0 !important;
}
.rank,
.col-value,
.row-rank,
.row-value {
  font-variant-numeric: tabular-nums;
}
.rank {
  font-weight: 600;
  color: var(--muted);
}
.name {
  font-weight: 500;
}
.change {
  font-size: 13px;
  font-weight: 600;
}
.change.new {
  color: var(--gold);
}
.change.up {
  color: var(--rank-up);
}
.change.down {
  color: var(--rival);
}
.change.flat {
  color: var(--muted);
}
.my-row {
  background: color-mix(in srgb, var(--realm-own) 14%, transparent);
}
/* The marker bar sits on the first cell: a shadow on a collapsed-border <tr> is not drawn everywhere. */
div.my-row,
tr.my-row td:first-child {
  box-shadow: inset 3px 0 0 var(--realm-own);
}

.rows {
  padding: 0 16px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 0 8px;
  margin: 0 -8px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 15px;
}
.row-rank {
  width: 28px;
  text-align: right;
  font-weight: 600;
  color: var(--muted);
}
.row-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.row .change {
  width: 40px;
  text-align: right;
  font-size: 12px;
}
</style>
