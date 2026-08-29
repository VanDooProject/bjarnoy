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

    public Guid SettlementId { get; set; }

    public SettlementEntity? Settlement { get; set; }

    public int Mission { get; set; }

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
    /// told to hit (issue #40 phase 5) — see <see cref="Army.TargetBuildingCoord"/>.
    /// Null (both columns) means "no preference"; the two are always either
    /// both set or both null, never one alone.
    /// </summary>
    public int? TargetBuildingQ { get; set; }

    public int? TargetBuildingR { get; set; }

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

    public List<HexPoint> ReturnPath { get; set; } = [];

    public List<double> ReturnCumulativeHours { get; set; } = [];

    public DateTimeOffset TurnAroundAt { get; set; }

    public bool IsReturning { get; set; }

    /// <summary>Rebuilds the domain aggregate from the stored columns.</summary>
    public Army ToDomain()
    {
        ArmyLocation location = IsSupporting
            ? new ArmyLocation.Supporting(TargetSettlementId!.Value)
            : AtHome
                ? new ArmyLocation.AtHome()
                : new ArmyLocation.InTransit(new Movement
                {
                    DepartedAt = DepartedAt,
                    Path = [.. Path.Select(p => new HexCoord(p.Q, p.R))],
                    CumulativeHours = CumulativeHours,
                    ReturnPath = [.. ReturnPath.Select(p => new HexCoord(p.Q, p.R))],
                    ReturnCumulativeHours = ReturnCumulativeHours,
                    TurnAroundAt = TurnAroundAt,
                    IsReturning = IsReturning,
                });

        return new Army
        {
            Id = Id,
            SettlementId = SettlementId,
            Stacks = [.. Stacks.OrderBy(s => s.UnitType).Select(s => new UnitStack(s.UnitType, s.Count))],
            Location = location,
            Provisions = Provisions,
            Mission = (ArmyMission)Mission,
            TargetSettlementId = TargetSettlementId,
            TargetBuildingCoord = TargetBuildingQ is { } q ? new HexCoord(q, TargetBuildingR!.Value) : null,
            Loot = new ResourceAmounts(LootWood, LootStone, LootFood, LootIron),
        };
    }

    /// <summary>Writes a settled aggregate back onto the entity, reconciling the stack collection.</summary>
    public void ApplyDomain(Army army)
    {
        ArgumentNullException.ThrowIfNull(army);

        Mission = (int)army.Mission;
        TargetSettlementId = army.TargetSettlementId;
        TargetBuildingQ = army.TargetBuildingCoord?.Q;
        TargetBuildingR = army.TargetBuildingCoord?.R;
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
                ReturnPath = [];
                ReturnCumulativeHours = [];
                TurnAroundAt = default;
                IsReturning = false;
                break;

            case ArmyLocation.Supporting supporting:
                AtHome = false;
                IsSupporting = true;
                TargetSettlementId = supporting.HostSettlementId;
                DepartedAt = default;
                Path = [];
                CumulativeHours = [];
                ReturnPath = [];
                ReturnCumulativeHours = [];
                TurnAroundAt = default;
                IsReturning = false;
                break;

            case ArmyLocation.InTransit inTransit:
                var movement = inTransit.Movement;
                AtHome = false;
                IsSupporting = false;
                DepartedAt = movement.DepartedAt;
                Path = [.. movement.Path.Select(c => new HexPoint(c.Q, c.R))];
                CumulativeHours = [.. movement.CumulativeHours];
                ReturnPath = [.. movement.ReturnPath.Select(c => new HexPoint(c.Q, c.R))];
                ReturnCumulativeHours = [.. movement.ReturnCumulativeHours];
                TurnAroundAt = movement.TurnAroundAt;
                IsReturning = movement.IsReturning;
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
