using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Bjarnoy.TestSupport;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Linked realms share their stores (<c>docs/design/economy.md</c> section 5): two settlements of one player whose realms touch are
/// settled, paid and queued as one — through the service layer, the EF model and a real database, on the test clock.
/// </summary>
public sealed class LinkedRealmEndpointsTests : IAsyncLifetime
{
    private const string OwnerId = "linked-player";

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private sealed record Scene(
        Guid WorldId, Guid Oldest, Guid Newest, Guid Unlinked, HexCoord NewestCentre, HexCoord OldestCentre, int Reach, IReadOnlyList<HexCoord> NewestOnlyHexes);

    /// <summary>
    /// A founded settlement (the oldest), a second one of the same player whose longhouse disc touches its disc (the newest, stocked
    /// differently so a re-split is visible), and a third of the same player on another island (not linked, with its own old stock).
    /// </summary>
    private async Task<Scene> SetUpAsync()
    {
        var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync($"w-{Guid.CreateVersion7():N}"[..20], 21, 60, cancellationToken: Ct);
        var islands = (await client.GetFullIslandsAsync(world.Id, Ct))!
            .Where(i => i.StartPositions.Count > 0).ToList();
        Assert.True(islands.Count >= 2, "the world needs two islands with a start position");

        var plot = islands[0].StartPositions[0];
        var founded = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(islands[0].Id, plot.Q, plot.R, "Bjornstad", "Ulf", OwnerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, founded.StatusCode);
        var oldest = await founded.ReadStrictAsync<SettlementResponse>(Ct);

        var reach = Settlement.ClaimRadiusForLonghouseLevel(1);
        var oldestCentre = new HexCoord(plot.Q, plot.R);
        var newestCentre = new HexCoord(plot.Q + (2 * reach) + 1, plot.R);
        var otherPlot = islands[1].StartPositions[0];

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var first = await db.Settlements.AsNoTracking().FirstAsync(s => s.Id == oldest.Id, Ct);
        var speed = (await db.Worlds.AsNoTracking().FirstAsync(w => w.Id == world.Id, Ct)).SpeedFactor;
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        production *= speed;

        SettlementEntity Member(string name, HexCoord centre, Guid islandId, DateTimeOffset foundedAt, ResourceAmounts stock, DateTimeOffset settledAt)
        {
            var entity = new SettlementEntity
            {
                WorldId = world.Id,
                IslandId = islandId,
                Name = name,
                OwnerName = first.OwnerName,
                OwnerId = first.OwnerId,
                UserId = first.UserId,
                FoundedAt = foundedAt,
            };
            entity.ApplyDomain(new Settlement
            {
                Id = entity.Id,
                Name = name,
                Centre = centre,
                Buildings = [new PlacedBuilding(centre, BuildingType.Longhouse, 1)],
                Resources = ResourcePool.Create(stock, production, capacity, settledAt),
            });
            return entity;
        }

        var newest = Member("Lillestad", newestCentre, first.IslandId, first.FoundedAt.AddMinutes(10), ResourceAmounts.Zero, first.SettledAt);
        var unlinked = Member(
            "Farholm", new HexCoord(otherPlot.Q, otherPlot.R), islands[1].Id, first.FoundedAt.AddMinutes(20),
            BuildingCatalogue.FoundingStock * 0.25, first.SettledAt - TimeSpan.FromHours(1));
        db.Settlements.AddRange(newest, unlinked);
        await db.SaveChangesAsync(Ct);

        var newestOnly = newestCentre.WithinRadius(reach)
            .Where(h => h != newestCentre && oldestCentre.DistanceTo(h) > reach)
            .ToList();
        return new Scene(world.Id, oldest.Id, newest.Id, unlinked.Id, newestCentre, oldestCentre, reach, newestOnly);
    }

