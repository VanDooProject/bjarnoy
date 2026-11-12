using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// A bridge is applied lazily (its build order raises the level when its owner's settlement is next settled), but it opens the river for
/// every army from the instant its order completes, and a finished raze closes it from then: <c>docs/design/economy.md</c> section 5. The
/// target hex (6, 0) of an all-land island is walled in by a ring of wide rivers, so the bridge on its (5, 0) neighbour is the only way in.
/// The bridge's owner is another player whose settlement is never settled during the test, so only the order tells the route about it.
/// </summary>
public sealed class BridgeRouteTimingEndpointsTests : IAsyncLifetime
{
    private const string Owner = "marching-owner";

    private static readonly HexCoord Home = new(-6, 0);
    private static readonly HexCoord Target = new(6, 0);
    private static readonly HexCoord BridgeHex = new(5, 0);

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    /// <summary>A single huge all-land island, as <c>WallRerouteEndpointsTests.LandOptions</c>.</summary>
    private static WorldGenerationOptions LandOptions => new()
    {
        Seed = 14,
        Radius = 500,
        IslandCellSize = 100,
        IslandChance = 1.0,
        IslandMaxReach = 0.0,
        IslandMinGap = 0.0,
        IslandMinWidth = 100.0,
        IslandMaxWidth = 100.0,
        IslandMinSegments = 1,
        IslandMaxSegments = 1,
        IslandCoastWarp = 0.0,
        IslandCoastNoise = 0.0,
        IslandSmallShare = 0.0,
        IslandLargeShare = 0.0,
        BeachThreshold = 1.0,
        MountainThreshold = 0.0,
        MountainRockiness = 2.0,
        ForestRockiness = 2.0,
    };

    /// <summary>
    /// Plants the world: the marching owner's home with a garrison, the ring of wide rivers around the target, and one bridge of the other
    /// player on <see cref="BridgeHex"/> — a foundation (level 0) or a standing bridge of <paramref name="standingLevel"/> — with a build or
    /// raze order that completes <paramref name="orderCompletesAfter"/> past the start. Returns the home settlement's id.
    /// </summary>
    private async Task<Guid> PlantAsync(int standingLevel, BuildOrderKind kind, int targetLevel, TimeSpan orderCompletesAfter)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var start = _factory.Time.GetUtcNow();
        var world = new WorldEntity { Name = $"w-{Guid.CreateVersion7():N}", MaxPlayers = 100 };
        world.ApplyGenerationOptions(LandOptions);
        db.Worlds.Add(world);
        var ring = Target.Neighbours()
            .Select(n => new RiverTileRecord(n.Q, n.R, (int)RiverTileShape.Straight, [(int)TileOrientation.W], (int)TileOrientation.E));
        var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0, RiverTiles = [.. ring] };
        db.Islands.Add(island);

        SettlementEntity Settlement(string ownerId, Guid userId, HexCoord centre) => new()
        {
            WorldId = world.Id,
            IslandId = island.Id,
            Name = $"s-{Guid.CreateVersion7():N}",
            OwnerName = "Owner",
            OwnerId = ownerId,
            UserId = userId,
            CentreQ = centre.Q,
            CentreR = centre.R,
            SettledAt = start,
            StockFood = 500,
            CapacityFood = 1000,
        };

        var builder = new UserEntity { UserName = "builder", NormalizedUserName = "BUILDER", PasswordHash = "hash" };
        db.Users.Add(builder);
        var home = Settlement(Owner, SystemUserIds.Abandoned, Home);
        home.Garrison.Add(new UnitStackEntity { SpotQ = Home.Q, SpotR = Home.R, UnitType = UnitType.Spearman, Count = 10 });
        var bridgeOwner = Settlement("builder-owner", builder.Id, new HexCoord(20, 20));
        bridgeOwner.Buildings.Add(new PlacedBuildingEntity { Q = BridgeHex.Q, R = BridgeHex.R, Type = BuildingType.Bridge, Level = standingLevel });
        bridgeOwner.Queue.Add(new BuildOrderEntity
        {
            Q = BridgeHex.Q, R = BridgeHex.R, Type = BuildingType.Bridge, TargetLevel = targetLevel, Kind = kind,
            QueuedAt = start, BaseDuration = orderCompletesAfter, StartedAt = start, CompletesAt = start + orderCompletesAfter,
        });
        db.Settlements.AddRange(home, bridgeOwner);
        await db.SaveChangesAsync(Ct);
        return home.Id;
    }

    private HttpClient Client()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Owner-Id", Owner);
        return client;
    }

    private static Task<HttpResponseMessage> DispatchAsync(HttpClient client, Guid homeId) =>
        client.PostJsonAsync(
            $"/api/v1/settlements/{homeId}/armies",
            new DispatchArmyRequest([new(new HexPointRequest(Home.Q, Home.R), [new UnitCountRequest("spearman", 5)])], null, new HexPointRequest(Target.Q, Target.R), 100),
            Ct);

    [Fact]
    public async Task A_bridge_whose_build_order_completed_opens_the_river_while_its_owner_never_settled()
    {
        var homeId = await PlantAsync(standingLevel: 0, BuildOrderKind.Build, targetLevel: 3, TimeSpan.FromHours(2));
        using var client = Client();

        // The order is still running: the ring is shut.
        var early = await DispatchAsync(client, homeId);
        Assert.Equal(HttpStatusCode.Conflict, early.StatusCode);

        _factory.Time.Advance(TimeSpan.FromHours(3));
        var dispatched = await DispatchAsync(client, homeId);

        Assert.True(dispatched.IsSuccessStatusCode, await dispatched.Content.ReadAsStringAsync(Ct));
        var army = await dispatched.Content.ReadFromJsonAsync<ArmyResponse>(SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(new HexPointResponse(BridgeHex.Q, BridgeHex.R), army!.Movement!.Path);
    }

    [Fact]
    public async Task A_bridge_whose_raze_order_completed_shuts_the_river_while_its_owner_never_settled()
    {
        var homeId = await PlantAsync(standingLevel: 3, BuildOrderKind.Raze, targetLevel: 0, TimeSpan.FromHours(2));
        using var client = Client();

        var early = await DispatchAsync(client, homeId);
        Assert.True(early.IsSuccessStatusCode, await early.Content.ReadAsStringAsync(Ct));

        _factory.Time.Advance(TimeSpan.FromHours(3));
        var refused = await DispatchAsync(client, homeId);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        var problem = await refused.Content.ReadFromJsonAsync<ProblemDetails>(SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("UnreachableLeg", problem!.Extensions["rejection"]?.ToString());
    }
}
