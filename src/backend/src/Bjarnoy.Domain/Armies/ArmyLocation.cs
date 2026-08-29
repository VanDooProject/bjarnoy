namespace Bjarnoy.Domain.Armies;

/// <summary>
/// Where an army is: standing at its home settlement, or somewhere along a
/// <see cref="Bjarnoy.Domain.Movement.Movement"/>.
/// </summary>
/// <remarks>
/// A closed set of three variants, modelled as an abstract record with
/// one derived record per case (rather than, say, a struct with a nullable
/// <c>Movement?</c>) so each variant only carries the data that makes sense
/// for it — <see cref="AtHome"/> needs nothing at all — and callers get an
/// exhaustive-switch-shaped pattern match (<c>Location switch { AtHome => …,
/// InTransit(var movement) => …, Supporting(var host) => … }</c>) rather than
/// a null check standing in for a case distinction. There is no existing
/// discriminated-union precedent elsewhere in this codebase to match; this is
/// the shape chosen for it (issue #40 phase 2; <see cref="Supporting"/> added
/// phase 4).
/// </remarks>
public abstract record ArmyLocation
{
    private ArmyLocation()
    {
    }

    /// <summary>Standing in its home settlement — not travelling, not consuming provisions.</summary>
    public sealed record AtHome : ArmyLocation;

    /// <summary>Somewhere along <paramref name="Movement"/> — outbound, standing at the destination, or returning.</summary>
    public sealed record InTransit(Bjarnoy.Domain.Movement.Movement Movement) : ArmyLocation;

    /// <summary>
    /// Standing as a guest garrison at <paramref name="HostSettlementId"/> —
    /// an <see cref="Army.Mission"/> of <see cref="ArmyMission.Support"/> that
    /// has arrived (issue #40 phase 4). Not travelling, not consuming its own
    /// provisions (the host feeds it — see <c>Settlement.SettleTo</c>'s
    /// <c>guestStacks</c> parameter); stays here until the owner
    /// <see cref="Army.Recall"/>s it. <paramref name="HostSettlementId"/> is
    /// the same settlement <see cref="Army.TargetSettlementId"/> named at
    /// dispatch — the guest's destination and its current host are one and
    /// the same, so no separate field is stored on <c>Army</c> for it.
    /// </summary>
    public sealed record Supporting(Guid HostSettlementId) : ArmyLocation;
}
