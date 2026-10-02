using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <c>GET /worlds/{id}/walls</c>: the rival wall hexes a live client needs to draw, hit-test and route around other players' palisades.
/// Same fog rule as the settlement list (a rival's walls are listed only when its centre hex is explored), the caller's own walls
/// excluded, a foundation (level 0) not a wall yet.
/// </summary>
public sealed class WorldWallsEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private async Task<(Guid WorldId, SettlementResponse Own, string Owner, HttpClient Client)> SetUpAsync()
    {
        var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 80, cancellationToken: Ct);
        var owner = Unique("owner");
        client.DefaultRequestHeaders.Add("X-Owner-Id", owner);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];
        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", owner), Ct);
        return (world.Id, await response.ReadStrictAsync<SettlementResponse>(Ct), owner, client);
    }

    private async Task<Guid> PlantAsync(
        Guid worldId, Guid islandId, Guid userId, int centreQ, int centreR, params (int Q, int R, BuildingType Type, int Level)[] walls)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            UserId = userId,
            Name = Unique("rival"),
            OwnerName = "Rival",
            OwnerId = Unique("rival-owner"),
            CentreQ = centreQ,
            CentreR = centreR,
            FoundedAt = DateTimeOffset.UnixEpoch,
            Buildings = [new PlacedBuildingEntity { Q = centreQ, R = centreR, Type = BuildingType.Longhouse, Level = 1 }],
        };
        foreach (var (q, r, type, level) in walls)
        {
            settlement.Buildings.Add(new PlacedBuildingEntity { Q = q, R = r, Type = type, Level = level });
        }

        db.Settlements.Add(settlement);
        await db.SaveChangesAsync(Ct);
        return settlement.Id;
    }

    private async Task<Guid> RegisterUserAsync()
    {
        using var client = _factory.CreateClient();
        var response = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("player"), "correct-horse-battery", null), Ct);
        var auth = await response.ReadStrictAsync<AuthResponse>(Ct);
        return auth.User.Id;
    }

    private static Task<List<WallResponse>?> WallsAsync(HttpClient client, Guid worldId) =>
        client.GetFromJsonAsync<List<WallResponse>>($"/api/v1/worlds/{worldId}/walls", SqliteApiFixture.StrictJson, Ct);

    [Fact]
    public async Task Lists_an_explored_rivals_standing_walls_with_the_owner_and_skips_a_foundation()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        var rivalUser = await RegisterUserAsync();
        var rivalId = await PlantAsync(
            worldId, own.IslandId, rivalUser, own.Q + 5, own.R,
            (own.Q + 4, own.R, BuildingType.Palisade, 2),
            (own.Q + 4, own.R + 1, BuildingType.PalisadeGate, 1),
            (own.Q + 4, own.R + 2, BuildingType.Palisade, 0));

        var walls = await WallsAsync(client, worldId);

        Assert.NotNull(walls);
        Assert.Equal(2, walls.Count);
        var wall = Assert.Single(walls, w => w.Type == "palisade");
        Assert.Equal((own.Q + 4, own.R, 2, rivalId, (Guid?)rivalUser), (wall.Q, wall.R, wall.Level, wall.SettlementId, wall.OwnerUserId));
        Assert.Contains(walls, w => w.Type == "palisadegate" && w.R == own.R + 1);
        Assert.DoesNotContain(walls, w => w.R == own.R + 2);
    }

    [Fact]
    public async Task Leaves_out_the_callers_own_walls()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            db.PlacedBuildings.Add(new PlacedBuildingEntity
            {
                SettlementId = own.Id, Q = own.Q + 2, R = own.R, Type = BuildingType.Palisade, Level = 1,
            });
            await db.SaveChangesAsync(Ct);
        }

        Assert.Empty((await WallsAsync(client, worldId))!);
    }

    [Fact]
    public async Task An_anonymous_settlements_wall_has_no_owner_user()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        await PlantAsync(
            worldId, own.IslandId, SystemUserIds.Abandoned, own.Q + 5, own.R, (own.Q + 4, own.R, BuildingType.Palisade, 1));

        var wall = Assert.Single((await WallsAsync(client, worldId))!);

        Assert.Null(wall.OwnerUserId);
    }

    [Fact]
    public async Task Hides_the_walls_of_a_rival_whose_centre_is_unexplored()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        await PlantAsync(
            worldId, own.IslandId, SystemUserIds.Abandoned, own.Q + 20, own.R, (own.Q + 19, own.R, BuildingType.Palisade, 1));

        Assert.Empty((await WallsAsync(client, worldId))!);
    }

    [Fact]
    public async Task Is_empty_for_a_caller_with_no_realm()
    {
        var (worldId, own, _, client) = await SetUpAsync();
        using var _ = client;
        await PlantAsync(
            worldId, own.IslandId, SystemUserIds.Abandoned, own.Q + 5, own.R, (own.Q + 4, own.R, BuildingType.Palisade, 1));
        using var stranger = _factory.CreateClient();
        stranger.DefaultRequestHeaders.Authorization = null;

        Assert.Empty((await WallsAsync(stranger, worldId))!);
    }
}
