using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

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
        var islands = (await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct))!
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
}
