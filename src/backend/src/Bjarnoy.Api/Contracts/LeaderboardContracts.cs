using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;

namespace Bjarnoy.Api.Contracts;

/// <param name="Reason">
/// Set only when <paramref name="Available"/> is <see langword="false"/> — one
/// of "noBattleSystemYet", "noArmySystemYet", "noGuildSystemYet",
/// "noWeeklyWindowsYet", "notComputedYet", or "unknownBoard" (issue #43 §5).
/// </param>
public sealed record LeaderboardBoardInfoResponse(
    string Scope,
    string Category,
    bool Available,
    string? Reason,
    DateTimeOffset? ComputedAt,
    int? EntryCount)
{
    public static LeaderboardBoardInfoResponse From(LeaderboardBoardStatus status) => new(
        status.Scope.ToWireName(),
        status.Category.ToWireName(),
        status.Available,
        status.Reason,
        status.ComputedAt,
        status.EntryCount);
}

/// <summary>A closed weekly window, oldest first.</summary>
public sealed record WeeklyWindowResponse(DateTimeOffset PeriodStart, DateTimeOffset PeriodEnd);

public sealed record LeaderboardDirectoryResponse(
    IReadOnlyList<LeaderboardBoardInfoResponse> Boards,
    IReadOnlyList<WeeklyWindowResponse> WeeklyWindows);

/// <param name="Delta">
/// <see cref="PreviousRank"/> minus <see cref="Rank"/>: positive means the
/// subject moved up. <see langword="null"/> for a new entrant.
/// </param>
public sealed record LeaderboardEntryResponse(
    int Rank,
    Guid SubjectId,
    string SubjectName,
    double Value,
    int? PreviousRank,
    int? Delta)
{
    public static LeaderboardEntryResponse From(LeaderboardEntryEntity entry) => new(
        entry.Rank,
        entry.SubjectId,
        entry.SubjectName,
        entry.Value,
        entry.PreviousRank,
        entry.PreviousRank - entry.Rank);
}

/// <param name="PeriodStart">
/// Game time; <see langword="null"/> for the all-time board — the only kind PR 2 serves.
/// </param>
/// <param name="NextAfterRank">
/// Keyset cursor for the next page: pass as <c>afterRank</c> to continue.
/// <see langword="null"/> when this page held no entries (end of the board,
/// or a dark board).
/// </param>
public sealed record LeaderboardBoardResponse(
    string Scope,
    string Category,
    bool Available,
    string? Reason,
    bool IsFinal,
    DateTimeOffset? PeriodStart,
    DateTimeOffset? PeriodEnd,
    DateTimeOffset? ComputedAt,
    IReadOnlyList<LeaderboardEntryResponse> Items,
    int? NextAfterRank)
{
    public static LeaderboardBoardResponse From(
        LeaderboardScope scope, LeaderboardCategory category, LeaderboardBoardPage page) => new(
        scope.ToWireName(),
        category.ToWireName(),
        page.Available,
        page.Reason,
        page.IsFinal,
        page.PeriodStart,
        page.PeriodEnd,
        page.ComputedAt,
        [.. page.Items.Select(LeaderboardEntryResponse.From)],
        page.NextAfterRank);
}

public sealed record LeaderboardMeResponse(int MyRank, IReadOnlyList<LeaderboardEntryResponse> Items)
{
    public static LeaderboardMeResponse From(LeaderboardMeResult result) => new(
        result.MyRank, [.. result.Items.Select(LeaderboardEntryResponse.From)]);
}

/// <summary>
/// One user's weekly stat card (issue #43 §5). Only <see cref="ScoreGained"/>
/// is populated in PR 4 — the fights/loot fields from the issue's field table
/// arrive with PR 5's own migration, once #40's <c>BattleReport</c> exists.
/// </summary>
public sealed record WeeklyStatResponse(
    DateTimeOffset PeriodStart, DateTimeOffset PeriodEnd, bool IsFinal, double ScoreGained)
{
    public static WeeklyStatResponse From(WeeklyStatEntity entity) => new(
        entity.PeriodStart, entity.PeriodEnd, entity.IsFinal, entity.ScoreGained);
}

/// <param name="NextCursor">Keyset cursor for the next (older) page; <see langword="null"/> at the end.</param>
public sealed record WeeklyStatsPageResponse(IReadOnlyList<WeeklyStatResponse> Items, Guid? NextCursor);

internal static class LeaderboardWireNames
{
    public static string ToWireName(this LeaderboardScope scope) => scope switch
    {
        LeaderboardScope.User => "user",
        LeaderboardScope.Settlement => "settlement",
        LeaderboardScope.Guild => "guild",
        _ => throw new ArgumentOutOfRangeException(nameof(scope), scope, "Unknown leaderboard scope."),
    };

    public static string ToWireName(this LeaderboardCategory category) => category switch
    {
        LeaderboardCategory.Score => "score",
        LeaderboardCategory.BiggestSettlement => "biggestSettlement",
        LeaderboardCategory.WeeklyScoreGained => "weeklyScoreGained",
        LeaderboardCategory.WeeklyFightsWon => "weeklyFightsWon",
        LeaderboardCategory.WeeklyFightsLost => "weeklyFightsLost",
        LeaderboardCategory.WeeklyResourcesLooted => "weeklyResourcesLooted",
        LeaderboardCategory.BiggestArmy => "biggestArmy",
        _ => throw new ArgumentOutOfRangeException(nameof(category), category, "Unknown leaderboard category."),
    };
}
