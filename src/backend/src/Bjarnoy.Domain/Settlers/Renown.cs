namespace Bjarnoy.Domain.Settlers;

/// <summary>
/// Account-level "culture points" (issue #55 §3): accrues per building level
/// per hour, summed across every settlement a player holds, never decays, and
/// is never spent — it only ever gates how many settlements a player may
/// found (see <see cref="RenownThresholds"/>). Claim radius stays a purely
/// per-settlement, Longhouse-level-driven thing (<see cref="Buildings.Settlement.ClaimRadius"/>)
/// and is untouched by this.
/// </summary>
/// <remarks>
/// <para>
/// Mirrors <see cref="Economy.ResourcePool"/>'s "stock plus a rate, settled
/// lazily on read" shape, but at account scope: <see cref="Total"/> is only
/// ever true as of <see cref="SettledAt"/>; <see cref="SettleTo"/> rolls it
/// forward using whatever <c>totalBuildingLevels</c> is handed it.
/// </para>
/// <para>
/// Deliberate v1 simplification: unlike <see cref="Economy.ResourcePool"/>,
/// which re-rates itself at the exact instant production changes (every
/// building completion re-derives a fresh rate — see
/// <see cref="Buildings.Settlement.SettleTo"/>), this only knows the level
/// total as of whenever it is called — it does not itself track a history of
/// every building completing across every settlement a player owns. Calling
/// it right after any settlement-changing action (as the infrastructure layer
/// does — see <c>RenownService</c>) keeps the error small in practice, but a
/// player who is never read for a long stretch while a build silently
/// completes underneath them will have that stretch rated at the old level
/// total rather than the (higher) one that applied for only part of it. A
/// fully continuous, per-change accrual — mirroring <c>ResourcePool</c>
/// exactly — is future work, not required for a v1 slot-gating mechanic where
/// the total only ever needs to cross a threshold, never be exact to the
/// point.
/// </para>
/// </remarks>
public sealed record RenownAccount
{
    /// <summary>Renown points accrued per building level, per hour (issue #55 §3).</summary>
    public const double PointsPerLevelPerHour = 1.0;

    public required double Total { get; init; }

    public required DateTimeOffset SettledAt { get; init; }

    /// <summary>A brand-new account: no renown yet, settled as of <paramref name="now"/>.</summary>
    public static RenownAccount Empty(DateTimeOffset now) => new() { Total = 0, SettledAt = now };

    /// <summary>
    /// Rolls this account forward to <paramref name="now"/>, adding
    /// <paramref name="totalBuildingLevels"/> (summed across every building in
    /// every settlement the player owns, as of the call site) × <see cref="PointsPerLevelPerHour"/>
    /// for each hour elapsed since <see cref="SettledAt"/>. A no-op — same
    /// instance shape, just re-stamped — when <paramref name="now"/> is not
    /// after <see cref="SettledAt"/>; renown never decays, so there is nothing
    /// to roll backwards.
    /// </summary>
    public RenownAccount SettleTo(DateTimeOffset now, int totalBuildingLevels)
    {
        if (now <= SettledAt)
        {
            return this;
        }

        var elapsedHours = (now - SettledAt).TotalHours;
        var accrued = totalBuildingLevels * PointsPerLevelPerHour * elapsedHours;

        return this with { Total = Total + accrued, SettledAt = now };
    }
}

/// <summary>
/// The renown a player must already hold, at dispatch time, to found their
/// Nth settlement (issue #55 §3) — a reasonable v1 escalating curve (roughly
/// doubling per additional settlement, Travian-"culture points"-style), not a
/// tuned economy figure. A player's first settlement (founded the ordinary
/// way, via <c>SettlementService.FoundAsync</c>) needs none of this — the
/// curve only ever gates the second settlement onward.
/// </summary>
public static class RenownThresholds
{
    /// <summary>Renown required to found the 2nd settlement — the base of the escalating curve.</summary>
    public const double BaseThreshold = 500;

    /// <summary>
    /// Renown required, at dispatch time, to found the
    /// <paramref name="settlementNumber"/>th settlement (2, 3, 4, …) — the 1st
    /// is free (see the type-level remarks). <c>BaseThreshold × 2^(n-2)</c>:
    /// 500 for the 2nd, 1000 for the 3rd, 2000 for the 4th, and so on.
    /// </summary>
    public static double RequiredFor(int settlementNumber)
    {
        if (settlementNumber <= 1)
        {
            return 0;
        }

        return BaseThreshold * Math.Pow(2, settlementNumber - 2);
    }

    /// <summary>
    /// Whether a player already holding <paramref name="existingSettlementCount"/>
    /// settlements, with <paramref name="renownTotal"/> renown, may dispatch a
    /// founding mission for one more (issue #55 §6: this check happens at
    /// dispatch time, not at arrival — a convoy already travelling is never
    /// invalidated by a threshold or slot rule that changes after it left).
    /// </summary>
    public static bool AllowsAnotherSettlement(int existingSettlementCount, double renownTotal) =>
        renownTotal >= RequiredFor(existingSettlementCount + 1);
}
