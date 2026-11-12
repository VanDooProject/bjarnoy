<script setup lang="ts">
// Phone board picker: the first screen of the leaderboard dialog. One card per scope, one tall row per board
// (label + subline, the caller's rank and a chevron; a dark board shows a lock and its reason instead).
import type { LeaderboardBoardInfoResponse } from '../../api/types';
import { isWeeklyCategory } from '../../stores/leaderboard';
import { useLeaderboardLabels } from '../../composables/useLeaderboardLabels';
import LeaderboardIcon from './LeaderboardIcon.vue';
import type { BoardGroup } from './LeaderboardRail.vue';

defineProps<{ groups: BoardGroup[] }>();
const emit = defineEmits<{ select: [board: LeaderboardBoardInfoResponse] }>();

const { scopeLabel, categoryLabel, darkReason } = useLeaderboardLabels();
</script>

<template>
  <div class="picker">
    <div v-for="group in groups" :key="group.scope" class="group">
      <span class="group-label">{{ scopeLabel(group.scope) }}</span>
      <div class="card">
        <button
          v-for="board in group.boards"
          :key="`${board.scope}-${board.category}`"
          type="button"
          class="row"
          :class="{ dark: !board.available }"
          @click="emit('select', board)"
        >
          <span class="row-text">
            <span class="row-name">{{ categoryLabel(board.category) }}</span>
            <span class="row-sub">
              <template v-if="!board.available">{{ darkReason(board) }}</template>
              <template v-else-if="isWeeklyCategory(board.category)">{{ $t('leaderboard.thisWeek') }}</template>
              <template v-else-if="board.entryCount !== null">{{ $t('leaderboard.ofEntries', { count: $n(board.entryCount, 'integer') }) }}</template>
            </span>
          </span>
          <LeaderboardIcon v-if="!board.available" name="lock" />
          <template v-else>
            <span v-if="board.myRank !== null" class="row-rank">{{ $t('leaderboard.rankShort', { rank: board.myRank }) }}</span>
            <LeaderboardIcon name="chevron-right" :size="18" class="chevron" />
          </template>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.picker {
  padding: 8px 16px 30px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.group {
  display: flex;
  flex-direction: column;
}
.group-label {
  padding: 8px 0 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.card {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 8px 14px;
  background: transparent;
  border: none;
  font-size: 15px;
  text-align: left;
  color: var(--text);
  cursor: pointer;
}
.row + .row {
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}
.row.dark {
  color: var(--muted-2);
}
.row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.row-sub {
  font-size: 12px;
  color: var(--muted);
}
.row-rank {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.chevron {
  color: var(--muted);
}
</style>
