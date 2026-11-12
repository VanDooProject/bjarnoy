<script setup lang="ts">
// The leaderboard dialog's content (rendered by components/leaderboard/LeaderboardModal.vue inside RouteModal.vue).
// Desktop: a board rail on the left, the open board on the right with its own heading and the dialog's × (RouteModal
// hands `close` down as `contentHeader`). Phone: a board list first, tapping a board drills into it (`boardOpen`, owned
// by the modal so the header's back chevron can step back to the list).
import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../stores/auth';
import { isWeeklyCategory, useLeaderboardStore } from '../stores/leaderboard';
import { useWorldStore } from '../stores/world';
import { useMediaQuery } from '../composables/useMediaQuery';
import { useLeaderboardLabels } from '../composables/useLeaderboardLabels';
import { MOBILE_MODAL_QUERY } from '../lib/breakpoints';
import { formatRelativeTime } from '../lib/dateTimeFormat';
import type { LeaderboardBoardInfoResponse, LeaderboardScope } from '../api/types';
import type { MessageSchema } from '../i18n/schema';
import LeaderboardEntries from '../components/leaderboard/LeaderboardEntries.vue';
import LeaderboardIcon from '../components/leaderboard/LeaderboardIcon.vue';
import LeaderboardPicker from '../components/leaderboard/LeaderboardPicker.vue';
import LeaderboardRail from '../components/leaderboard/LeaderboardRail.vue';
import LeaderboardWeekControl from '../components/leaderboard/LeaderboardWeekControl.vue';

const props = defineProps<{ close: () => void }>();
/** Phone only: whether a board is open (true) or the board list is showing (false). */
const boardOpen = defineModel<boolean>('boardOpen', { default: false });

const { t, locale } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });
const { scopeLabel, categoryLabel, darkReason } = useLeaderboardLabels();

const world = useWorldStore();
const auth = useAuthStore();
const leaderboard = useLeaderboardStore();

const isMobile = useMediaQuery(MOBILE_MODAL_QUERY);

const scopeOrder: LeaderboardScope[] = ['user', 'settlement', 'guild'];
const groups = computed(() =>
  scopeOrder
    .map((scope) => ({ scope, boards: leaderboard.boardsByScope[scope] ?? [] }))
    .filter((group) => group.boards.length > 0),
);

const activeBoard = computed(() => leaderboard.board);
const showBoard = computed(() => activeBoard.value !== null && (!isMobile.value || boardOpen.value));
const isWeekly = computed(() => isWeeklyCategory(leaderboard.category));

const title = computed(() =>
  activeBoard.value
    ? t('leaderboard.boardTitle', {
        scope: scopeLabel(activeBoard.value.scope),
        category: categoryLabel(activeBoard.value.category),
      })
    : t('leaderboard.title'),
);

const subline = computed(() => {
  const board = activeBoard.value;
  if (!board) return '';
  if (!board.available) return t('leaderboard.notAvailable');
  if (!board.computedAt) return '';
  return t('leaderboard.updated', { time: formatRelativeTime(board.computedAt, new Date(), locale.value) });
});

// `/me` always answers for the current snapshot, so the jump belongs to the current board, not an older week.
const canJumpToMyRank = computed(
  () =>
    auth.isAuthenticated &&
    activeBoard.value?.available === true &&
    activeBoard.value.myRank !== null &&
    leaderboard.selectedPeriodStart === null,
);

function select(board: LeaderboardBoardInfoResponse) {
  void leaderboard.selectBoard(board.scope, board.category);
  boardOpen.value = true;
}

async function loadForCurrentWorld() {
  if (!world.worldId) return;
  void leaderboard.loadOwnSubjects(world.worldId);
  await leaderboard.loadDirectory(world.worldId);
  selectFirstOnDesktop();
}

// The desktop pane always shows a board; the phone starts on the list and waits for a tap.
function selectFirstOnDesktop() {
  if (isMobile.value || leaderboard.board) return;
  const first = leaderboard.boards[0];
  if (first) void leaderboard.selectBoard(first.scope, first.category);
}

onMounted(loadForCurrentWorld);
watch(() => world.worldId, loadForCurrentWorld);
watch(isMobile, selectFirstOnDesktop);
</script>