    private async Task<SettlementEntity> ReadAsync(Guid id)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.Settlements.AsNoTracking().Include(s => s.Queue).Include(s => s.Buildings).FirstAsync(s => s.Id == id, Ct);
    }

    /// <summary>Queues a level 1 building on the first of <paramref name="hexes"/> the rules accept, requested via <paramref name="requested"/>.</summary>
    private async Task<HexCoord> QueueBuildingAsync(Guid requested, IEnumerable<HexCoord> hexes, ISet<HexCoord> taken)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var settlements = scope.ServiceProvider.GetRequiredService<SettlementService>();
        var refusals = new List<BuildRejection>();
        foreach (var hex in hexes.Where(h => !taken.Contains(h)))
        {
            foreach (var type in Level1Types)
            {
                var result = await settlements.QueueBuildAsync(requested, type, hex, Ct);
                if (result.Accepted)
                {
                    taken.Add(hex);
                    return hex;
                }

                refusals.Add(result.Rejection);
            }
        }

        throw new InvalidOperationException($"no hex accepted a level 1 building: {string.Join(", ", refusals.Distinct())}");
    }

    // What a level 1 longhouse unlocks; which one a hex takes depends on its terrain.
    private static readonly BuildingType[] Level1Types =
        [BuildingType.StorageHouse, BuildingType.Lumberjack, BuildingType.ClayBrickworks, BuildingType.ReindeerHerder];

    private static double Total(SettlementEntity a, SettlementEntity b, Func<SettlementEntity, double> pick) => pick(a) + pick(b);

    [Fact]
    public async Task A_build_on_the_newer_members_hex_requested_via_the_oldest_books_on_the_newer_and_is_paid_from_the_pool()
    {
        var scene = await SetUpAsync();
        var oldestBefore = await ReadAsync(scene.Oldest);

        var hex = await QueueBuildingAsync(scene.Oldest, scene.NewestOnlyHexes, new HashSet<HexCoord>());

        var oldest = await ReadAsync(scene.Oldest);
        var newest = await ReadAsync(scene.Newest);
        var order = Assert.Single(newest.Queue, o => o.Q == hex.Q && o.R == hex.R);
        var cost = BuildingCatalogue.Get(order.Type, order.TargetLevel).Cost;
        Assert.Empty(oldest.Queue);

        // The oldest held the whole stock before (the newest had none), yet both rows paid: the pool is shared by capacity.
        Assert.True(newest.StockWood > 0);
        Assert.Equal(oldestBefore.StockWood - cost.Wood, Total(oldest, newest, s => s.StockWood), 3);
        Assert.Equal(oldestBefore.StockStone - cost.Stone, Total(oldest, newest, s => s.StockStone), 3);
    }

    [Fact]
    public async Task A_linked_realms_construction_slots_are_the_members_added_up()
    {
        var scene = await SetUpAsync();
        var taken = new HashSet<HexCoord>();

        // A lone longhouse (level 1) has two slots; two linked ones have four, so a third and fourth build run at once.
        for (var i = 0; i < 4; i++)
        {
            await QueueBuildingAsync(scene.Oldest, scene.NewestOnlyHexes, taken);
        }

        var oldest = await ReadAsync(scene.Oldest);
        var newest = await ReadAsync(scene.Newest);
        var orders = oldest.Queue.Concat(newest.Queue).ToList();
        Assert.Equal(4, orders.Count);
        Assert.All(orders, o => Assert.NotNull(o.CompletesAt));
    }

    [Fact]
    public async Task After_a_group_write_both_rows_share_one_SettledAt_and_hold_the_pool_at_capacity_shares()
    {
        var scene = await SetUpAsync();
        _factory.Time.Advance(TimeSpan.FromMinutes(30));

        await QueueBuildingAsync(scene.Oldest, scene.NewestOnlyHexes, new HashSet<HexCoord>());

        var oldest = await ReadAsync(scene.Oldest);
        var newest = await ReadAsync(scene.Newest);
        Assert.Equal(oldest.SettledAt, newest.SettledAt);
        Assert.Equal(oldest.StockWood / oldest.CapacityWood, newest.StockWood / newest.CapacityWood, 6);
        Assert.Equal(oldest.StockStone / oldest.CapacityStone, newest.StockStone / newest.CapacityStone, 6);
        Assert.Equal(oldest.StockFood / oldest.CapacityFood, newest.StockFood / newest.CapacityFood, 6);
    }

    [Fact]
    public async Task A_same_player_settlement_on_another_island_is_left_untouched_by_the_groups_writes()
    {
        var scene = await SetUpAsync();
        var before = await ReadAsync(scene.Unlinked);
        _factory.Time.Advance(TimeSpan.FromMinutes(30));

        await QueueBuildingAsync(scene.Oldest, scene.NewestOnlyHexes, new HashSet<HexCoord>());

        var after = await ReadAsync(scene.Unlinked);
        Assert.Equal(before.SettledAt, after.SettledAt);
        Assert.Equal(before.StockWood, after.StockWood);
        Assert.Equal(before.Version, after.Version);
    }

    #region Army, trade and guild paths use the shared stock (step D)

    private async Task<T> WithDbAsync<T>(Func<GameDbContext, Task<T>> body)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        return await body(scope.ServiceProvider.GetRequiredService<GameDbContext>());
    }

    /// <summary>Sets the stored stock of settlements directly (the pool is the sum; the next group load re-splits it by capacity).</summary>
    private Task SetStockAsync(params (Guid Id, ResourceAmounts Stock)[] stocks) => WithDbAsync(async db =>
    {
        foreach (var (id, stock) in stocks)
        {
            var entity = await db.Settlements.FirstAsync(s => s.Id == id, Ct);
            entity.StockWood = stock.Wood;
            entity.StockStone = stock.Stone;
            entity.StockFood = stock.Food;
            entity.StockIron = stock.Iron;
        }

        await db.SaveChangesAsync(Ct);
        return true;
    });

    private Task SetLonghouseLevelAsync(int level, params Guid[] ids) => WithDbAsync(async db =>
    {
        foreach (var id in ids)
        {
            var longhouse = await db.PlacedBuildings.FirstAsync(b => b.SettlementId == id && b.Type == BuildingType.Longhouse, Ct);
            longhouse.Level = level;
        }

        await db.SaveChangesAsync(Ct);
        return true;
    });

    private Task SetGarrisonAsync(Guid id, params UnitStack[] stacks) => WithDbAsync(async db =>
    {
        var entity = await db.Settlements
            .Include(s => s.Buildings).Include(s => s.Queue).Include(s => s.Garrison).Include(s => s.TrainingQueue).Include(s => s.Runes)
            .FirstAsync(s => s.Id == id, Ct);
        entity.ApplyDomain(entity.ToDomain().WithGarrisonAt(new HexCoord(entity.CentreQ, entity.CentreR), stacks));
        await db.SaveChangesAsync(Ct);
        return true;
    });

    private async Task<DateTimeOffset> GameNowAsync(Guid worldId) => await WithDbAsync(async db =>
        (await db.Worlds.AsNoTracking().FirstAsync(w => w.Id == worldId, Ct)).ToClock().ToGameTime(_factory.Time.GetUtcNow()));

    private Task<ArmyEntity> ReadArmyAsync(Guid armyId) => WithDbAsync(db =>
        db.Armies.AsNoTracking().Include(a => a.Stacks).FirstAsync(a => a.Id == armyId, Ct));

    private async Task<Guid> PlantArmyAsync(
        Guid homeId, ArmyMission mission, Guid? targetId, DateTimeOffset departedAt, bool returning,
        HexCoord from, HexCoord to, double legHours, double returnLegHours, ResourceAmounts loot, params UnitStack[] stacks)
    {
        var army = new ArmyEntity
        {
            SettlementId = homeId,
            HomeSpotQ = from.Q,
            HomeSpotR = from.R,
            Mission = (int)mission,
            TargetSettlementId = targetId,
            AtHome = false,
            Provisions = 1000,
            DepartedAt = departedAt,
            Path = returning ? [new HexPoint(to.Q, to.R), new HexPoint(from.Q, from.R)] : [new HexPoint(from.Q, from.R), new HexPoint(to.Q, to.R)],
            CumulativeHours = returning ? [0, returnLegHours] : [0, legHours],
            EdgeHours = returning ? [0, returnLegHours] : [0, legHours],
            ReturnPath = [new HexPoint(to.Q, to.R), new HexPoint(from.Q, from.R)],
            ReturnCumulativeHours = [0, returnLegHours],
            ReturnEdgeHours = [0, returnLegHours],
            TurnAroundAt = returning ? departedAt : departedAt + TimeSpan.FromHours(legHours),
            IsReturning = returning,
            LootWood = loot.Wood,
            LootStone = loot.Stone,
            LootFood = loot.Food,
            LootIron = loot.Iron,
            Stacks = [.. stacks.Select(s => new ArmyUnitStackEntity { UnitType = s.Type, Count = s.Count })],
        };
        return await WithDbAsync(async db =>
        {
            db.Armies.Add(army);
            await db.SaveChangesAsync(Ct);
            return army.Id;
        });
    }

    private void AssertSharesEven(SettlementEntity a, SettlementEntity b)
    {
        Assert.Equal(a.SettledAt, b.SettledAt);
        Assert.Equal(a.StockWood / a.CapacityWood, b.StockWood / b.CapacityWood, 6);
        Assert.Equal(a.StockFood / a.CapacityFood, b.StockFood / b.CapacityFood, 6);
    }

    [Fact]
    public async Task A_raid_on_the_newer_member_loots_the_whole_pooled_stock_and_both_shares_are_re_split()
    {
        var scene = await SetUpAsync();
        var stock = new ResourceAmounts(400, 400, 400, 0);
        await SetStockAsync((scene.Oldest, stock), (scene.Newest, ResourceAmounts.Zero));
        _factory.Time.Advance(TimeSpan.FromHours(3));
        var gameNow = await GameNowAsync(scene.WorldId);

        // Lands two hours in (an hour after leaving), on a defender with no garrison; the way home takes two more hours.
        var armyId = await PlantArmyAsync(
            scene.Unlinked, ArmyMission.Raid, scene.Newest, gameNow - TimeSpan.FromHours(2), returning: false,
            scene.OldestCentre, scene.NewestCentre, legHours: 1, returnLegHours: 2, ResourceAmounts.Zero, new UnitStack(UnitType.Axeman, 500));

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var armies = scope.ServiceProvider.GetRequiredService<ArmyService>();
            var result = await armies.GetAsync(armyId, Ct);
            Assert.NotNull(result?.Army);
        }

        var army = await ReadArmyAsync(armyId);
        var oldest = await ReadAsync(scene.Oldest);
        var newest = await ReadAsync(scene.Newest);

        // The newer member held none of its own and a half share of the pool at most, yet the raid took the whole pooled stock.
        Assert.InRange(army.LootWood, 399, double.MaxValue);
        Assert.InRange(army.LootStone, 399, double.MaxValue);
        // The pool's food went into the raiders' provisions first (the refill; 500 axemen hold far more than 400), so none of it is
        // loot: the army's provisions rose by what the pool held.
        Assert.Equal(0, army.LootFood);
        var burnedOnTheWayOut = 500 * UnitCatalogue.Get(UnitType.Axeman).UpkeepPerHour;
        Assert.True(army.Provisions >= 1000 - burnedOnTheWayOut + 399, "the raid refilled the provisions from the pool's food");
        Assert.True(Total(oldest, newest, s => s.StockWood) < 100, "the raid left the pool nearly empty");
        Assert.True(Total(oldest, newest, s => s.StockFood) < 100, "the raid took the pool's food too, as refill");
        AssertSharesEven(oldest, newest);
    }

    [Fact]
    public async Task Loot_brought_home_lands_in_the_pool_and_is_shared_between_the_members()
    {
        var scene = await SetUpAsync();
        await SetStockAsync((scene.Oldest, ResourceAmounts.Zero), (scene.Newest, ResourceAmounts.Zero));
        var gameNow = await GameNowAsync(scene.WorldId);

        // Back from a raid an hour ago; the carried loot goes into the realm of the settlement it left from.
        var armyId = await PlantArmyAsync(
            scene.Oldest, ArmyMission.Raid, scene.Unlinked, gameNow - TimeSpan.FromHours(2), returning: true,
            scene.OldestCentre, scene.NewestCentre, legHours: 1, returnLegHours: 1, new ResourceAmounts(100, 80, 60, 0), new UnitStack(UnitType.Axeman, 5));

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var armies = scope.ServiceProvider.GetRequiredService<ArmyService>();
            Assert.Null((await armies.GetAsync(armyId, Ct))?.Army);
        }

        var oldest = await ReadAsync(scene.Oldest);
        var newest = await ReadAsync(scene.Newest);
        Assert.Equal(100, Total(oldest, newest, s => s.StockWood), 3);
        Assert.Equal(80, Total(oldest, newest, s => s.StockStone), 3);
        Assert.True(newest.StockWood > 0 && oldest.StockWood > 0, "both members hold a share of the loot");
        Assert.True(oldest.StockWood < 100, "the oldest does not keep it all");
        AssertSharesEven(oldest, newest);
    }

    [Fact]
    public async Task Dispatch_provisions_are_paid_from_the_pool_when_they_exceed_the_departing_members_share()
    {
        var scene = await SetUpAsync();
        await SetStockAsync((scene.Oldest, new ResourceAmounts(0, 0, 300, 0)), (scene.Newest, ResourceAmounts.Zero));
        await SetGarrisonAsync(scene.Newest, new UnitStack(UnitType.Spearman, 40));

        const double provisions = 250;
        ArmyDispatchResult? dispatched = null;
        var refusals = new List<DispatchRejection>();
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var armies = scope.ServiceProvider.GetRequiredService<ArmyService>();
            foreach (var hex in scene.NewestOnlyHexes)
            {
                var result = await armies.DispatchAsync(
                    scene.Newest, scene.NewestCentre, [new UnitStack(UnitType.Spearman, 30)], [], hex, provisions, cancellationToken: Ct);
                if (result.Accepted)
                {
                    dispatched = result;
                    break;
                }

                refusals.Add(result.Rejection);
            }
        }

        Assert.True(dispatched is not null, $"no hex accepted the dispatch: {string.Join(", ", refusals.Distinct())}");
        var oldest = await ReadAsync(scene.Oldest);
        var newest = await ReadAsync(scene.Newest);

        // 300 food shared 150/150: only the pool covers 250.
        Assert.Equal(50, Total(oldest, newest, s => s.StockFood), 3);
        AssertSharesEven(oldest, newest);
    }

    [Fact]
    public async Task A_trade_offer_larger_than_one_members_share_is_escrowed_from_the_pool_and_refunded_into_it()
    {
        var scene = await SetUpAsync();
        await SetLonghouseLevelAsync(5, scene.Oldest, scene.Newest);
        await SetStockAsync((scene.Oldest, new ResourceAmounts(300, 0, 0, 0)), (scene.Newest, new ResourceAmounts(300, 0, 0, 0)));

        Guid offerId;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var trade = scope.ServiceProvider.GetRequiredService<TradeService>();
            var posted = await trade.PostOfferAsync(
                scene.Newest, Bjarnoy.Domain.Trade.TradeResource.Wood, 500, Bjarnoy.Domain.Trade.TradeResource.Iron, 500, guildOnly: false, Ct);
            Assert.True(posted.Accepted, $"{posted.Outcome} {posted.Rejection}");
            offerId = posted.Offer!.Id;
        }

        var oldest = await ReadAsync(scene.Oldest);
        var newest = await ReadAsync(scene.Newest);
        Assert.Equal(100, Total(oldest, newest, s => s.StockWood), 3);
        AssertSharesEven(oldest, newest);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var trade = scope.ServiceProvider.GetRequiredService<TradeService>();
            var cancelled = await trade.CancelOfferAsync(offerId, scene.Newest, Ct);
            Assert.Equal(TradeCancelOutcome.Applied, cancelled.Outcome);
        }

        oldest = await ReadAsync(scene.Oldest);
        newest = await ReadAsync(scene.Newest);
        Assert.Equal(600, Total(oldest, newest, s => s.StockWood), 3);
        AssertSharesEven(oldest, newest);
    }

    [Fact]
    public async Task Posting_a_trade_offer_keeps_the_guest_upkeep_in_the_stored_food_rate()
    {
        // Regression: the trade paths settled with a plain SettleTo that knew nothing of hosted guests (or terrain boosts), so the
        // rate they stored dropped the guests' upkeep (and a mill's boost). Every resource path now settles through the group.
        var scene = await SetUpAsync();
        await SetLonghouseLevelAsync(3, scene.Unlinked);
        await PlantArmyAsync(
            scene.Oldest, ArmyMission.Support, scene.Unlinked, await GameNowAsync(scene.WorldId), returning: false,
            scene.OldestCentre, scene.OldestCentre, legHours: 0, returnLegHours: 0, ResourceAmounts.Zero, new UnitStack(UnitType.Spearman, 10));
        await WithDbAsync(async db =>
        {
            var guest = await db.Armies.FirstAsync(a => a.TargetSettlementId == scene.Unlinked, Ct);
            guest.AtHome = false;
            guest.IsSupporting = true;
            await db.SaveChangesAsync(Ct);
            return true;
        });

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var trade = scope.ServiceProvider.GetRequiredService<TradeService>();
            var posted = await trade.PostOfferAsync(
                scene.Unlinked, Bjarnoy.Domain.Trade.TradeResource.Wood, 50, Bjarnoy.Domain.Trade.TradeResource.Iron, 50, guildOnly: false, Ct);
            Assert.True(posted.Accepted, $"{posted.Outcome} {posted.Rejection}");
        }

        var after = await ReadAsync(scene.Unlinked);
        var speed = await WithDbAsync(async db => (await db.Worlds.AsNoTracking().FirstAsync(w => w.Id == scene.WorldId, Ct)).SpeedFactor);
        var withoutGuests = BuildingCatalogue.Totals([(BuildingType.Longhouse, 3)]).ProductionPerHour.Food * speed;
        Assert.True(after.RateFood < withoutGuests, $"guest upkeep missing from the stored food rate ({after.RateFood} vs {withoutGuests} without guests)");
    }

    #endregion
}
