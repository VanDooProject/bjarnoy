using Bjarnoy.Domain.Economy;

namespace Bjarnoy.Domain.World;

/// <summary>
/// The mutable part of a wildlife camp, stored as a snapshot and settled lazily like a resource pool:
/// the garrison at <see cref="SnapshotAt"/> plus the clock state. Every question is a pure function of
/// the state, the <see cref="Camp"/> (which carries family and rolled level) and an instant.
/// </summary>
/// <param name="Snapshot">Beasts alive at <see cref="SnapshotAt"/>.</param>
/// <param name="SnapshotAt">When <paramref name="Snapshot"/> was taken; regrowth runs from here.</param>
/// <param name="ClearedAt">Set while the camp stands cleared (the last fight killed every beast).</param>
/// <param name="CalmUntil">The camp does not attack before this instant; null when nobody has fought it.</param>
/// <param name="Clears">How many times the camp has been cleared; every 10th raises its effective level.</param>
/// <param name="Leftover">Loot a carry-capped hunt left behind, kept for the next visitor (default zero).</param>
public sealed record CampState(
    CampGarrison Snapshot,
    DateTimeOffset SnapshotAt,
    DateTimeOffset? ClearedAt,
    DateTimeOffset? CalmUntil,
    int Clears,
    ResourceAmounts Leftover = default)
{
    /// <summary>An untouched camp: full garrison at its rolled level, no clears, never calm.</summary>
    public static CampState Pristine(Camp camp, DateTimeOffset at) =>
        new(CampGarrison.Full(Strength(camp), camp.Level), at, null, null, 0);

    private static CampStrength Strength(Camp camp) => camp.Strong ? CampStrength.Strong : CampStrength.Weak;

    public int EffectiveLevel(Camp camp) => CampRules.EffectiveLevel(camp, Clears);

    /// <summary>
    /// The garrison at <paramref name="t"/>. An empty camp that was cleared stays empty inside a realm
    /// (except Fenrir's brood, which always regrows); otherwise each tier regrows linearly from the
    /// snapshot to its full count over <see cref="CampRules.RegrowDuration"/>.
    /// </summary>
    public CampGarrison GarrisonAt(Camp camp, DateTimeOffset t, bool insideRealm)
    {
        if (Snapshot.IsEmpty && ClearedAt is not null && insideRealm && camp.Family != CampFamilies.Fenrirbrood)
        {
            return CampGarrison.Empty;
        }

        if (t <= SnapshotAt)
        {
            return Snapshot;
        }

        var strength = Strength(camp);
        var full = CampGarrison.Full(strength, EffectiveLevel(camp));
        var progress = Math.Min(1.0, (t - SnapshotAt) / CampRules.RegrowDuration(strength));

        int Regrown(int snap, int fullCount) =>
            Math.Min(fullCount, snap + (int)Math.Floor(fullCount * progress));

        return new CampGarrison(
            Regrown(Snapshot.Young, full.Young),
            Regrown(Snapshot.Adult, full.Adult),
            Regrown(Snapshot.Alpha, full.Alpha));
    }

    /// <summary>
    /// The loot a hunt at <paramref name="t"/> can take: <see cref="Leftover"/> plus the level's
    /// <see cref="CampRules.LootPool"/> scaled by how much of the full garrison stands
    /// (defense power fraction, 0 for an empty camp), each resource rounded down.
    /// </summary>
    public ResourceAmounts LootAvailableAt(Camp camp, DateTimeOffset t, bool insideRealm) =>
        CampBattleResolver.LootAvailable(
            Leftover, camp, EffectiveLevel(camp), GarrisonAt(camp, t, insideRealm));

    /// <summary>
    /// The state after a hunt at <paramref name="at"/> (<see cref="AfterFight"/> with the plan's beast
    /// survivors). When the army won, <see cref="Leftover"/> becomes what it did not carry off, capped at one
    /// full pool of the level after the clear; otherwise it is unchanged. An already-empty camp is
    /// not a fight: use <see cref="AfterPickup"/>.
    /// </summary>
    public CampState AfterHunt(Camp camp, DateTimeOffset at, CampFightPlan plan)
    {
        ArgumentNullException.ThrowIfNull(plan);

        var next = AfterFight(camp, at, plan.BeastSurvivors);
        if (plan.Winner != CampFightWinner.Army)
        {
            return next;
        }

        var pool = CampRules.LootPool(camp, next.EffectiveLevel(camp));
        var rest = (plan.LootAvailable - plan.Loot).ClampToZero();
        return next with { Leftover = rest.ClampTo(pool) };
    }

    /// <summary>
    /// A hunt on an empty camp took <paramref name="taken"/> from <see cref="Leftover"/>. Not a clear:
    /// clears, clear time, snapshot and calm are untouched.
    /// </summary>
    public CampState AfterPickup(ResourceAmounts taken) =>
        this with { Leftover = (Leftover - taken).ClampToZero() };

    public bool IsCalmAt(DateTimeOffset t) => CalmUntil is { } until && t < until;

    /// <summary>Only a strong camp attacks, and only when not calm and an adult or alpha is alive.</summary>
    public bool IsAggressiveAt(Camp camp, DateTimeOffset t, bool insideRealm) =>
        camp.Strong && !IsCalmAt(t) && GarrisonAt(camp, t, insideRealm).HasFighters;

    public bool IsEmptyAt(Camp camp, DateTimeOffset t, bool insideRealm) =>
        GarrisonAt(camp, t, insideRealm).IsEmpty;

    /// <summary>
    /// The state after a fight at <paramref name="at"/> left <paramref name="survivors"/>: a new snapshot,
    /// calm for <see cref="CampRules.CalmDuration"/>; if no beast survived the camp is cleared
    /// (<see cref="ClearedAt"/> set, <see cref="Clears"/> + 1), otherwise <see cref="ClearedAt"/> is reset.
    /// </summary>
    public CampState AfterFight(Camp camp, DateTimeOffset at, CampGarrison survivors) => this with
    {
        Snapshot = survivors,
        SnapshotAt = at,
        CalmUntil = at + CampRules.CalmDuration,
        ClearedAt = survivors.IsEmpty ? at : null,
        Clears = survivors.IsEmpty ? Clears + 1 : Clears,
    };
}