<template>
  <div class="lb" :class="{ 'lb--phone': isMobile }">
    <LeaderboardRail v-if="!isMobile" :groups="groups" :active="activeBoard" @select="select" />

    <section class="pane" :aria-label="title">
      <header v-if="!isMobile" class="pane-head">
        <div class="pane-title">
          <h2>{{ title }}</h2>
          <span v-if="subline" class="sub">{{ subline }}</span>
        </div>
        <button v-if="canJumpToMyRank" type="button" class="jump" @click="leaderboard.jumpToMyRank()">
          {{ $t('leaderboard.jumpToMyRank') }}
        </button>
        <button type="button" class="close" :aria-label="$t('profile.close')" @click="props.close()">
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <template v-if="!world.worldId">
        <p class="status">{{ $t('leaderboard.noWorld') }}</p>
      </template>
      <p v-else-if="leaderboard.directoryLoading" class="status">{{ $t('common.states.loading') }}</p>
      <p v-else-if="leaderboard.directoryError" class="status error">{{ leaderboard.directoryError }}</p>

      <LeaderboardPicker v-else-if="isMobile && !showBoard" :groups="groups" @select="select" />

      <template v-else-if="showBoard && activeBoard">
        <div v-if="isMobile" class="strip">
          <span class="sub">{{ subline }}</span>
          <button v-if="canJumpToMyRank" type="button" class="jump jump--phone" @click="leaderboard.jumpToMyRank()">
            {{ $t('leaderboard.jumpToMyRank') }}
          </button>
        </div>
        <div v-if="isWeekly && activeBoard.available" class="week-row">
          <LeaderboardWeekControl />
        </div>

        <div class="pane-body">
          <div v-if="!activeBoard.available" class="locked">
            <LeaderboardIcon name="lock" :size="40" />
            <span class="locked-reason">{{ darkReason(activeBoard) }}</span>
          </div>

          <template v-else>
            <p v-if="leaderboard.myRankError" class="status error">{{ leaderboard.myRankError }}</p>
            <p v-if="leaderboard.boardLoading && leaderboard.entries.length === 0" class="status">
              {{ $t('common.states.loading') }}
            </p>
            <p v-else-if="leaderboard.boardError" class="status error">{{ leaderboard.boardError }}</p>
            <p v-else-if="leaderboard.entries.length === 0" class="status">{{ $t('leaderboard.noEntries') }}</p>
            <template v-else>
              <LeaderboardEntries :compact="isMobile" />
              <div class="pager">
                <button type="button" :disabled="leaderboard.boardLoading || !leaderboard.nextAfterRank" @click="leaderboard.loadPage()">
                  {{ leaderboard.boardLoading ? $t('common.states.loading') : $t('leaderboard.loadMore') }}
                </button>
              </div>
            </template>
          </template>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.lb {
  flex: 1;
  min-height: 0;
  display: flex;
}
.pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.pane-head {
  flex: none;
  padding: 22px 24px 14px 28px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.pane-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pane-title h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.sub {
  font-size: 13px;
  color: var(--muted);
}
.jump {
  background: var(--gold);
  color: #1a1208;
  border: none;
  border-radius: 8px;
  padding: 9px 14px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
}
.jump--phone {
  height: 40px;
  padding: 0 12px;
}
.close {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: transparent;
  border: 1px solid var(--panel-border);
  color: var(--text);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.close:hover {
  border-color: var(--gold);
  color: var(--gold);
}
.strip {
  flex: none;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.strip .sub {
  flex: 1;
}
.week-row {
  flex: none;
  padding: 12px 24px 4px 28px;
}
.lb--phone .week-row {
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}
.pane-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 24px 8px 28px;
}
.lb--phone .pane-body {
  padding: 0 0 16px;
}
.locked {
  min-height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--muted);
  text-align: center;
}
.locked-reason {
  font-size: 15px;
}
.status {
  margin: 0;
  padding: 16px 0;
  color: var(--muted);
  font-size: 14px;
}
.lb--phone .status {
  padding: 16px;
}
.status.error {
  color: var(--rival);
}
.pager {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}
.pager button {
  background: transparent;
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  padding: 8px 18px;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
}
.pager button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
