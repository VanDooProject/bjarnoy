using System.ComponentModel.DataAnnotations.Schema;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Movement = Bjarnoy.Domain.Movement.Movement;

namespace Bjarnoy.Infrastructure.Entities;

/// <summary>
/// An army's stored form (issue #40 phase 2). Mirrors the shape of
/// <see cref="SettlementEntity"/>'s "flat columns plus child collections"
/// pattern.
/// </summary>
/// <remarks>
/// <see cref="AtHome"/> is the on-disk discriminator for
/// <c>ArmyLocation</c>: when true, the movement columns below are cleared and
/// meaningless. An army that actually finishes its journey home is folded
/// into the settlement's <c>Garrison</c> and its row deleted (see
/// <c>ArmyService</c>) rather than ever being read back with
/// <see cref="AtHome"/> true — that column mainly exists so a mid-flight
/// settle that only reaches "standing at destination, not yet turned around"
/// has a well-defined shape to round-trip.
/// </remarks>
public class ArmyEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    /// <summary>
    /// The settlement this army belongs to and returns to — <see cref="Army.SettlementId"/>. <see langword="null"/> for an army
    /// without a home (its beach camp was destroyed and it could reach no other garrison spot of its owner):
    /// <c>docs/design/troop-movement-range.md</c> §2a.
    /// </summary>
    public Guid? SettlementId { get; set; }

    public SettlementEntity? Settlement { get; set; }

    /// <summary>The world the army is in; its own column, so an army without a home still knows it.</summary>
    public Guid WorldId { get; set; }

    public WorldEntity? World { get; set; }

    /// <summary>
    /// The owning player's stable id (<see cref="SettlementEntity.OwnerId"/>); the army's own column, kept when it loses its home. Set
    /// with <see cref="WorldId"/> and <see cref="UserId"/> when the row is made (<see cref="For"/>, <see cref="Sibling"/>).
    /// </summary>
    public string OwnerId { get; set; } = string.Empty;

    /// <summary>The owning account (<see cref="SettlementEntity.UserId"/>); the army's own column, kept when it loses its home.</summary>
    public Guid UserId { get; set; }

    /// <summary>A new row for <paramref name="army"/> of the player who holds <paramref name="owner"/>, with the army's state applied.</summary>
    public static ArmyEntity For(Army army, SettlementEntity owner)
    {
        ArgumentNullException.ThrowIfNull(army);
        ArgumentNullException.ThrowIfNull(owner);
        var entity = new ArmyEntity
        {
            Id = army.Id,
            SettlementId = army.SettlementId,
            WorldId = owner.WorldId,
            OwnerId = owner.OwnerId,
            UserId = owner.UserId,
        };
        entity.ApplyDomain(army);
        return entity;
    }

    /// <summary>A new row for <paramref name="army"/> of the same player as this one (a split, or units leaving it).</summary>
    public ArmyEntity Sibling(Army army)
    {
        ArgumentNullException.ThrowIfNull(army);
        var entity = new ArmyEntity
        {
            Id = army.Id,
            SettlementId = army.SettlementId,
            WorldId = WorldId,
            OwnerId = OwnerId,
            UserId = UserId,
        };
        entity.ApplyDomain(army);
        return entity;
    }

    /// <summary>The key the owner's walls and gates know this army by (<see cref="Services.WorldPalisades.OwnerKeyOf"/>).</summary>
    public Guid WallOwnerKey => Services.WorldPalisades.OwnerKeyOf(UserId, SettlementId ?? Id);

    /// <summary>The hex of the garrison spot of <see cref="SettlementId"/> the army leaves from and returns to — <see cref="Army.HomeSpot"/>.</summary>
    public int HomeSpotQ { get; set; }

    public int HomeSpotR { get; set; }

    public int Mission { get; set; }

    /// <summary>The gathering this army is a group of until it merges or leaves it — <see cref="Army.GatheringId"/>.</summary>
    public Guid? GatheringId { get; set; }

    public GatheringEntity? Gathering { get; set; }

    /// <summary>When that gathering leaves — <see cref="Army.GatherDepartAt"/>; set and cleared together with <see cref="GatheringId"/>.</summary>
    public DateTimeOffset? GatherDepartAt { get; set; }

    /// <summary>
    /// The settlement an <see cref="ArmyMission.Attack"/> army is headed to
    /// fight, or an <see cref="ArmyMission.Support"/> army is headed to (and,
    /// once <see cref="IsSupporting"/>, currently garrisons as a guest — the
    /// destination and the host are the same settlement, so this one column
    /// covers both; see <see cref="ArmyLocation.Supporting"/>). Null for
    /// <see cref="ArmyMission.Move"/>.
    /// </summary>
    public Guid? TargetSettlementId { get; set; }

    /// <summary>
    /// Navigation for <see cref="TargetSettlementId"/> — loaded where a
    /// caller needs the target/host's own hex (e.g. to display a supporting
    /// guest's current position). No <c>OnDelete</c> cascade concern in
    /// practice since settlements are never deleted today; see
    /// <see cref="Settlement"/>'s own FK for the same posture.
    /// </summary>
    public SettlementEntity? TargetSettlement { get; set; }

    /// <summary>
    /// The building coordinate an <see cref="ArmyMission.Attack"/> army was
    /// told to hit (issue #40 phase 5), or the host's garrison spot a <see cref="ArmyMission.Support"/> army joins — see
    /// <see cref="Army.TargetBuildingCoord"/>.
    /// Null (both columns) means "no preference"; the two are always either
    /// both set or both null, never one alone.
    /// </summary>
    public int? TargetBuildingQ { get; set; }

    public int? TargetBuildingR { get; set; }

    /// <summary>
    /// The wildlife camp an <see cref="ArmyMission.Hunt"/> army was sent to fight — see <see cref="Army.TargetCampCoord"/>.
    /// Both columns set or both null.
    /// </summary>
    public int? TargetCampQ { get; set; }

    public int? TargetCampR { get; set; }

    /// <summary>
    /// True when <c>Location</c> is <see cref="ArmyLocation.Supporting"/> — a
    /// guest army standing at <see cref="TargetSettlementId"/> (issue #40
    /// phase 4). Mutually exclusive with <see cref="AtHome"/> and an active
    /// movement; like <see cref="AtHome"/>, the movement columns below are
    /// unused while this is true.
    /// </summary>
    public bool IsSupporting { get; set; }

    public double Provisions { get; set; }

    /// <summary>Loot carried home from a won battle, not yet deposited — see <see cref="Army.Loot"/>.</summary>
    public double LootWood { get; set; }

    public double LootStone { get; set; }

    public double LootFood { get; set; }

    public double LootIron { get; set; }

    public List<ArmyUnitStackEntity> Stacks { get; set; } = [];

    /// <summary>True when <c>Location</c> is <c>ArmyLocation.AtHome</c>; the movement columns below are then unused.</summary>
    public bool AtHome { get; set; } = true;

    /// <summary>Game instant, not wall time.</summary>
    public DateTimeOffset DepartedAt { get; set; }

    public List<HexPoint> Path { get; set; } = [];

    public List<double> CumulativeHours { get; set; } = [];

    /// <summary>Persisted mirror of <see cref="Movement.EdgeHours"/>.</summary>
    public List<double> EdgeHours { get; set; } = [];

    public List<HexPoint> ReturnPath { get; set; } = [];

    public List<double> ReturnCumulativeHours { get; set; } = [];

    /// <summary>Persisted mirror of <see cref="Movement.ReturnEdgeHours"/>.</summary>
    public List<double> ReturnEdgeHours { get; set; } = [];

    public DateTimeOffset TurnAroundAt { get; set; }

    public bool IsReturning { get; set; }

    /// <summary>Persisted mirror of <see cref="Movement.FieldBattleImmuneUntil"/>; <see langword="null"/> unless the army is fleeing a lost field battle.</summary>
    public DateTimeOffset? FieldBattleImmuneUntil { get; set; }

    /// <summary>Persisted mirror of <see cref="Movement.IsStranded"/>: the army cannot get home and starves when its food runs out.</summary>
    public bool IsStranded { get; set; }

    /// <summary>Persisted mirror of <see cref="Movement.RoutePlannedAt"/>; <see langword="null"/> for a row stored before it was recorded.</summary>
    public DateTimeOffset? RoutePlannedAt { get; set; }

    /// <summary>Rebuilds the domain aggregate from the stored columns.</summary>
    public Army ToDomain()
    {
        ArmyLocation location = IsSupporting
            ? new ArmyLocation.Supporting(TargetSettlementId!.Value, new HexCoord(TargetBuildingQ!.Value, TargetBuildingR!.Value))
            : AtHome
                ? new ArmyLocation.AtHome()
                : new ArmyLocation.InTransit(new Movement
                {
                    DepartedAt = DepartedAt,
                    Path = [.. Path.Select(p => new HexCoord(p.Q, p.R))],
                    CumulativeHours = CumulativeHours,
                    EdgeHours = EdgeHours,
                    ReturnPath = [.. ReturnPath.Select(p => new HexCoord(p.Q, p.R))],
                    ReturnCumulativeHours = ReturnCumulativeHours,
                    ReturnEdgeHours = ReturnEdgeHours,
                    TurnAroundAt = TurnAroundAt,
                    IsReturning = IsReturning,
                    FieldBattleImmuneUntil = FieldBattleImmuneUntil,
                    IsStranded = IsStranded,
                    RoutePlannedAt = RoutePlannedAt,
                });

        return new Army
        {
            Id = Id,
            SettlementId = SettlementId,
            HomeSpot = new HexCoord(HomeSpotQ, HomeSpotR),
            Stacks = [.. Stacks.OrderBy(s => s.UnitType).Select(s => new UnitStack(s.UnitType, s.Count))],
            Location = location,
            Provisions = Provisions,
            Mission = (ArmyMission)Mission,
            GatheringId = GatheringId,
            GatherDepartAt = GatherDepartAt,
            TargetSettlementId = TargetSettlementId,
            TargetBuildingCoord = TargetBuildingQ is { } q ? new HexCoord(q, TargetBuildingR!.Value) : null,
            TargetCampCoord = TargetCampQ is { } cq ? new HexCoord(cq, TargetCampR!.Value) : null,
            Loot = new ResourceAmounts(LootWood, LootStone, LootFood, LootIron),
        };
    }

    /// <summary>
    /// Legs this entity finished since it was loaded (replaced route, arrival) that its columns no longer show: the ground
    /// they crossed is saved as explored by <see cref="Bjarnoy.Infrastructure.World.ExploredAreaService.StageWalkedLegsAsync"/>
    /// with the next save. Never persisted itself.
    /// </summary>
    [NotMapped]
    public List<WalkedLeg> WalkedLegs { get; } = [];

    /// <summary>
    /// The leg stored on this entity ran its whole path and the army is about to be removed (folded into a garrison, founded a
    /// settlement, wiped out at its destination), so ApplyDomain never sees the end of it.
    /// </summary>
    public void RecordWalkedToEnd()
    {
        if (IsInTransit && ToDomain().Location is ArmyLocation.InTransit { Movement: var leg })
        {
            WalkedLegs.Add(WalkedLeg.Full(leg));
        }
    }

    // A freshly built entity (dispatch) has no stored leg yet.
    private bool IsInTransit => !AtHome && !IsSupporting && Path.Count > 0;

    /// <summary>Writes a settled aggregate back onto the entity, reconciling the stack collection.</summary>
    public void ApplyDomain(Army army)
    {
        ArgumentNullException.ThrowIfNull(army);

        if (IsInTransit && WalkedLeg.Between(ToDomain(), army) is { } walked)
        {
            WalkedLegs.Add(walked);
        }

        SettlementId = army.SettlementId;
        HomeSpotQ = army.HomeSpot.Q;
        HomeSpotR = army.HomeSpot.R;
        Mission = (int)army.Mission;
        GatheringId = army.GatheringId;
        GatherDepartAt = army.GatherDepartAt;
        TargetSettlementId = army.TargetSettlementId;
        TargetBuildingQ = army.TargetBuildingCoord?.Q;
        TargetBuildingR = army.TargetBuildingCoord?.R;
        TargetCampQ = army.TargetCampCoord?.Q;
        TargetCampR = army.TargetCampCoord?.R;
        Provisions = army.Provisions;
        LootWood = army.Loot.Wood;
        LootStone = army.Loot.Stone;
        LootFood = army.Loot.Food;
        LootIron = army.Loot.Iron;

        var present = army.Stacks.Select(s => s.Type).ToHashSet();
        Stacks.RemoveAll(s => !present.Contains(s.UnitType));
        foreach (var stack in army.Stacks)
        {
            var existing = Stacks.FirstOrDefault(s => s.UnitType == stack.Type);
            if (existing is null)
            {
                Stacks.Add(new ArmyUnitStackEntity { ArmyId = Id, UnitType = stack.Type, Count = stack.Count });
            }
            else
            {
                existing.Count = stack.Count;
            }
        }

        switch (army.Location)
        {
            case ArmyLocation.AtHome:
                AtHome = true;
                IsSupporting = false;
                DepartedAt = default;
                Path = [];
                CumulativeHours = [];
                EdgeHours = [];
                ReturnPath = [];
                ReturnCumulativeHours = [];
                ReturnEdgeHours = [];
                TurnAroundAt = default;
                IsReturning = false;
                FieldBattleImmuneUntil = null;
                IsStranded = false;
                RoutePlannedAt = null;
                break;

            case ArmyLocation.Supporting supporting:
                AtHome = false;
                IsSupporting = true;
                TargetSettlementId = supporting.HostSettlementId;
                TargetBuildingQ = supporting.Spot.Q;
                TargetBuildingR = supporting.Spot.R;
                DepartedAt = default;
                Path = [];
                CumulativeHours = [];
                EdgeHours = [];
                ReturnPath = [];
                ReturnCumulativeHours = [];
                ReturnEdgeHours = [];
                TurnAroundAt = default;
                IsReturning = false;
                FieldBattleImmuneUntil = null;
                IsStranded = false;
                RoutePlannedAt = null;
                break;

            case ArmyLocation.InTransit inTransit:
                var movement = inTransit.Movement;
                AtHome = false;
                IsSupporting = false;
                DepartedAt = movement.DepartedAt;
                Path = [.. movement.Path.Select(c => new HexPoint(c.Q, c.R))];
                CumulativeHours = [.. movement.CumulativeHours];
                EdgeHours = [.. movement.EdgeHours];
                ReturnPath = [.. movement.ReturnPath.Select(c => new HexPoint(c.Q, c.R))];
                ReturnCumulativeHours = [.. movement.ReturnCumulativeHours];
                ReturnEdgeHours = [.. movement.ReturnEdgeHours];
                TurnAroundAt = movement.TurnAroundAt;
                IsReturning = movement.IsReturning;
                FieldBattleImmuneUntil = movement.FieldBattleImmuneUntil;
                IsStranded = movement.IsStranded;
                RoutePlannedAt = movement.RoutePlannedAt;
                break;
        }
    }
}

/// <summary>Some number of one unit type belonging to an army.</summary>
public class ArmyUnitStackEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public Guid ArmyId { get; set; }

    public ArmyEntity? Army { get; set; }

    public UnitType UnitType { get; set; }

    public int Count { get; set; }
}
