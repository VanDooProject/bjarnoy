using Bjarnoy.Domain.Ai;

namespace Bjarnoy.Infrastructure.Services;

/// <summary>
/// Tuning for the AI player system — bound from the <c>AiPlayers</c> config
/// section, see <c>docs/design/ai-players.md</c>'s "Configuration" table. Same
/// binding convention as <see cref="UserActivityOptions"/>.
/// </summary>
public sealed class AiPlayersOptions
{
    public const string SectionName = "AiPlayers";

    /// <summary>Master switch for both the takeover sweep and the AI turn runner.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// How long an anonymous settlement's <see cref="Entities.SettlementEntity.LastOwnerActivityAt"/>
    /// must be behind wall-clock now before <c>AiTakeoverService</c> hands it
    /// to an AI jarl.
    /// </summary>
    public TimeSpan TakeoverAfter { get; set; } = TimeSpan.FromDays(7);

    /// <summary>How often <c>AiPlayersHostedService</c> runs the takeover sweep.</summary>
    public TimeSpan TakeoverSweepInterval { get; set; } = TimeSpan.FromMinutes(10);

    /// <summary>
    /// Base time between one AI player's turns — divided by the owning
    /// world's speed factor, plus jitter, when <c>AiPlayerService.RunDueAsync</c>
    /// schedules the next one.
    /// </summary>
    public TimeSpan ActInterval { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Minimum gap between <see cref="Entities.SettlementEntity.LastOwnerActivityAt"/>
    /// writes for the same settlement — see <c>SettlementService.TouchOwnerActivityAsync</c>.
    /// </summary>
    public TimeSpan ActivityWriteThrottle { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Relative odds of each personality at takeover. A personality missing
    /// from this dictionary (including every one of them, when the section is
    /// left empty) gets weight 1 — see <c>AiTakeoverService</c>'s weighted pick.
    /// </summary>
    public Dictionary<AiPersonality, double> PersonalityWeights { get; set; } = [];
}
