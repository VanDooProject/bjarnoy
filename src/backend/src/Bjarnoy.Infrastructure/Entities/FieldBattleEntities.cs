using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// A one-time claim on a single in-flight interception meeting (issue #206
/// §6's "resolved exactly once" requirement), inserted just before the fight
/// is actually resolved and never deleted afterwards. Two concurrent requests
/// that both discover the same meeting race to insert the same row (see
/// <see cref="Id"/>'s deterministic construction) — the database's unique
/// primary key means only one insert can ever succeed, so the loser's
/// <c>SaveChangesAsync</c> throws <c>DbUpdateException</c> and it simply backs
/// off rather than resolving the fight a second time.
/// </summary>
/// <remarks>
/// Deliberately not a general "predicted encounter" cache: this schema keeps
/// no pointer to a future meeting, and detection is recomputed fresh, from
/// live movement data, every time an army is settled (see
/// <c>FieldBattleService</c>) — there is nothing here that can ever go stale,
/// so no separate "route version"/invalidation bookkeeping is needed either.
/// This is a smaller surface than a persisted-prediction design, traded
/// deliberately for simplicity; see the PR's implementation notes.
/// </remarks>
public class FieldBattleClaimEntity
{
    /// <summary>
    /// Deterministic from the two army ids (order-independent) and the exact
    /// meeting instant (game ticks) — see <c>FieldBattleService.ClaimId</c>.
    /// Two callers who independently detect literally the same meeting always
    /// compute the same id, which is exactly what makes the insert race safe.
    /// A later, distinct meeting between the same two armies (e.g. a
    /// standing blockade intercepted twice) gets a different id because the
    /// instant differs, so it is not blocked by an earlier claim.
    /// </summary>
    public Guid Id { get; set; }

    public DateTimeOffset ClaimedAt { get; set; }
}

/// <summary>
/// The immutable, persisted record of one <see cref="FieldBattleResolver.Resolve"/>
/// call (issue #206) — the army-vs-army sibling of <see cref="BattleReportEntity"/>.
/// Lands in both sides' settlement inboxes (matched by either
/// <see cref="SideASettlementId"/> or <see cref="SideBSettlementId"/>), mirroring
/// how <see cref="BattleReportEntity"/> is looked up.
/// </summary>
public class FieldBattleReportEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>Game instant the two armies met.</summary>
    public DateTimeOffset OccurredAt { get; set; }

    public int HexQ { get; set; }

    public int HexR { get; set; }

    public Guid SideAArmyId { get; set; }

    public Guid SideASettlementId { get; set; }

    public Guid SideBArmyId { get; set; }

    public Guid SideBSettlementId { get; set; }

    public int Winner { get; set; }

    public double SideAPower { get; set; }

    public double SideBPower { get; set; }

    public bool SideAWasDefending { get; set; }

    public bool SideBWasDefending { get; set; }

    public int Seed { get; set; }

    /// <summary>Loot the winner took from the loser; zero (all four) on a tie.</summary>
    public double LootWood { get; set; }

    public double LootStone { get; set; }

    public double LootFood { get; set; }

    public double LootIron { get; set; }

    public List<FieldBattleReportLineEntity> Lines { get; set; } = [];

    public static FieldBattleReportEntity FromDomain(
        Guid id,
        DateTimeOffset occurredAt,
        HexCoord hex,
        Guid sideAArmyId,
        Guid sideASettlementId,
        Guid sideBArmyId,
        Guid sideBSettlementId,
        FieldBattlePlan plan,
        int seed)
    {
        ArgumentNullException.ThrowIfNull(plan);

        var entity = new FieldBattleReportEntity
        {
            Id = id,
            OccurredAt = occurredAt,
            HexQ = hex.Q,
            HexR = hex.R,
            SideAArmyId = sideAArmyId,
            SideASettlementId = sideASettlementId,
            SideBArmyId = sideBArmyId,
            SideBSettlementId = sideBSettlementId,
            Winner = (int)plan.Winner,
            SideAPower = plan.SideAPower,
            SideBPower = plan.SideBPower,
            SideAWasDefending = plan.SideAWasDefending,
            SideBWasDefending = plan.SideBWasDefending,
            Seed = seed,
            LootWood = plan.LootTakenByWinner.Wood,
            LootStone = plan.LootTakenByWinner.Stone,
            LootFood = plan.LootTakenByWinner.Food,
            LootIron = plan.LootTakenByWinner.Iron,
        };

        entity.Lines =
        [
            .. Line(entity.Id, FieldBattleReportSide.SideA, isLoss: true, plan.SideALosses),
            .. Line(entity.Id, FieldBattleReportSide.SideA, isLoss: false, plan.SideASurvivors),
            .. Line(entity.Id, FieldBattleReportSide.SideB, isLoss: true, plan.SideBLosses),
            .. Line(entity.Id, FieldBattleReportSide.SideB, isLoss: false, plan.SideBSurvivors),
        ];

        return entity;
    }

    private static IEnumerable<FieldBattleReportLineEntity> Line(
        Guid reportId, FieldBattleReportSide side, bool isLoss, IReadOnlyList<UnitStack> stacks) =>
        stacks.Select(s => new FieldBattleReportLineEntity
        {
            FieldBattleReportId = reportId,
            Side = side,
            IsLoss = isLoss,
            UnitType = s.Type,
            Count = s.Count,
        });
}

/// <summary>Which side of a <see cref="FieldBattleReportEntity"/> a <see cref="FieldBattleReportLineEntity"/> belongs to.</summary>
public enum FieldBattleReportSide
{
    SideA,
    SideB,
}

/// <summary>
/// One unit type's loss or survivor count on one side of a stored field
/// battle — a single combined table (with <see cref="Side"/>/<see cref="IsLoss"/>
/// discriminator columns) rather than four separate tables, since the two
/// sides are symmetric here (issue #206 has no attacker/defender asymmetry
/// baked into the schema the way <see cref="BattleReportEntity"/> does).
/// </summary>
public class FieldBattleReportLineEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid FieldBattleReportId { get; set; }

    public FieldBattleReportEntity? FieldBattleReport { get; set; }

    public FieldBattleReportSide Side { get; set; }

    public bool IsLoss { get; set; }

    public UnitType UnitType { get; set; }

    public int Count { get; set; }
}
