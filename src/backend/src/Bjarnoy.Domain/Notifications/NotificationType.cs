namespace Bjarnoy.Domain.Notifications;

/// <summary>
/// The kinds of push notification a player can receive. Stored as
/// <c>int</c> (<c>HasConversion&lt;int&gt;()</c>) in <c>notification_opt_outs</c>
/// and <c>notification_outbox</c> — append-only, values are never renumbered
/// or reused once shipped, the same rule as <c>ReportSourceType</c>. Grouped
/// with gaps so later additions land next to their kin. See
/// <c>docs/plans/push-notifications.md</c>'s taxonomy table for the design
/// rationale and which of these are wired up yet.
/// </summary>
public enum NotificationType
{
    // Settlement (10-19)
    BuildCompleted = 10,
    TrainingCompleted = 11,

    // Reports (20-29)
    BattleReport = 20,
    FieldBattleReport = 21,
    TradeReport = 22,

    // Social (30-39)
    DirectMessage = 30,
    GuildBoardPost = 31,
    GuildTreatyProposed = 32,
    GuildInvited = 33,

    // World (40-49)
    WorldEndboss = 40,

    // Account (50-59)
    AccountStatusChanged = 50,
}
