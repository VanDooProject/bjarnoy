<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useLeaderboardStore } from '../stores/leaderboard';
import { useWorldStore } from '../stores/world';
import type { LeaderboardCategory, LeaderboardScope } from '../api/types';

const world = useWorldStore();
const auth = useAuthStore();
const leaderboard = useLeaderboardStore();

const scopeLabels: Record<LeaderboardScope, string> = {
  user: 'Players',
  settlement: 'Settlements',
  guild: 'Guilds',
};

const categoryLabels: Record<LeaderboardCategory, string> = {
  score: 'Score',
  biggestSettlement: 'Biggest settlement',
  weeklyScoreGained: 'Weekly score gained',
  weeklyFightsWon: 'Weekly fights won',
  weeklyFightsLost: 'Weekly fights lost',
  weeklyResourcesLooted: 'Weekly resources looted',
  biggestArmy: 'Biggest army',
};

// Mirrors the reasons `LeaderboardCatalogue.cs` hands back — kept as a plain
// map so a reason with no entry here still renders something (its raw code).
const darkReasonLabels: Record<string, string> = {
  noBattleSystemYet: 'Unlocks once battles exist.',
  noArmySystemYet: 'Unlocks once armies exist.',
  noGuildSystemYet: 'Unlocks once guilds exist.',
  noWeeklyWindowsYet: 'Unlocks once weekly windows are tracked.',
  notComputedYet: 'Not computed yet — check back soon.',
  unknownBoard: 'This board does not exist.',
};

const scopeOrder: LeaderboardScope[] = ['user', 'settlement', 'guild'];
const groupedBoards = computed(() =>
  scopeOrder
    .map((scope) => ({ scope, boards: leaderboard.boardsByScope[scope] ?? [] }))
    .filter((group) => group.boards.length > 0),
);

const activeBoard = computed(() => leaderboard.board);
const canJumpToMyRank = computed(
  () => auth.isAuthenticated && leaderboard.scope !== null && activeBoard.value?.available === true,
);

function isActive(scope: LeaderboardScope, category: LeaderboardCategory) {
  return leaderboard.scope === scope && leaderboard.category === category;
}

function selectTab(scope: LeaderboardScope, category: LeaderboardCategory) {
  void leaderboard.selectBoard(scope, category);
}

function loadMore() {
  void leaderboard.loadPage();
}

function jumpToMyRank() {
  void leaderboard.jumpToMyRank();
}

async function loadForCurrentWorld() {
  if (!world.worldId) return;
  await leaderboard.loadDirectory(world.worldId);
  const first = leaderboard.boards[0];
  if (first) await leaderboard.selectBoard(first.scope, first.category);
}

onMounted(loadForCurrentWorld);
watch(() => world.worldId, loadForCurrentWorld);
</script>

<template>
  <div class="leaderboard">
    <h1>Leaderboards</h1>

    <p v-if="!world.worldId" class="hint">No live world to show leaderboards for.</p>

    <template v-else>
      <p v-if="leaderboard.directoryLoading">Loading…</p>
      <p v-else-if="leaderboard.directoryError" class="error">{{ leaderboard.directoryError }}</p>

      <template v-else>
        <div class="tab-groups">
          <div v-for="group in groupedBoards" :key="group.scope" class="tab-group">
            <span class="tab-group-label">{{ scopeLabels[group.scope] }}</span>
            <div class="tabs">
              <button
                v-for="board in group.boards"
                :key="`${board.scope}-${board.category}`"
                type="button"
                class="tab"
                :class="{ active: isActive(board.scope, board.category), dark: !board.available }"
                :title="board.available ? undefined : darkReasonLabels[board.reason ?? ''] ?? board.reason ?? ''"
                @click="selectTab(board.scope, board.category)"
              >
                {{ categoryLabels[board.category] }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="activeBoard" class="board">
          <div class="board-header">
            <h2>{{ categoryLabels[activeBoard.category] }}</h2>
            <button v-if="canJumpToMyRank" type="button" class="jump-btn" @click="jumpToMyRank">
              Jump to my rank
            </button>
          </div>

          <p v-if="!activeBoard.available" class="hint">
            {{ darkReasonLabels[activeBoard.reason ?? ''] ?? activeBoard.reason }}
          </p>

          <template v-else>
            <p v-if="leaderboard.myRankError" class="error">{{ leaderboard.myRankError }}</p>

            <p v-if="leaderboard.boardLoading && leaderboard.entries.length === 0">Loading…</p>
            <p v-else-if="leaderboard.boardError" class="error">{{ leaderboard.boardError }}</p>
            <p v-else-if="leaderboard.entries.length === 0">No entries yet.</p>

            <template v-else>
              <table class="table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Name</th>
                    <th>Value</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="entry in leaderboard.entries"
                    :key="entry.subjectId"
                    :class="{ 'my-row': entry.rank === leaderboard.myRank }"
                  >
                    <td>{{ entry.rank }}</td>
                    <td>{{ entry.subjectName }}</td>
                    <td>{{ Math.round(entry.value) }}</td>
                    <td>
                      <span v-if="entry.previousRank === null" class="badge new">new</span>
                      <span v-else-if="entry.delta && entry.delta > 0" class="badge up">▲ {{ entry.delta }}</span>
                      <span v-else-if="entry.delta && entry.delta < 0" class="badge down">▼ {{ -entry.delta }}</span>
                      <span v-else class="badge flat">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div class="pager">
                <button :disabled="leaderboard.boardLoading || !leaderboard.nextAfterRank" @click="loadMore">
                  {{ leaderboard.boardLoading ? 'Loading…' : 'Load more' }}
                </button>
              </div>
            </template>
          </template>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.leaderboard h1 {
  margin: 0 0 16px;
}
.tab-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-bottom: 20px;
}
.tab-group-label {
  display: block;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  margin-bottom: 6px;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tab {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
}
.tab.active {
  border-color: var(--gold);
  color: var(--gold);
}
.tab.dark {
  opacity: 0.5;
}
.board-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.board-header h2 {
  margin: 0;
  font-size: 16px;
}
.jump-btn {
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  cursor: pointer;
}
.table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
}
.table th,
.table td {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 1px solid var(--panel-border);
  font-size: 14px;
  vertical-align: middle;
}
.my-row {
  background: var(--panel-bg);
}
.badge {
  font-size: 12px;
  font-weight: 600;
}
.badge.up {
  color: #4caf6a;
}
.badge.down {
  color: var(--rival);
}
.badge.new {
  color: var(--gold);
}
.badge.flat {
  color: var(--muted);
}
.pager {
  display: flex;
  justify-content: center;
}
.pager button {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 6px 16px;
  color: var(--text);
  cursor: pointer;
}
.pager button:disabled {
  opacity: 0.5;
  cursor: default;
}
.hint {
  color: var(--muted);
  font-size: 14px;
}
.error {
  color: var(--rival);
  font-size: 13px;
}
</style>
