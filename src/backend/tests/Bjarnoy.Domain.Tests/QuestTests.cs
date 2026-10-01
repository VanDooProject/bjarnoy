using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Settlers;
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
            ["producers3", "longhouse2", "storagehouse1", "producers6", "longhouse3", "longhouse5", "hunt1"],
            Quests.All.Select(q => q.Id));
        Assert.Equal(new ResourceAmounts(150, 120, 80, 0), Quests.Find("producers3")!.Reward);
        Assert.Equal(new ResourceAmounts(250, 200, 150, 0), Quests.Find("longhouse2")!.Reward);
        Assert.Equal(new ResourceAmounts(200, 200, 200, 0), Quests.Find("storagehouse1")!.Reward);
        Assert.Equal(new ResourceAmounts(200, 150, 100, 0), Quests.Find("producers6")!.Reward);
        Assert.Equal(new ResourceAmounts(400, 300, 200, 0), Quests.Find("longhouse3")!.Reward);
        Assert.Equal(new ResourceAmounts(800, 600, 400, 0), Quests.Find("longhouse5")!.Reward);
        Assert.Equal(new ResourceAmounts(400, 300, 300, 0), Quests.Find("hunt1")!.Reward);
        Assert.Equal(6, Quests.Find("hunt1")!.Bit);
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

    [Fact]
    public void The_storage_house_quest_needs_a_standing_storage_house()
    {
        var q = Quests.Find("storagehouse1")!;

        Assert.False(q.IsCompleted(Found(others: [BuildingType.Farm])));
        Assert.True(q.IsCompleted(Found(others: [BuildingType.StorageHouse])));
    }

    [Fact]
    public void The_hunt_quest_completes_only_once_a_hunt_was_started()
    {
        var q = Quests.Find("hunt1")!;

        Assert.False(q.IsCompleted(Found()));
        Assert.True(q.IsCompleted(Found() with { HuntStarted = true }));
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
}
