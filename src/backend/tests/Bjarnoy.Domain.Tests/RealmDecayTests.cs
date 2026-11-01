using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Buildings outside the realm decay (<c>docs/design/economy.md</c> section 5): no function while outside, a level lost at a steady
/// pace, gone at level 0, never for the longhouse, and a gate or bridge outside the realm open to everyone.
/// The scene: a level-2 longhouse at the origin (reach 3) with a level-2 tower at (3,0) (reach 5), so (5,0) is inside the realm until
/// the tower falls.
/// </summary>
public class RealmDecayTests
{
    private static readonly Guid Id = Guid.Parse("00000000-0000-0000-0000-00000000000a");
    private static readonly DateTimeOffset T0 = DateTimeOffset.UnixEpoch;
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord Far = new(5, 0);

    private static PlacedBuilding Longhouse => new(Centre, BuildingType.Longhouse, 2);

    private static PlacedBuilding Tower => new(new HexCoord(3, 0), BuildingType.Tower, 2);

    private static Settlement Make(IReadOnlyList<PlacedBuilding> buildings, IReadOnlyList<BuildOrder>? queue = null)
    {
        var (production, capacity) = BuildingCatalogue.Totals(buildings, null);
        return new Settlement
        {
            Id = Id,
            Name = "A",
            Centre = Centre,
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(100_000), production, capacity, T0),
            Buildings = buildings,
            Queue = queue ?? [],
        };
    }

    private static ConnectedRealm Realm(Settlement s) => ConnectedRealm.Resolve([s.AsRealmSettlement()]);

    private static TimeSpan Interval(BuildingType type) => BuildingCatalogue.DecayInterval(type);

    /// <summary>A settlement whose tower fell: a lumberjack at <see cref="Far"/> (inside while the tower stood) now sits outside.</summary>
    private static (Settlement Settlement, ConnectedRealm Cut) LumberjackAfterTowerFell(int level = 5)
    {
        var withTower = Make([Longhouse, Tower, new PlacedBuilding(Far, BuildingType.Lumberjack, level)]);
        Assert.True(Realm(withTower).Covers(Far));
        var cut = Make([Longhouse, new PlacedBuilding(Far, BuildingType.Lumberjack, level)]);
        return (cut, Realm(cut));
    }

    // --- timing -----------------------------------------------------------------------------------------------------------------

    [Theory]
    [InlineData(10, 10)]
    [InlineData(30, 30)]
    [InlineData(3, 7)]
    [InlineData(40, 30)]
    [InlineData(7, 7)]
    [InlineData(1, 7)]
    public void Time_to_gone_is_max_level_days_clamped_to_seven_to_thirty(int maxLevel, int expectedDays)
    {
        Assert.Equal(TimeSpan.FromDays(expectedDays), BuildingCatalogue.DecayTimeToGone(maxLevel));
        Assert.Equal(TimeSpan.FromDays(expectedDays) / maxLevel, BuildingCatalogue.DecayInterval(maxLevel));
    }

    [Fact]
    public void One_level_is_lost_every_time_to_gone_divided_by_max_level()
    {
        // 10 levels: 10 days, one a day. 40 levels: clamped to 30 days, one every 18 hours. 3 levels: clamped to 7 days.
        Assert.Equal(TimeSpan.FromDays(1), BuildingCatalogue.DecayInterval(10));
        Assert.Equal(TimeSpan.FromHours(18), BuildingCatalogue.DecayInterval(40));
        Assert.Equal(TimeSpan.FromDays(7.0 / 3), BuildingCatalogue.DecayInterval(3));
    }

    [Theory]
    [InlineData(BuildingType.Tower, 10)]
    [InlineData(BuildingType.Farm, 25)]
    [InlineData(BuildingType.Barracks, 20)]
    [InlineData(BuildingType.OdinStatue, 7)]
    [InlineData(BuildingType.Palisade, 7)]
    [InlineData(BuildingType.Bridge, 7)]
    [InlineData(BuildingType.Longhouse, 30)]
    public void Catalogue_types_take_their_max_level_days_to_go(BuildingType type, int expectedDays)
    {
        Assert.Equal(TimeSpan.FromDays(expectedDays), BuildingCatalogue.DecayTimeToGone(type));
        Assert.Equal(TimeSpan.FromDays(expectedDays) / BuildingCatalogue.MaxLevelFor(type), Interval(type));
    }

    // --- leaving the realm ------------------------------------------------------------------------------------------------------

    [Fact]
    public void A_building_that_left_the_realm_is_marked_and_the_rate_drops_at_once()
    {
        var (cut, realm) = LumberjackAfterTowerFell();
        var before = cut.Resources.RatePerHour.Wood;
        Assert.True(before > 0);

        var (applied, changed) = cut.ApplyRealmState(realm, T0);

        Assert.True(changed);
        var lumberjack = applied.Buildings.Single(b => b.Type == BuildingType.Lumberjack);
        Assert.Equal(T0, lumberjack.OutsideRealmSince);
        Assert.Equal(5, lumberjack.Level);
        Assert.True(applied.Resources.RatePerHour.Wood < before);
        Assert.Equal(applied.CurrentTotals().ProductionPerHour.Wood, applied.Resources.RatePerHour.Wood, 6);
    }

    [Fact]
    public void A_building_inside_the_realm_is_left_alone()
    {
        var s = Make([Longhouse, Tower, new PlacedBuilding(Far, BuildingType.Lumberjack, 5)]);

        var (applied, changed) = s.ApplyRealmState(Realm(s), T0.AddDays(100));

        Assert.False(changed);
        Assert.Same(s, applied);
    }

    [Fact]
    public void A_foundation_outside_the_realm_has_no_level_to_lose_and_is_left_alone()
    {
        var s = Make([Longhouse, new PlacedBuilding(Far, BuildingType.Lumberjack, 0)]);

        var (applied, changed) = s.ApplyRealmState(Realm(s), T0.AddDays(100));

        Assert.False(changed);
        Assert.Equal(0, applied.Buildings.Single(b => b.Type == BuildingType.Lumberjack).Level);
    }

    // --- decay ------------------------------------------------------------------------------------------------------------------

    [Fact]
    public void Levels_are_lost_lazily_by_whole_intervals_without_counting_any_twice()
    {
        var (cut, realm) = LumberjackAfterTowerFell(level: 5);
        var interval = Interval(BuildingType.Lumberjack);
        var (marked, _) = cut.ApplyRealmState(realm, T0);

        // Two and a half intervals later: two levels gone, the half interval is kept.
        var (twice, changed) = marked.ApplyRealmState(realm, T0 + interval * 2.5);
        Assert.True(changed);
        var afterTwo = twice.Buildings.Single(b => b.Type == BuildingType.Lumberjack);
        Assert.Equal(3, afterTwo.Level);
        Assert.Equal(T0 + interval * 2, afterTwo.OutsideRealmSince);

        // The same instant read again: nothing to lose a second time.
        var (again, changedAgain) = twice.ApplyRealmState(realm, T0 + interval * 2.5);
        Assert.False(changedAgain);
        Assert.Same(twice, again);

        // Another half interval: the next level goes, exactly once.
        var (third, _) = twice.ApplyRealmState(realm, T0 + interval * 3);
        Assert.Equal(2, third.Buildings.Single(b => b.Type == BuildingType.Lumberjack).Level);
    }

    [Fact]
    public void Reading_late_gives_the_same_levels_as_reading_step_by_step()
    {
        var (cut, realm) = LumberjackAfterTowerFell(level: 8);
        var interval = Interval(BuildingType.Lumberjack);
        var (marked, _) = cut.ApplyRealmState(realm, T0);

        var late = marked.ApplyRealmState(realm, T0 + interval * 4.2).Settlement;
        var stepped = marked;
        for (var i = 1; i <= 4; i++)
        {
            stepped = stepped.ApplyRealmState(realm, T0 + interval * i).Settlement;
        }

        stepped = stepped.ApplyRealmState(realm, T0 + interval * 4.2).Settlement;

        Assert.Equal(late.Buildings, stepped.Buildings);
    }

    [Fact]
    public void A_building_outside_the_realm_does_not_get_its_levels_back_when_the_realm_reaches_it_again_and_stops_decaying()
    {
        var (cut, cutRealm) = LumberjackAfterTowerFell(level: 5);
        var interval = Interval(BuildingType.Lumberjack);
        var (marked, _) = cut.ApplyRealmState(cutRealm, T0);
        var (decayed, _) = marked.ApplyRealmState(cutRealm, T0 + interval * 2.5);
        Assert.Equal(3, decayed.Buildings.Single(b => b.Type == BuildingType.Lumberjack).Level);

        // The realm reaches (5,0) again: a new tower at (3,0) on the same longhouse.
        var rebuilt = decayed with { Buildings = [.. decayed.Buildings, Tower] };
        var (back, changed) = rebuilt.ApplyRealmState(Realm(rebuilt), T0 + interval * 2.5);

        Assert.True(changed);
        var lumberjack = back.Buildings.Single(b => b.Type == BuildingType.Lumberjack);
        Assert.Equal(3, lumberjack.Level);
        Assert.Null(lumberjack.OutsideRealmSince);
        Assert.True(back.Resources.RatePerHour.Wood > decayed.Resources.RatePerHour.Wood);

        // Much later, still inside: no more loss.
        var (later, laterChanged) = back.ApplyRealmState(Realm(rebuilt), T0 + interval * 100);
        Assert.False(laterChanged);
        Assert.Equal(3, later.Buildings.Single(b => b.Type == BuildingType.Lumberjack).Level);
    }

    [Fact]
    public void Leaving_again_after_a_reconnect_starts_the_clock_over()
    {
        var (cut, cutRealm) = LumberjackAfterTowerFell(level: 5);
        var interval = Interval(BuildingType.Lumberjack);
        var (marked, _) = cut.ApplyRealmState(cutRealm, T0);
        var rebuilt = marked with { Buildings = [.. marked.Buildings, Tower] };
        var (back, _) = rebuilt.ApplyRealmState(Realm(rebuilt), T0 + interval * 0.9);

        // Burnt again, half an interval after the reconnect: the 0.9 intervals from the first time are dropped.
        var burnt = back with { Buildings = [.. back.Buildings.Where(b => b.Type != BuildingType.Tower)] };
        var secondLeave = T0 + interval * 1.0;
        var (marked2, _) = burnt.ApplyRealmState(Realm(burnt), secondLeave);
        var (soon, changed) = marked2.ApplyRealmState(Realm(burnt), secondLeave + interval * 0.9);

        Assert.False(changed);
        Assert.Equal(5, soon.Buildings.Single(b => b.Type == BuildingType.Lumberjack).Level);
        Assert.Equal(secondLeave, soon.Buildings.Single(b => b.Type == BuildingType.Lumberjack).OutsideRealmSince);
    }

    [Fact]
    public void A_building_reaching_level_zero_is_removed_with_its_queued_orders()
    {
        var order = new BuildOrder
        {
            Id = Guid.CreateVersion7(),
            Type = BuildingType.Lumberjack,
            TargetLevel = 3,
            Coord = Far,
            QueuedAt = T0,
            BaseDuration = TimeSpan.FromHours(1),
            StartedAt = T0,
            CompletesAt = T0.AddHours(1),
        };
        var otherOrder = order with { Id = Guid.CreateVersion7(), Coord = new HexCoord(1, 0), Type = BuildingType.Farm, TargetLevel = 1 };
        var s = Make([Longhouse, new PlacedBuilding(Far, BuildingType.Lumberjack, 2)], [order, otherOrder]);
        var realm = Realm(s);
        var interval = Interval(BuildingType.Lumberjack);

        var (marked, _) = s.ApplyRealmState(realm, T0);
        var (gone, changed) = marked.ApplyRealmState(realm, T0 + interval * 2);

        Assert.True(changed);
        Assert.DoesNotContain(gone.Buildings, b => b.Coord == Far);
        Assert.DoesNotContain(gone.Queue, o => o.Coord == Far);
        Assert.Contains(gone.Queue, o => o.Id == otherOrder.Id);
        Assert.Contains(gone.Buildings, b => b.Type == BuildingType.Longhouse);
    }

    [Fact]
    public void The_whole_decay_takes_the_types_time_to_gone()
    {
        var (cut, realm) = LumberjackAfterTowerFell(level: BuildingCatalogue.MaxLevelFor(BuildingType.Lumberjack));
        var gone = BuildingCatalogue.DecayTimeToGone(BuildingType.Lumberjack);
        var (marked, _) = cut.ApplyRealmState(realm, T0);

        var justBefore = marked.ApplyRealmState(realm, T0 + gone - TimeSpan.FromSeconds(1)).Settlement;
        var done = marked.ApplyRealmState(realm, T0 + gone).Settlement;

        Assert.Contains(justBefore.Buildings, b => b.Coord == Far);
        Assert.DoesNotContain(done.Buildings, b => b.Coord == Far);
    }

    [Fact]
    public void A_longhouse_never_decays_whatever_the_realm_is()
    {
        // A realm resolved without this settlement's own longhouse (only some other settlement) still keeps it functioning.
        var s = Make([Longhouse]);
        var foreign = ConnectedRealm.Resolve([new RealmSettlement(Guid.NewGuid(), new HexCoord(50, 0), [new PlacedBuilding(new HexCoord(50, 0), BuildingType.Longhouse, 2)])]);

        var (applied, changed) = s.ApplyRealmState(foreign, T0.AddDays(1000));

        Assert.False(changed);
        Assert.Same(s, applied);
        Assert.False(BuildingCatalogue.Decays(BuildingType.Longhouse));
    }

    // --- no function ------------------------------------------------------------------------------------------------------------

    [Fact]
    public void Production_and_capacity_come_only_from_buildings_inside_the_realm()
    {
        var inside = new PlacedBuilding(new HexCoord(1, 0), BuildingType.Lumberjack, 5);
        var outside = new PlacedBuilding(Far, BuildingType.StorageHouse, 5) with { OutsideRealmSince = T0 };
        var outsideProducer = new PlacedBuilding(new HexCoord(6, 0), BuildingType.Farm, 5) with { OutsideRealmSince = T0 };

        var withAll = BuildingCatalogue.Totals([Longhouse, inside, outside with { OutsideRealmSince = null }, outsideProducer with { OutsideRealmSince = null }], null);
        var gated = BuildingCatalogue.Totals([Longhouse, inside, outside, outsideProducer], null);
        var only = BuildingCatalogue.Totals([Longhouse, inside], null);

        Assert.Equal(only, gated);
        Assert.NotEqual(withAll.Capacity, gated.Capacity);
        Assert.NotEqual(withAll.ProductionPerHour, gated.ProductionPerHour);
    }

    [Fact]
    public void A_mill_outside_the_realm_boosts_nothing()
    {
        var lumberjack = new PlacedBuilding(new HexCoord(1, 0), BuildingType.Lumberjack, 5);
        var sawmill = new PlacedBuilding(new HexCoord(2, 0), BuildingType.Sawmill, 20);

        var boosted = BuildingCatalogue.Totals([Longhouse, lumberjack, sawmill], null).ProductionPerHour.Wood;
        var outside = BuildingCatalogue.Totals([Longhouse, lumberjack, sawmill with { OutsideRealmSince = T0 }], null).ProductionPerHour.Wood;
        var plain = BuildingCatalogue.Totals([Longhouse, lumberjack], null).ProductionPerHour.Wood;

        Assert.True(boosted > plain);
        Assert.Equal(plain, outside);
    }

    [Fact]
    public void A_shrine_and_the_odin_statue_outside_the_realm_give_no_bonus()
    {
        var statue = new PlacedBuilding(Far, BuildingType.OdinStatue, 5);
        var inside = Make([Longhouse, Tower, statue]);
        var outside = Make([Longhouse, Tower, statue with { OutsideRealmSince = T0 }]);

        Assert.True(inside.BuildTimeFactor < 1.0);
        Assert.True(inside.VisionBonusRings > 0);
        Assert.Equal(1.0, outside.BuildTimeFactor);
        Assert.Equal(0, outside.VisionBonusRings);
    }

    [Fact]
    public void Training_is_refused_while_the_training_building_stands_outside_the_realm()
    {
        var barracks = new PlacedBuilding(new HexCoord(1, 0), BuildingType.Barracks, 3);
        var inside = Make([Longhouse, barracks]);
        var outside = Make([Longhouse, barracks with { OutsideRealmSince = T0 }]);

        var ok = inside.PlanTrain(UnitType.Thrall, 1, T0, Guid.CreateVersion7());
        var refused = outside.PlanTrain(UnitType.Thrall, 1, T0, Guid.CreateVersion7());
        var noBarracks = Make([Longhouse]).PlanTrain(UnitType.Thrall, 1, T0, Guid.CreateVersion7());

        Assert.True(ok.Accepted);
        Assert.Equal(TrainRejection.BuildingOutsideRealm, refused.Rejection);
        Assert.Equal(TrainRejection.UnitNotAvailable, noBarracks.Rejection);
    }

    // --- gates, bridges and walls -----------------------------------------------------------------------------------------------

    private static readonly Guid Owner = Guid.Parse("00000000-0000-0000-0000-00000000000a");
    private static readonly Guid Stranger = Guid.Parse("00000000-0000-0000-0000-00000000000b");

    private static Dictionary<HexCoord, Terrain> Strip()
    {
        var terrain = new Dictionary<HexCoord, Terrain>();
        for (var q = 0; q <= 6; q++)
        {
            for (var r = -3; r <= 3; r++)
            {
                terrain[new HexCoord(q, r)] = Terrain.Grass;
            }
        }

        terrain[new HexCoord(3, -4)] = Terrain.Mountain;
        terrain[new HexCoord(3, 4)] = Terrain.Mountain;
        return terrain;
    }

    [Fact]
    public void A_gate_outside_the_realm_is_open_to_a_stranger_and_a_palisade_still_blocks()
    {
        var terrain = Strip();
        Func<HexCoord, Terrain> terrainAt = h => terrain.GetValueOrDefault(h, Terrain.Sea);
        IEnumerable<StandingWall> Column(bool gateOutside) => Enumerable.Range(-3, 7).Select(r =>
            new StandingWall(new HexCoord(3, r), r == 0, Owner, OutsideRealm: r == 0 && gateOutside));

        PalisadeIndex Index(bool gateOutside) => new(Column(gateOutside), terrainAt, _ => false);

        IReadOnlyList<HexCoord>? Route(PalisadeIndex walls, Guid walker)
        {
            var rules = walls.ForOwner(walker)!;
            return HexPathfinder.FindPath(
                new HexCoord(1, 0), new HexCoord(5, 0), terrainAt, true,
                blocked: rules.Blocked, friendlyGate: rules.FriendlyGate, halfOpen: rules.HalfOpen);
        }

        // The stranger is turned away by a working gate, and gets through one that lies outside its owner's realm.
        Assert.Null(Route(Index(gateOutside: false), Stranger));
        Assert.NotNull(Route(Index(gateOutside: true), Stranger));

        // A plain palisade hex outside the realm still blocks (the wall without any gate).
        var wallOnly = new PalisadeIndex(
            Enumerable.Range(-3, 7).Select(r => new StandingWall(new HexCoord(3, r), false, Owner, OutsideRealm: true)),
            terrainAt, _ => false);
        Assert.Null(Route(wallOnly, Stranger));
        Assert.Null(Route(wallOnly, Owner));
    }

    [Fact]
    public void A_guarded_bridge_outside_the_realm_is_open_to_a_stranger()
    {
        var terrain = Strip();
        Func<HexCoord, Terrain> terrainAt = h => terrain.GetValueOrDefault(h, Terrain.Sea);
        Func<HexCoord, bool> isRiver = h => h.Q == 3 && h.R is >= -3 and <= 3;
        var span = new HexCoord(3, 0);

        double? Cost(bool outside) =>
            new BridgeIndex([new StandingBridge(span, BridgeIndex.GuardedLevel, Owner, outside)], terrainAt).CrossingCost(span, Stranger);

        Assert.Null(Cost(outside: false));
        Assert.NotNull(Cost(outside: true));
    }
}
