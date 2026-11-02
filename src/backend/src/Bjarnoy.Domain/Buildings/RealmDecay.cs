using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Buildings;

/// <summary>What <see cref="RealmDecay.StepFor"/> says has to happen to one building.</summary>
public enum RealmStepKind
{
    /// <summary>Nothing: inside and not marked, outside and nothing due yet, or a foundation outside.</summary>
    None = 0,

    /// <summary>The hex just left the realm: mark it (<see cref="PlacedBuilding.OutsideRealmSince"/>) and stop its function.</summary>
    LeaveRealm,

    /// <summary>The realm reaches the hex again: clear the mark. Levels already lost stay lost.</summary>
    ReturnToRealm,

    /// <summary>A level-0 foundation stands outside the realm: cancel its orders (refunded) and remove it.</summary>
    CancelFoundation,

    /// <summary>Still outside and at least one level-loss interval has passed.</summary>
    Decay,
}

/// <summary>One building's due realm step: <see cref="LevelsLost"/> is the whole intervals elapsed for <see cref="RealmStepKind.Decay"/>.</summary>
public readonly record struct RealmStep(RealmStepKind Kind, int LevelsLost = 0)
{
    /// <summary>No step is due.</summary>
    public static RealmStep None => default;

    /// <summary>Whether anything has to change.</summary>
    public bool IsDue => Kind != RealmStepKind.None;
}

/// <summary>
/// The rule for buildings outside the realm (<c>docs/design/economy.md</c> section 5, "Buildings outside the realm decay"), for one
/// building. <see cref="Settlement.ApplyRealmState"/> applies it to a settlement, and the periodic sweep asks it which settlements
/// have anything due, so both read the one rule.
/// </summary>
public static class RealmDecay
{
    /// <summary>
    /// Whether <paramref name="building"/>'s hex is inside <paramref name="realm"/>: claimed by its connected discs
    /// (<see cref="Territory.Claims"/>, the test <see cref="Settlement.PlanBuild"/> uses). The Longhouse is always inside.
    /// </summary>
    public static bool IsInside(PlacedBuilding building, ConnectedRealm realm, IGiantIndex giants)
    {
        ArgumentNullException.ThrowIfNull(realm);
        ArgumentNullException.ThrowIfNull(giants);
        return !BuildingCatalogue.Decays(building.Type) || Territory.Claims(realm.AllDiscs, building.Coord, giants);
    }

    /// <summary>
    /// What has to happen to <paramref name="building"/> at <paramref name="now"/>: it just left the realm, the realm reaches it
    /// again, or it has been outside for whole level-loss intervals (levels lost = floor(elapsed / interval), the interval taken
    /// at the world's <paramref name="speedFactor"/>). A level-0 foundation outside the realm is cancelled.
    /// </summary>
    public static RealmStep StepFor(
        PlacedBuilding building, ConnectedRealm realm, IGiantIndex giants, DateTimeOffset now, double speedFactor = 1.0)
    {
        if (IsInside(building, realm, giants))
        {
            return building.OutsideRealmSince is null ? RealmStep.None : new RealmStep(RealmStepKind.ReturnToRealm);
        }

        if (building.Level < 1)
        {
            return new RealmStep(RealmStepKind.CancelFoundation);
        }

        if (building.OutsideRealmSince is not { } since)
        {
            return new RealmStep(RealmStepKind.LeaveRealm);
        }

        var interval = BuildingCatalogue.DecayInterval(building.Type, speedFactor);
        var lost = (int)Math.Min(int.MaxValue, Math.Max(0, (now - since).Ticks / interval.Ticks));
        return lost > 0 ? new RealmStep(RealmStepKind.Decay, lost) : RealmStep.None;
    }
}
