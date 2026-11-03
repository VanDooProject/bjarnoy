using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Training is tied to a building: one slot per building, speed by level, the three split modes and cancellation.</summary>
public class TrainingPerBuildingTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord A = new(1, 0);
    private static readonly HexCoord B = new(2, 0);
    private static readonly HexCoord C = new(3, 0);

    private static Settlement Found(params PlacedBuilding[] buildings) => FoundWith(10_000_000, buildings);

    private static Settlement FoundWith(double stock, params PlacedBuilding[] buildings)
    {
        var all = new List<PlacedBuilding> { new(Centre, BuildingType.Longhouse, 1) };
        all.AddRange(buildings);
        var (production, _) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = all,
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(stock), production, ResourceAmounts.Uniform(100_000_000), T0),
        };
    }

    private static PlacedBuilding Barracks(HexCoord at, int level) => new(at, BuildingType.Barracks, level);

    private static TrainDecision Plan(
        Settlement s, int count, HexCoord at, TrainingSplit split = TrainingSplit.Here, bool premium = false,
        UnitType type = UnitType.Thrall, DateTimeOffset? now = null, double speed = 1.0) =>
        s.PlanTrain(type, count, now ?? T0, Guid.CreateVersion7, at, split, premium, speedFactor: speed);

    private static Settlement Train(Settlement s, int count, HexCoord at, TrainingSplit split = TrainingSplit.Here, bool premium = false)
    {
        var decision = Plan(s, count, at, split, premium);
        Assert.True(decision.Accepted, $"expected accept, got {decision.Rejection}");
        return s.EnqueueTraining(decision.Orders, T0);
    }

    // --- speed by level ----------------------------------------------------------------------------------------------------------

    [Theory]
    [InlineData(0, 1.0)]
    [InlineData(1, 0.99)]
    [InlineData(10, 0.9)]
    [InlineData(20, 0.8)]
    public void Each_building_level_saves_one_percent_of_the_training_time(int level, double expected) =>
        Assert.Equal(expected, UnitCatalogue.TrainingTimeFactor(level), 9);

    [Fact]
    public void A_part_trains_at_the_catalogue_time_scaled_by_the_buildings_level_and_the_world_speed()
    {
        var s = Found(Barracks(A, 10));

        var part = Assert.Single(Plan(s, 3, A, speed: 2.0).Orders);

        var catalogue = UnitCatalogue.Get(UnitType.Thrall).TrainingDuration;
        Assert.Equal(catalogue.Ticks * 0.9 / 2.0, part.PerUnitDuration.Ticks, 1.0);
        Assert.Equal(A, part.BuildingCoord);
    }

    [Fact]
    public void The_siege_workshop_reaches_level_twenty()
    {
        Assert.Equal(20, BuildingCatalogue.MaxLevelFor(BuildingType.SiegeWorkshop));
        Assert.NotNull(BuildingCatalogue.TryGet(BuildingType.SiegeWorkshop, 20));
    }

    // --- one slot per building ---------------------------------------------------------------------------------------------------

    [Fact]
    public void Parts_in_one_building_train_one_after_another_and_other_buildings_in_parallel()
    {
        var s = Found(Barracks(A, 1), Barracks(B, 1));
        s = Train(s, 3, A);

        var sameBuilding = Assert.Single(Plan(s, 2, A).Orders);
        var otherBuilding = Assert.Single(Plan(s, 2, B).Orders);

        Assert.Equal(s.TrainingQueue.Single().CompletesAt, sameBuilding.StartedAt);
        Assert.Equal(T0, otherBuilding.StartedAt);
    }

    [Fact]
    public void A_queued_part_still_completes_and_lands_in_the_garrison_once_its_turn_is_done()
    {
        var s = Train(Train(Found(Barracks(A, 1)), 1, A), 1, A);
        var last = s.TrainingQueue.Max(o => o.CompletesAt);

        var settled = s.SettleTo(last).Settlement;

        Assert.Empty(settled.TrainingQueue);
        Assert.Equal(2, settled.Garrison.Single(g => g.Type == UnitType.Thrall).Count);
    }

    [Fact]
    public void A_building_takes_at_most_five_parts_per_building()
    {
        var s = Found(Barracks(A, 1), Barracks(B, 1));
        for (var i = 0; i < Settlement.MaxTrainingPartsPerBuilding; i++)
        {
            s = Train(s, 1, A);
        }

        Assert.Equal(TrainRejection.TrainingQueueFull, Plan(s, 1, A).Rejection);
        Assert.True(Plan(s, 1, B).Accepted);
    }

    [Fact]
    public void Evenly_skips_full_buildings_and_is_full_only_when_all_are()
    {
        var s = Found(Barracks(A, 1), Barracks(B, 1));
        for (var i = 0; i < Settlement.MaxTrainingPartsPerBuilding; i++)
        {
            s = Train(s, 1, A);
        }

        var onlyB = Assert.Single(Plan(s, 4, A, TrainingSplit.Evenly).Orders);
        Assert.Equal((B, 4), (onlyB.BuildingCoord, onlyB.Count));

        for (var i = 0; i < Settlement.MaxTrainingPartsPerBuilding; i++)
        {
            s = Train(s, 1, B);
        }

        Assert.Equal(TrainRejection.TrainingQueueFull, Plan(s, 4, A, TrainingSplit.Evenly).Rejection);
    }

    // --- which building ----------------------------------------------------------------------------------------------------------

    [Fact]
    public void A_hex_without_a_building_of_the_units_type_is_refused()
    {
        var s = Found(Barracks(A, 1), new PlacedBuilding(B, BuildingType.Lumberjack, 1));

        Assert.Equal(TrainRejection.WrongBuilding, Plan(s, 1, C).Rejection);
        Assert.Equal(TrainRejection.WrongBuilding, Plan(s, 1, B).Rejection);
        Assert.Equal(TrainRejection.WrongBuilding, Plan(s, 1, Centre, TrainingSplit.Evenly).Rejection);
    }

    [Fact]
    public void Here_is_refused_while_that_building_stands_outside_the_realm_even_if_a_sibling_works()
    {
        var s = Found(Barracks(A, 1) with { OutsideRealmSince = T0 }, Barracks(B, 1));

        Assert.Equal(TrainRejection.BuildingOutsideRealm, Plan(s, 1, A).Rejection);
        Assert.True(Plan(s, 1, B).Accepted);
    }

    [Fact]
    public void Evenly_and_fastest_leave_out_buildings_outside_the_realm_and_foundations()
    {
        var s = Found(Barracks(A, 1) with { OutsideRealmSince = T0 }, Barracks(B, 2), Barracks(C, 0));

        Assert.Equal(B, Assert.Single(Plan(s, 5, A, TrainingSplit.Evenly).Orders).BuildingCoord);
        Assert.Equal(B, Assert.Single(Plan(s, 5, A, TrainingSplit.Fastest, premium: true).Orders).BuildingCoord);
    }

    // --- evenly ------------------------------------------------------------------------------------------------------------------

    [Theory]
    [InlineData(10, new[] { 4, 3, 3 })]
    [InlineData(11, new[] { 4, 4, 3 })]
    [InlineData(2, new[] { 1, 1, 0 })]
    [InlineData(1, new[] { 1, 0, 0 })]
    [InlineData(9, new[] { 3, 3, 3 })]
    public void Evenly_divides_the_count_and_gives_the_remainder_to_the_highest_levels(int count, int[] expectedByLevelDescending)
    {
        var s = Found(Barracks(A, 2), Barracks(B, 7), Barracks(C, 4));
        var byLevelDescending = new[] { B, C, A };

        var orders = Plan(s, count, A, TrainingSplit.Evenly).Orders;

        Assert.Equal(count, orders.Sum(o => o.Count));
        for (var i = 0; i < byLevelDescending.Length; i++)
        {
            Assert.Equal(expectedByLevelDescending[i], orders.SingleOrDefault(o => o.BuildingCoord == byLevelDescending[i])?.Count ?? 0);
        }
    }

    [Fact]
    public void An_order_is_charged_once_for_all_its_parts()
    {
        var s = Found(Barracks(A, 2), Barracks(B, 7), Barracks(C, 4));
        var cost = UnitCatalogue.Get(UnitType.Thrall).TrainingCost * 10;

        var queued = Train(s, 10, A, TrainingSplit.Evenly);

        Assert.Equal(3, queued.TrainingQueue.Count);
        Assert.Equal(s.Resources.At(T0).Wood - cost.Wood, queued.Resources.At(T0).Wood, 6);
    }

    // --- fastest -----------------------------------------------------------------------------------------------------------------

    [Fact]
    public void Fastest_needs_premium()
    {
        var s = Found(Barracks(A, 1), Barracks(B, 1));

        Assert.Equal(TrainRejection.PremiumRequired, Plan(s, 4, A, TrainingSplit.Fastest).Rejection);
        Assert.True(Plan(s, 4, A, TrainingSplit.Fastest, premium: true).Accepted);
    }

    [Fact]
    public void Fastest_sends_the_work_away_from_a_busy_building()
    {
        var s = Found(Barracks(A, 1), Barracks(B, 1));
        s = Train(s, 5, A);

        var orders = Plan(s, 4, A, TrainingSplit.Fastest, premium: true).Orders;

        var only = Assert.Single(orders);
        Assert.Equal((B, 4), (only.BuildingCoord, only.Count));
    }

    [Fact]
    public void Fastest_gives_a_higher_level_building_more_units()
    {
        var s = Found(Barracks(A, 1), Barracks(B, 20));

        var orders = Plan(s, 30, A, TrainingSplit.Fastest, premium: true).Orders;

        Assert.Equal(30, orders.Sum(o => o.Count));
        Assert.True(orders.Single(o => o.BuildingCoord == B).Count > orders.Single(o => o.BuildingCoord == A).Count);
    }

    [Fact]
    public void Fastest_matches_a_unit_by_unit_greedy_for_random_cases()
    {
        var random = new Random(504);
        var coords = new[] { A, B, C, new HexCoord(4, 0) };
        for (var round = 0; round < 300; round++)
        {
            var n = random.Next(1, coords.Length + 1);
            var buildings = Enumerable.Range(0, n).Select(i => Barracks(coords[i], random.Next(1, 21))).ToList();
            var s = Found([.. buildings]);
            foreach (var b in buildings)
            {
                for (var part = random.Next(0, 4); part > 0; part--)
                {
                    s = s with
                    {
                        TrainingQueue =
                        [
                            .. s.TrainingQueue,
                            new TrainingOrder
                            {
                                Id = Guid.CreateVersion7(),
                                BuildingCoord = b.Coord,
                                UnitType = UnitType.Thrall,
                                Count = random.Next(1, 6),
                                StartedAt = s.TrainingQueue.Where(o => o.BuildingCoord == b.Coord).Select(o => o.CompletesAt).Append(T0).Max(),
                                PerUnitDuration = UnitCatalogue.TrainingTime(UnitType.Thrall, b.Level),
                            },
                        ],
                    };
                }
            }

            var count = random.Next(1, 41);
            var decision = Plan(s, count, coords[0], TrainingSplit.Fastest, premium: true);

            Assert.True(decision.Accepted);
            var expected = NaiveGreedy(s, buildings, count);
            var actual = decision.Orders.ToDictionary(o => o.BuildingCoord, o => o.Count);
            Assert.True(
                expected.OrderBy(kv => kv.Key.Q).SequenceEqual(actual.OrderBy(kv => kv.Key.Q)),
                $"round {round}: expected {string.Join(",", expected)} got {string.Join(",", actual)}");
        }
    }

    /// <summary>Gives each unit in turn to the building where it would finish first (ties: higher level, then hex).</summary>
    private static Dictionary<HexCoord, int> NaiveGreedy(Settlement s, List<PlacedBuilding> buildings, int count)
    {
        var given = buildings.ToDictionary(b => b.Coord, _ => 0);
        for (var unit = 0; unit < count; unit++)
        {
            var best = buildings
                .OrderBy(b => FinishOfNext(s, b, given[b.Coord]))
                .ThenByDescending(b => b.Level)
                .ThenBy(b => b.Coord.Q)
                .ThenBy(b => b.Coord.R)
                .First();
            given[best.Coord]++;
        }

        return given.Where(kv => kv.Value > 0).ToDictionary(kv => kv.Key, kv => kv.Value);
    }

    private static DateTimeOffset FinishOfNext(Settlement s, PlacedBuilding b, int alreadyGiven)
    {
        var start = s.TrainingQueue.Where(o => o.BuildingCoord == b.Coord).Select(o => o.CompletesAt).Append(T0).Max();
        return start + (UnitCatalogue.TrainingTime(UnitType.Thrall, b.Level) * (alreadyGiven + 1));
    }

    // --- cancel and refund -------------------------------------------------------------------------------------------------------

    [Fact]
    public void Removing_a_building_cancels_its_parts_with_a_full_refund_and_leaves_other_buildings_training()
    {
        var s = Train(Train(FoundWith(700, Barracks(A, 1), Barracks(B, 1)), 3, A), 2, B);
        var spent = s.Resources.At(T0).Wood;
        var refund = UnitCatalogue.Get(UnitType.Thrall).TrainingCost * 3;

        var razed = s.RazeBuilding(A, T0).Settlement!;

        Assert.Equal(B, Assert.Single(razed.TrainingQueue).BuildingCoord);
        Assert.Equal(spent + refund.Wood, razed.Resources.At(T0).Wood, 6);
    }

    [Fact]
    public void A_building_destroyed_by_siege_loses_its_parts_but_one_that_only_loses_a_level_keeps_them()
    {
        var s = Train(FoundWith(700, Barracks(A, 3)), 3, A);
        var spent = s.Resources.At(T0).Wood;
        var refund = UnitCatalogue.Get(UnitType.Thrall).TrainingCost * 3;

        var damaged = s.WithSiegeDamage([s.Buildings[0], Barracks(A, 2)], A, T0);
        var destroyed = s.WithSiegeDamage([s.Buildings[0]], A, T0);

        Assert.Single(damaged.TrainingQueue);
        Assert.Empty(destroyed.TrainingQueue);
        Assert.Equal(spent + refund.Wood, destroyed.Resources.At(T0).Wood, 6);
    }

    [Fact]
    public void Replacing_the_building_on_a_hex_cancels_its_parts()
    {
        var s = Train(Found(Barracks(A, 2)), 3, A);

        var replaced = s.PlaceBuilding(A, BuildingType.ArcheryRange, 1, Terrain.Grass, isCoastalWater: false, T0);

        Assert.True(replaced.Accepted, replaced.Rejection.ToString());
        Assert.Empty(replaced.Settlement!.TrainingQueue);
    }
}
