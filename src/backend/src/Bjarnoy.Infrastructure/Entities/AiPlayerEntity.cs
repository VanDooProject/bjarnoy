using Bjarnoy.Domain.Ai;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// One AI jarl — created by <c>AiTakeoverService.TakeOverAsync</c> when an
/// abandoned settlement is handed over (see
/// <c>docs/design/ai-players.md</c>'s "Takeover rule"), and driven every tick
/// by <c>AiPlayerService.RunDueAsync</c>. 1:1 with the <see cref="UserEntity"/>
/// it plans for — a single AI account may go on to hold more than one
/// settlement (a later PR: AI founding), all of which this one row drives.
/// </summary>
public class AiPlayerEntity
{
    /// <summary>
    /// Also the primary key: one AI player per account, not per settlement —
    /// same "the id is the natural key" shape as <see cref="UserActivityEntity"/>.
    /// </summary>
    public Guid UserId { get; set; }

    public UserEntity? User { get; set; }

    public Guid WorldId { get; set; }

    public WorldEntity? World { get; set; }

    public AiPersonality Personality { get; set; }

    /// <summary>
    /// This AI's ordered objective list — a personality's defaults at
    /// takeover, replaceable by an admin. Stored as JSON
    /// (<see cref="Bjarnoy.Infrastructure.Persistence.AiObjectiveListConverter"/>)
    /// rather than a normalised table: it is only ever read or replaced whole,
    /// never queried into.
    /// </summary>
    public List<AiObjective> Objectives { get; set; } = [];

    /// <summary>
    /// Wall clock — when <c>AiPlayerService.RunDueAsync</c> should next plan
    /// and act for this AI. Set to "now" at takeover so a freshly taken-over
    /// settlement gets its first turn on the very next sweep, then pushed
    /// forward by <c>AiPlayersOptions.ActInterval</c> (divided by the world's
    /// speed factor, plus jitter) after every tick.
    /// </summary>
    public DateTimeOffset NextActAt { get; set; }

    /// <summary>Wall clock — when this AI account was created (i.e. the takeover instant).</summary>
    public DateTimeOffset CreatedAt { get; set; }

    /// <summary>The settlement whose takeover created this AI, for reference/audit. Never reassigned afterwards.</summary>
    public Guid? TakenOverSettlementId { get; set; }
}
