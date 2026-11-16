<script setup lang="ts">
// Desktop board rail: the dialog's heading and one button per board, grouped by scope. A dark board stays in the
// list (muted, locked) so the player sees it exists; its reason is the button's accessible description.
import type { LeaderboardBoardInfoResponse, LeaderboardScope } from '../../api/types';
import { useLeaderboardLabels } from '../../composables/useLeaderboardLabels';
import LeaderboardIcon from './LeaderboardIcon.vue';

export interface BoardGroup {
  scope: LeaderboardScope;
  boards: LeaderboardBoardInfoResponse[];
}

defineProps<{
  groups: BoardGroup[];
  active: LeaderboardBoardInfoResponse | null;
}>();
const emit = defineEmits<{ select: [board: LeaderboardBoardInfoResponse] }>();

const { scopeLabel, categoryLabel, darkReason } = useLeaderboardLabels();

const boardKey = (board: LeaderboardBoardInfoResponse) => `${board.scope}-${board.category}`;
</script>

<template>
  <nav class="rail" :aria-label="$t('leaderboard.railLabel')">
    <h1 class="rail-title">{{ $t('leaderboard.title') }}</h1>
    <div v-for="group in groups" :key="group.scope" class="group">
      <span class="group-label">{{ scopeLabel(group.scope) }}</span>
      <button
        v-for="board in group.boards"
        :key="boardKey(board)"
        type="button"
        class="board"
        :class="{
          active: active !== null && boardKey(active) === boardKey(board),
          dark: !board.available,
        }"
        :aria-current="active !== null && boardKey(active) === boardKey(board) ? 'true' : undefined"
        :aria-describedby="board.available ? undefined : `reason-${boardKey(board)}`"
        @click="emit('select', board)"
      >
        <span class="board-name">{{ categoryLabel(board.category) }}</span>
        <LeaderboardIcon v-if="!board.available" name="lock" :size="13" />
        <span v-else-if="board.myRank !== null" class="board-rank">{{ $t('leaderboard.rankShort', { rank: board.myRank }) }}</span>
        <span v-if="!board.available" :id="`reason-${boardKey(board)}`" hidden>{{ darkReason(board) }}</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.rail {
  flex: none;
  width: 260px;
  box-sizing: border-box;
  padding: 22px 14px;
  background: rgba(255, 255, 255, 0.025);
  border-right: 1px solid var(--panel-border);
  display: flex;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
}
.rail-title {
  margin: 0 10px;
  font-family: 'Alegreya Sans SC', serif;
  font-size: 26px;
  letter-spacing: 0.02em;
}
.group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.group-label {
  padding: 0 10px 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.board {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 14px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.board:hover {
  background: rgba(255, 255, 255, 0.05);
}
.board.dark {
  color: var(--muted-2);
}
.board.active {
  background: color-mix(in srgb, var(--gold) 14%, transparent);
  color: var(--gold);
  font-weight: 600;
}
.board-name {
  flex: 1;
  text-align: left;
}
.board-rank {
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
</style>
