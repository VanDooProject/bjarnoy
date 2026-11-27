namespace Bjarnoy.Domain.Armies;

/// <summary>What an army report tells the player.</summary>
public enum ArmyReportKind
{
    /// <summary>The army stopped because a wall blocks its way.</summary>
    Stuck = 0,

    /// <summary>The army cannot get home and its food ran out: the whole army died where it stood.</summary>
    Starved = 1,
}
