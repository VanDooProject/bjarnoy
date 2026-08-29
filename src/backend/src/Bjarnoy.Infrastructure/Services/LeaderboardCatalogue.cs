using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// The fixed set of (scope, category) boards the API surface exposes (issue
/// #43 §5) and, for each one <see cref="LeaderboardService"/> does not compute
/// yet, the machine-readable reason it is dark. A board absent from
/// <see cref="Boards"/> is not a board this API knows about at all.
/// </summary>
public static class LeaderboardCatalogue
{
    /// <summary><see langword="null"/> means the board is live — <see cref="LeaderboardService"/> computes it today.</summary>
    public static readonly IReadOnlyDictionary<(LeaderboardScope Scope, LeaderboardCategory Category), string?> Boards =
        new Dictionary<(LeaderboardScope, LeaderboardCategory), string?>
        {
            [(LeaderboardScope.User, LeaderboardCategory.Score)] = null,
            [(LeaderboardScope.Settlement, LeaderboardCategory.BiggestSettlement)] = null,
            [(LeaderboardScope.User, LeaderboardCategory.WeeklyScoreGained)] = "noWeeklyWindowsYet",
            [(LeaderboardScope.User, LeaderboardCategory.WeeklyFightsWon)] = "noBattleSystemYet",
            [(LeaderboardScope.User, LeaderboardCategory.WeeklyFightsLost)] = "noBattleSystemYet",
            [(LeaderboardScope.User, LeaderboardCategory.WeeklyResourcesLooted)] = "noBattleSystemYet",
            [(LeaderboardScope.User, LeaderboardCategory.BiggestArmy)] = "noArmySystemYet",
            [(LeaderboardScope.Guild, LeaderboardCategory.Score)] = "noGuildSystemYet",
        };

    /// <summary>
    /// The reason a board with no current snapshot is dark: the reserved
    /// reason for a known-but-unimplemented board, "notComputedYet" for a
    /// live board the job simply has not ticked for yet, or "unknownBoard"
    /// for a (scope, category) pair this API does not define at all.
    /// </summary>
    public static string DarkReason(LeaderboardScope scope, LeaderboardCategory category) =>
        Boards.TryGetValue((scope, category), out var reason) ? reason ?? "notComputedYet" : "unknownBoard";
}
