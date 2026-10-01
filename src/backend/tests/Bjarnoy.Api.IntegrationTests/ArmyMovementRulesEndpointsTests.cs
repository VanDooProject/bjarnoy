using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The movement rules at the API: wide rivers and mountains stop a land army, so a dispatch with no
/// land route is refused with a clear 409 instead of being planned across them.
/// </summary>
public sealed class ArmyMovementRulesEndpointsTests : IAsyncLifetime
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

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    [Fact]
    public async Task A_dispatch_to_a_target_walled_in_by_wide_rivers_is_refused_with_a_no_land_route_message()
    {
        using var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.Where(i => i.StartPositions.Count > 3).OrderByDescending(i => i.TileCount).First();
        var plot = island.StartPositions[0];

        var ownerId = Unique("local-owner-");
        var settlement = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);
        var player = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("ulf-"), "correct-horse-battery", ownerId), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);

        // An admin puts spearmen straight into the garrison.
        var adminName = Unique("admin");
        var admin = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(adminName, "correct-horse-battery"), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            (await db.Users.SingleAsync(u => u.Id == admin.User.Id, Ct)).Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var adminToken = (await (await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(adminName, "correct-horse-battery"), Ct))
            .ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
        Authorize(client, adminToken);
        var granted = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/garrison", new AdjustGarrisonRequest("spearman", 5), Ct);
        Assert.Equal(HttpStatusCode.OK, granted.StatusCode);
        Authorize(client, player.AccessToken);

        var target = await FindWalkableTargetAsync(client, world.Id, settlement);
        DispatchArmyRequest ToTarget() => new(
            [new UnitCountRequest("spearman", 1)], null, new HexPointRequest(target.Q, target.R), 10);

        // Control: the target is reachable until it is walled in.
        var control = await client.PostJsonAsync($"/api/v1/settlements/{settlement.Id}/armies", ToTarget(), Ct);
        Assert.True(control.IsSuccessStatusCode, await control.Content.ReadAsStringAsync(Ct));

        // A ring of wide rivers (river width in and out) around the target.
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var entity = await db.Islands.SingleAsync(i => i.Id == island.Id, Ct);
            var ring = new HexCoord(target.Q, target.R).Neighbours()
                .Select(n => new RiverTileRecord(n.Q, n.R, (int)RiverTileShape.Straight, [(int)TileOrientation.W], (int)TileOrientation.E));
            entity.RiverTiles = [.. entity.RiverTiles, .. ring];
            await db.SaveChangesAsync(Ct);
        }

        var refused = await client.PostJsonAsync($"/api/v1/settlements/{settlement.Id}/armies", ToTarget(), Ct);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        var problem = await refused.Content.ReadFromJsonAsync<ProblemDetails>(SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("No land route: mountains and wide rivers can't be crossed.", problem!.Detail);
        Assert.Equal("UnreachableLeg", problem.Extensions["rejection"]?.ToString());
    }

    /// <summary>
    /// A grass/sand/forest hex 4-6 hexes from the settlement whose six neighbours are all plain land
    /// too, so a river ring around it is the only thing that can wall it in.
    /// </summary>
    private static async Task<TileCoordinate> FindWalkableTargetAsync(HttpClient client, Guid worldId, SettlementResponse settlement)
    {
        const int Window = 12;
        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{worldId}/tiles?qMin={settlement.Q - Window}&qMax={settlement.Q + Window}" +
            $"&rMin={settlement.R - Window}&rMax={settlement.R + Window}",
            SqliteApiFixture.StrictJson, Ct);
        var terrain = chunk!.Tiles.ToDictionary(t => new HexCoord(t.Q, t.R), t => t.Terrain);
        var start = new HexCoord(settlement.Q, settlement.R);

        bool Plain(HexCoord c) => terrain.TryGetValue(c, out var t) && t is "grass" or "sand" or "forest";

        foreach (var candidate in terrain.Keys.OrderBy(c => c.DistanceTo(start)))
        {
            var distance = candidate.DistanceTo(start);
            if (distance is >= 4 and <= 6 && Plain(candidate) && candidate.Neighbours().All(Plain))
            {
                return new TileCoordinate(candidate.Q, candidate.R);
            }
        }

        throw new InvalidOperationException("No fully-land target hex found near the settlement; widen the search or change the seed.");
    }
}
