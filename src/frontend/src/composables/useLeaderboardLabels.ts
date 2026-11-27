import { useI18n } from 'vue-i18n';
import type { LeaderboardBoardInfoResponse, LeaderboardCategory, LeaderboardScope } from '../api/types';
import type { MessageSchema } from '../i18n/schema';

/**
 * The player-facing words for leaderboard scopes, categories, dark-board reasons and column heads. One place, so the
 * desktop rail, the phone board list and the board header never word the same board differently.
 */
export function useLeaderboardLabels() {
  const { t } = useI18n<{ message: MessageSchema }>({ useScope: 'global' });

  const scopeLabel = (scope: LeaderboardScope) => t(`leaderboard.scopes.${scope}`);
  const categoryLabel = (category: LeaderboardCategory) => t(`leaderboard.categories.${category}`);
  const valueHead = (category: LeaderboardCategory) => t(`leaderboard.valueHeads.${category}`);
  const nameHead = (scope: LeaderboardScope) => t(`leaderboard.nameHeads.${scope}`);

  // A reason the client has no text for renders as its raw code rather than nothing.
  const darkReasons: Record<string, () => string> = {
    noBattleSystemYet: () => t('leaderboard.darkReasons.noBattleSystemYet'),
    noArmySystemYet: () => t('leaderboard.darkReasons.noArmySystemYet'),
    noGuildSystemYet: () => t('leaderboard.darkReasons.noGuildSystemYet'),
    noWeeklyWindowsYet: () => t('leaderboard.darkReasons.noWeeklyWindowsYet'),
    notComputedYet: () => t('leaderboard.darkReasons.notComputedYet'),
    unknownBoard: () => t('leaderboard.darkReasons.unknownBoard'),
  };
  const darkReason = (board: Pick<LeaderboardBoardInfoResponse, 'reason'>) =>
    board.reason ? (darkReasons[board.reason]?.() ?? board.reason) : '';

  return { scopeLabel, categoryLabel, valueHead, nameHead, darkReason };
}
