using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// <see cref="Army.ForceFieldRetreat"/>: the forced march home after a lost field battle or a camp ambush.
/// The scene is a strip of grass (q 0..8, r -3..3); the army set out from home at the west end and was caught further east.
/// </summary>
public sealed class ArmyFieldRetreatTests
{
    internal static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    internal static readonly HexCoord Home = new(0, 0);
    internal static readonly HexCoord Far = new(8, 0);

    internal static Terrain Strip(HexCoord c) =>
        c.Q is >= 0 and <= 8 && c.R is >= -3 and <= 3 ? Terrain.Grass : Terrain.Sea;

    /// <summary>A land army out on a Move from <see cref="Home"/> to <see cref="Far"/>, with the given provisions at departure (<see cref="T0"/>).</summary>
    internal static Army Marching(double provisions, int spearmen = 10)
    {
        var path = HexPathfinder.FindPath(Home, Far, Strip, isLandUnit: true)!;
        var hours = HexPathfinder.CumulativeHours(path, Strip, UnitCatalogue.Get(UnitType.Spearman).Speed, isLandUnit: true);
        var edge = HexPathfinder.EdgeHours(path, Strip, UnitCatalogue.Get(UnitType.Spearman).Speed, isLandUnit: true);
        var upkeep = UnitCatalogue.Get(UnitType.Spearman).UpkeepPerHour * spearmen;
        var movement = Bjarnoy.Domain.Movement.Movement.Create(T0, path, hours, edge, path, hours, edge, provisions, upkeep);
        return new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = Guid.CreateVersion7(),
            HomeSpot = Home,
            Stacks = [new UnitStack(UnitType.Spearman, spearmen)],
            Location = new ArmyLocation.InTransit(movement),
            Provisions = provisions,
            Mission = ArmyMission.Move,
        };
    }

    internal static Bjarnoy.Domain.Movement.Movement MovementOf(Army army) => ((ArmyLocation.InTransit)army.Location).Movement;

    [Fact]
    public void A_forced_retreat_keeps_the_provisions_the_army_carried_at_the_battle()
    {
        var army = Marching(provisions: 200);
        var battleAt = T0.AddHours(6);
        var carried = army.ProvisionsAt(battleAt);
        Assert.True(carried < 200 && carried > 0);

        var retreating = army.ForceFieldRetreat(battleAt, new HexCoord(4, 0), Home, Strip);

        Assert.Equal(battleAt, MovementOf(retreating).DepartedAt);
        Assert.Equal(carried, retreating.ProvisionsAt(battleAt), 6);
        Assert.Equal(carried, retreating.Provisions, 6);
    }

    [Fact]
    public void A_forced_retreat_after_losses_burns_the_old_upkeep_up_to_the_battle()
    {
        var army = Marching(provisions: 200);
        var battleAt = T0.AddHours(6);
        var carried = army.ProvisionsAt(battleAt);
        var survivors = army with { Stacks = [new UnitStack(UnitType.Spearman, 4)] };

        var retreating = survivors.ForceFieldRetreat(battleAt, new HexCoord(4, 0), Home, Strip, provisionsAtBattle: carried);

        Assert.Equal(carried, retreating.ProvisionsAt(battleAt), 6);
    }

    [Fact]
    public void A_forced_retreat_walks_around_the_owners_walls()
    {
        var owner = Guid.CreateVersion7();
        var wall = Enumerable.Range(-3, 6).Select(r => new StandingWall(new HexCoord(2, r), false, owner));
        var rules = new PalisadeIndex(wall, Strip, _ => false).ForOwner(owner);
        var army = Marching(provisions: 200);
        var at = T0.AddHours(6);
        var from = new HexCoord(4, 0);

        var plain = MovementOf(army.ForceFieldRetreat(at, from, Home, Strip));
        var walled = MovementOf(army.ForceFieldRetreat(at, from, Home, Strip, walls: rules));

        Assert.Contains(plain.Path, h => h.Q == 2 && h.R == 0);
        Assert.DoesNotContain(walled.Path, h => h.Q == 2 && h.R < 3);
        Assert.Equal(Home, walled.Path[^1]);
    }
}
