using Bjarnoy.Domain.Armies;
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

    public double Provisions { get; set; }

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
        ArmyLocation location = AtHome
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
        };
    }

    /// <summary>Writes a settled aggregate back onto the entity, reconciling the stack collection.</summary>
    public void ApplyDomain(Army army)
    {
        ArgumentNullException.ThrowIfNull(army);

        Mission = (int)army.Mission;
        Provisions = army.Provisions;

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
