using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class QuestTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);

    private static Settlement Found(
        int longhouse = 1,
        IEnumerable<BuildingType>? others = null,
        double stock = 100,
        double capacity = 1_000,
        int claimed = 0,
        IReadOnlyList<BuildOrder>? queue = null)
    {
        var placed = (others ?? []).Select((t, i) => new PlacedBuilding(new HexCoord(i + 1, 0), t, 1));
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, longhouse), .. placed],
            Queue = queue ?? [],
            ClaimedQuests = claimed,
            Resources = ResourcePool.Create(
                ResourceAmounts.Uniform(stock), ResourceAmounts.Zero, ResourceAmounts.Uniform(capacity), T0),
        };
    }

    private static IEnumerable<BuildingType> Producers(int n) =>
        Enumerable.Range(0, n).Select(i => new[]
        {
            BuildingType.Lumberjack, BuildingType.Quarry, BuildingType.Farm,
            BuildingType.ClayBrickworks, BuildingType.PumpkinFarm, BuildingType.FishingHut,
        }[i % 6]);

    [Fact]
    public void The_quests_come_in_the_tutorial_order_with_their_rewards()
    {
        Assert.Equal(
            ["producers3", "longhouse2", "storagehouse1", "producers6", "longhouse3", "register", "tower3", "longhouse5", "spearmen5", "hunt1"],
            Quests.All.Select(q => q.Id));
        Assert.Equal(new ResourceAmounts(150, 120, 80, 0), Quests.Find("producers3")!.Reward);
        Assert.Equal(new ResourceAmounts(250, 200, 150, 0), Quests.Find("longhouse2")!.Reward);
        Assert.Equal(new ResourceAmounts(200, 200, 200, 0), Quests.Find("storagehouse1")!.Reward);
        Assert.Equal(new ResourceAmounts(200, 150, 100, 0), Quests.Find("producers6")!.Reward);
        Assert.Equal(new ResourceAmounts(400, 300, 200, 0), Quests.Find("longhouse3")!.Reward);
        Assert.Equal(new ResourceAmounts(400, 300, 200, 0), Quests.Find("tower3")!.Reward);
        Assert.Equal(8, Quests.Find("tower3")!.Bit);
        Assert.Equal(new ResourceAmounts(800, 600, 400, 0), Quests.Find("longhouse5")!.Reward);
        Assert.Equal(new ResourceAmounts(500, 400, 300, 0), Quests.Find("spearmen5")!.Reward);
        Assert.Equal(6, Quests.Find("spearmen5")!.Bit);
        Assert.Equal(new ResourceAmounts(400, 300, 300, 0), Quests.Find("hunt1")!.Reward);
        Assert.Equal(7, Quests.Find("hunt1")!.Bit);
        Assert.Equal(Quests.All.Count, Quests.All.Select(q => q.Bit).Distinct().Count());
    }

    [Theory]
    [InlineData(BuildingType.Lumberjack)]
    [InlineData(BuildingType.Quarry)]
    [InlineData(BuildingType.ClayBrickworks)]
    [InlineData(BuildingType.Farm)]
    [InlineData(BuildingType.PumpkinFarm)]
    [InlineData(BuildingType.FishingHut)]
    public void Resource_producers_count(BuildingType type) => Assert.True(Quests.IsProducer(type));

    [Theory]
    [InlineData(BuildingType.Longhouse)]
    [InlineData(BuildingType.StorageHouse)]
    [InlineData(BuildingType.Tower)]
    [InlineData(BuildingType.TownSquare)]
    [InlineData(BuildingType.Sawmill)]
    [InlineData(BuildingType.MagicTower)]
    public void Everything_else_does_not_count_as_a_producer(BuildingType type) => Assert.False(Quests.IsProducer(type));

    [Fact]
    public void Producer_quests_need_three_and_six_standing_producers()
    {
        var q3 = Quests.Find("producers3")!;
        var q6 = Quests.Find("producers6")!;

        Assert.False(q3.IsCompleted(Found(others: Producers(2))));
        Assert.True(q3.IsCompleted(Found(others: Producers(3))));
        Assert.False(q6.IsCompleted(Found(others: Producers(5))));
        Assert.True(q6.IsCompleted(Found(others: Producers(6))));
    }

    [Fact]
    public void A_queued_building_does_not_count_until_it_stands()
    {
        var order = new BuildOrder
        {
            Id = Guid.CreateVersion7(),
            Coord = new HexCoord(9, 0),
            Type = BuildingType.Lumberjack,
            TargetLevel = 1,
            QueuedAt = T0,
            StartedAt = T0,
            CompletesAt = T0.AddMinutes(3),
            BaseDuration = TimeSpan.FromMinutes(3),
        };

        var s = Found(others: Producers(2), queue: [order]);

        Assert.False(Quests.Find("producers3")!.IsCompleted(s));
    }

    [Theory]
    [InlineData("longhouse2", 1, false)]
    [InlineData("longhouse2", 2, true)]
    [InlineData("longhouse3", 2, false)]
    [InlineData("longhouse3", 3, true)]
    [InlineData("longhouse5", 4, false)]
    [InlineData("longhouse5", 7, true)]
    public void Longhouse_quests_follow_the_longhouse_level(string id, int level, bool done) =>
        Assert.Equal(done, Quests.Find(id)!.IsCompleted(Found(longhouse: level)));

    private static Settlement WithTower(int level) =>
        Found() with { Buildings = [.. Found().Buildings, new PlacedBuilding(new HexCoord(2, 0), BuildingType.Tower, level)] };

    [Theory]
    [InlineData(-1, false)]
    [InlineData(2, false)]
    [InlineData(3, true)]
    [InlineData(4, true)]
    public void The_tower_quest_needs_a_tower_at_level_3(int level, bool done)
    {
        var s = level < 0 ? Found() : WithTower(level);
        Assert.Equal(done, Quests.Find("tower3")!.IsCompleted(s));
    }

    [Fact]
    public void The_tower_quest_uses_the_highest_of_several_towers()
    {
        var s = Found() with
        {
            Buildings =
            [
                .. Found().Buildings,
                new PlacedBuilding(new HexCoord(2, 0), BuildingType.Tower, 1),
                new PlacedBuilding(new HexCoord(3, 0), BuildingType.Tower, 3),
            ],
        };
        Assert.True(Quests.Find("tower3")!.IsCompleted(s));
        Assert.Equal(3, Quests.Find("tower3")!.Progress!(s).Current);
    }

    [Fact]
    public void The_tower_quest_pays_on_bit_8()
    {
        var s = WithTower(3);
        var decision = s.PlanClaimQuest("tower3");

        Assert.True(decision.Accepted);
        var claimed = s.ClaimQuest(decision.Quest!, T0);

        Assert.Equal(1 << 8, claimed.ClaimedQuests);
        Assert.Equal(500, claimed.Resources.At(T0).Wood, 6);
        Assert.Equal(400, claimed.Resources.At(T0).Stone, 6);
        Assert.Equal(300, claimed.Resources.At(T0).Food, 6);
        Assert.Equal(QuestRejection.AlreadyClaimed, claimed.PlanClaimQuest("tower3").Rejection);
    }

    [Fact]
    public void Quests_report_counted_progress_clamped_to_the_target()
    {
        static (int, int)? P(string id, Settlement s) =>
            Quests.Find(id)!.Progress?.Invoke(s) is { } p ? (p.Current, p.Target) : null;

        Assert.Equal((2, 3), P("producers3", Found(others: Producers(2))));
        Assert.Equal((3, 3), P("producers3", Found(others: Producers(5))));
        Assert.Equal((5, 6), P("producers6", Found(others: Producers(5))));
        Assert.Equal((6, 6), P("producers6", Found(others: Producers(8))));
        Assert.Equal((1, 2), P("longhouse2", Found(longhouse: 1)));
        Assert.Equal((2, 3), P("longhouse3", Found(longhouse: 2)));
        Assert.Equal((5, 5), P("longhouse5", Found(longhouse: 7)));
        Assert.Equal((4, 5), P("longhouse5", Found(longhouse: 4)));
        Assert.Equal((0, 3), P("tower3", Found()));
        Assert.Equal((2, 3), P("tower3", WithTower(2)));
        Assert.Equal((3, 3), P("tower3", WithTower(5)));
        Assert.Null(P("hunt1", Found()));
        Assert.Null(P("storagehouse1", Found()));
    }

    [Fact]
    public void Spearmen_progress_counts_fighting_units_and_reports_the_target_once_trained()
    {
        static (int, int) P(Settlement s) { var p = Quests.Find("spearmen5")!.Progress!(s); return (p.Current, p.Target); }

        Assert.Equal((0, 5), P(Found()));
        Assert.Equal((3, 5), P(Found().WithGarrison([new UnitStack(UnitType.Spearman, 3), new UnitStack(UnitType.Thrall, 9)])));
        Assert.Equal((5, 5), P(Found().WithGarrison([new UnitStack(UnitType.Spearman, 9)])));
        Assert.Equal((5, 5), P(Found() with { TroopsTrained = true }));
    }

    [Fact]
    public void The_storage_house_quest_needs_a_standing_storage_house()
    {
        var q = Quests.Find("storagehouse1")!;

        Assert.False(q.IsCompleted(Found(others: [BuildingType.Farm])));
        Assert.True(q.IsCompleted(Found(others: [BuildingType.StorageHouse])));
    }

    [Fact]
    public void The_spearmen_quest_counts_fighting_land_units_only()
    {
        var q = Quests.Find("spearmen5")!;
        var home = Found();

        Assert.False(q.IsCompleted(home));
        Assert.False(q.IsCompleted(home.WithGarrison([new UnitStack(UnitType.Spearman, 4)])));
        Assert.True(q.IsCompleted(home.WithGarrison([new UnitStack(UnitType.Spearman, 5)])));
        Assert.True(q.IsCompleted(home.WithGarrison([new UnitStack(UnitType.Axeman, 2), new UnitStack(UnitType.Spearman, 3)])));
        Assert.False(q.IsCompleted(home.WithGarrison([new UnitStack(UnitType.Spearman, 2), new UnitStack(UnitType.Thrall, 10), new UnitStack(UnitType.Karve, 3)])));
    }

    [Fact]
    public void The_spearmen_quest_stays_completed_once_the_troops_were_trained()
    {
        var q = Quests.Find("spearmen5")!;
        var trained = Found().WithGarrison([new UnitStack(UnitType.Axeman, 5)]);
        var latched = trained.SettleTo(T0).Settlement;

        Assert.True(latched.TroopsTrained);
        Assert.False(Found().SettleTo(T0).Settlement.TroopsTrained);

        var gone = latched.WithGarrison([new UnitStack(UnitType.Axeman, 1)]);
        Assert.True(q.IsCompleted(gone));
        Assert.True(gone.SettleTo(T0).Settlement.TroopsTrained);
        Assert.False(q.IsCompleted(Found().WithGarrison([new UnitStack(UnitType.Axeman, 4)])));
    }

    [Fact]
    public void Settling_reports_a_change_when_only_the_troops_latch_flips()
    {
        var result = (Found().WithGarrison([new UnitStack(UnitType.Spearman, 6)])).SettleTo(T0);

        Assert.True(result.Changed);
        Assert.True(result.Settlement.TroopsTrained);
        Assert.False(result.Settlement.SettleTo(T0).Changed);
    }

    [Fact]
    public void The_hunt_quest_needs_trained_troops_and_a_started_hunt_but_no_claim()
    {
        var q = Quests.Find("hunt1")!;

        Assert.False(q.IsCompleted(Found()));
        Assert.False(q.IsCompleted(Found() with { HuntStarted = true }));
        Assert.False(q.IsCompleted(Found() with { TroopsTrained = true }));
        Assert.True(q.IsCompleted(Found() with { TroopsTrained = true, HuntStarted = true }));
    }

    [Fact]
    public void An_unknown_quest_is_refused()
    {
        Assert.Equal(QuestRejection.UnknownQuest, Found().PlanClaimQuest("nope").Rejection);
        Assert.Equal(QuestRejection.UnknownQuest, Found().PlanClaimQuest(null).Rejection);
    }

    [Fact]
    public void A_quest_whose_condition_is_not_met_cannot_be_claimed()
    {
        Assert.Equal(QuestRejection.NotCompleted, Found().PlanClaimQuest("longhouse2").Rejection);
    }

    [Fact]
    public void A_completed_quest_pays_its_reward_and_sets_its_bit()
    {
        var s = Found(longhouse: 2);
        var decision = s.PlanClaimQuest("longhouse2");

        Assert.True(decision.Accepted);
        var claimed = s.ClaimQuest(decision.Quest!, T0);

        Assert.Equal(350, claimed.Resources.At(T0).Wood, 6);
        Assert.Equal(300, claimed.Resources.At(T0).Stone, 6);
        Assert.Equal(250, claimed.Resources.At(T0).Food, 6);
        Assert.Equal(100, claimed.Resources.At(T0).Iron, 6);
        Assert.True(claimed.HasClaimed(decision.Quest!));
        Assert.Equal(Quests.Find("longhouse2")!.Mask, claimed.ClaimedQuests);
    }

    [Fact]
    public void A_quest_pays_exactly_once()
    {
        var s = Found(longhouse: 2);
        var claimed = s.ClaimQuest(s.PlanClaimQuest("longhouse2").Quest!, T0);

        Assert.Equal(QuestRejection.AlreadyClaimed, claimed.PlanClaimQuest("longhouse2").Rejection);
        Assert.Throws<InvalidOperationException>(() => claimed.ClaimQuest(Quests.Find("longhouse2")!, T0));
    }

    [Fact]
    public void Any_completed_quest_can_be_claimed_in_any_order_and_claims_are_independent()
    {
        var s = Found(longhouse: 5, others: [BuildingType.StorageHouse, .. Producers(6)], capacity: 100_000);

        foreach (var id in new[] { "longhouse5", "producers3", "storagehouse1" })
        {
            var d = s.PlanClaimQuest(id);
            Assert.True(d.Accepted, id);
            s = s.ClaimQuest(d.Quest!, T0);
        }

        Assert.Equal(QuestRejection.None, s.PlanClaimQuest("longhouse2").Rejection);
        Assert.Equal(QuestRejection.AlreadyClaimed, s.PlanClaimQuest("producers3").Rejection);
    }

    [Fact]
    public void The_reward_is_clamped_to_storage_capacity()
    {
        var s = Found(longhouse: 2, stock: 900, capacity: 1_000);
        var claimed = s.ClaimQuest(s.PlanClaimQuest("longhouse2").Quest!, T0);

        var stock = claimed.Resources.At(T0);
        Assert.Equal(1_000, stock.Wood, 6);
        Assert.Equal(1_000, stock.Stone, 6);
        Assert.Equal(1_000, stock.Food, 6);
        Assert.True(claimed.HasClaimed(Quests.Find("longhouse2")!));
    }

    [Fact]
    public void The_register_quest_needs_an_account_and_pays_premium_instead_of_resources()
    {
        var register = Quests.Find(Quests.RegisterId)!;
        Assert.Equal(9, register.Bit);
        Assert.Equal(14, register.PremiumDays);
        Assert.Equal(ResourceAmounts.Zero, register.Reward);

        var anonymous = Found();
        Assert.False(register.IsCompleted(anonymous));
        Assert.Equal(QuestRejection.NotCompleted, anonymous.PlanClaimQuest(Quests.RegisterId).Rejection);

        var registered = anonymous with { OwnerRegistered = true };
        Assert.True(register.IsCompleted(registered));
        var claimed = registered.ClaimQuest(registered.PlanClaimQuest(Quests.RegisterId).Quest!, T0);
        Assert.True(claimed.HasClaimed(register));
        Assert.Equal(QuestRejection.AlreadyClaimed, claimed.PlanClaimQuest(Quests.RegisterId).Rejection);
    }

    [Fact]
    public void The_register_quest_sits_before_the_tower_quest_until_registered_then_comes_first()
    {
        var ids = (Settlement s) => Quests.For(s).Select(q => q.Id).ToList();

        var anonymous = ids(Found());
        Assert.Equal(anonymous.IndexOf("tower3") - 1, anonymous.IndexOf(Quests.RegisterId));

        var registered = ids(Found() with { OwnerRegistered = true });
        Assert.Equal(0, registered.IndexOf(Quests.RegisterId));
        Assert.Equal(Quests.All.Count, registered.Count);
    }
}
