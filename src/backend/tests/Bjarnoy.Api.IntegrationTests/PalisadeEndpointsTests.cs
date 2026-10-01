using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The palisade through HTTP, the EF model and the pathfinder (<c>docs/design/economy.md</c> section 5): where the server lets a wall and a gate
/// stand, and how a standing wall stops a land army of anyone but its owner.
/// </summary>
public sealed class PalisadeEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    // Random, not version-7: the first hex digits of a v7 guid are the timestamp, equal for two calls in one test.
    private static string Unique(string prefix) => $"{prefix}-{Guid.NewGuid():N}"[..20];

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    private sealed record Player(SettlementResponse Settlement, AuthResponse Auth);

    private static async Task<Player> FoundAsync(HttpClient client, Guid worldId, IslandResponse island, TileCoordinate plot, string name)
    {
        var ownerId = Unique("local-owner-");
        var settlement = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, name, name, ownerId), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);
        var auth = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique(name.ToLowerInvariant() + "-"), "correct-horse-battery", ownerId), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        return new Player(settlement, auth);
    }

    private async Task<(HttpClient Client, WorldEntity World, IslandResponse Island, Player Owner, HashSet<HexCoord> Rivers)> SetUpAsync()
    {
        var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.Where(i => i.StartPositions.Count > 3).OrderByDescending(i => i.TileCount).First();
        var owner = await FoundAsync(client, world.Id, island, island.StartPositions[0], "Ulf");
        var rivers = island.RiverTiles.Select(t => new HexCoord(t.Q, t.R)).ToHashSet();
        return (client, world, island, owner, rivers);
    }

    private static async Task<Dictionary<HexCoord, string>> TerrainAroundAsync(HttpClient client, Guid worldId, HexCoord around, int window)
    {
        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{worldId}/tiles?qMin={around.Q - window}&qMax={around.Q + window}" +
            $"&rMin={around.R - window}&rMax={around.R + window}",
            SqliteApiFixture.StrictJson, Ct);
        return chunk!.Tiles.ToDictionary(t => new HexCoord(t.Q, t.R), t => t.Terrain);
    }

    private async Task GrantAsync(HttpClient client, params (Guid SettlementId, int Spearmen)[] grants)
    {
        var adminName = Unique("admin");
        var admin = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(adminName, "correct-horse-battery"), Ct)).ReadStrictAsync<AuthResponse>(Ct);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            (await db.Users.SingleAsync(u => u.Id == admin.User.Id, Ct)).Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var token = (await (await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(adminName, "correct-horse-battery"), Ct)).ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
        Authorize(client, token);
        foreach (var (settlementId, spearmen) in grants)
        {
            var granted = await client.PostJsonAsync(
                $"/api/v1/admin/settlements/{settlementId}/garrison", new AdjustGarrisonRequest("spearman", spearmen), Ct);
            Assert.Equal(HttpStatusCode.OK, granted.StatusCode);
        }
    }

    [Fact]
    public async Task A_wall_line_and_a_gate_are_placed_by_the_wall_rules_and_a_branch_or_a_bent_gate_is_refused()
    {
        var (client, world, _, owner, rivers) = await SetUpAsync();
        using var _ = client;
        var centre = new HexCoord(owner.Settlement.Q, owner.Settlement.R);
        var terrain = await TerrainAroundAsync(client, world.Id, centre, 4);

        // Three plain, river-free hexes in a row inside the claim (radius 3 of the centre), with room for a branch hex beside the middle one.
        bool Free(HexCoord c) => c != centre && c.DistanceTo(centre) <= 3 && terrain.TryGetValue(c, out var t) && t is "grass" or "sand" or "forest"
            && !rivers.Contains(c);
        HexCoord[]? line = null;
        HexCoord branch = default;
        foreach (var start in terrain.Keys.Where(Free).OrderBy(c => c.Q).ThenBy(c => c.R))
        {
            for (var d = 0; d < 3 && line is null; d++)
            {
                var step = HexCoord.Directions[d];
                HexCoord[] candidate = [start, start + step, start + step + step];
                var side = HexCoord.Directions[(d + 1) % 6];
                var beside = candidate[1] + side;
                if (candidate.All(Free) && Free(beside) && !candidate.Contains(beside))
                {
                    line = candidate;
                    branch = beside;
                }
            }

            if (line is not null)
            {
                break;
            }
        }

        Assert.NotNull(line);

        // LH 15 (four construction slots) and a level-5 tower standing: what the palisade unlocks behind.
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var longhouse = await db.PlacedBuildings.SingleAsync(b => b.SettlementId == owner.Settlement.Id && b.Type == BuildingType.Longhouse, Ct);
            longhouse.Level = 15;
            var towerHex = centre.WithinRadius(2).First(c => c != centre && !line.Contains(c) && c != branch && terrain.TryGetValue(c, out var t) && t is "grass" or "sand");
            db.PlacedBuildings.Add(new PlacedBuildingEntity { SettlementId = owner.Settlement.Id, Q = towerHex.Q, R = towerHex.R, Type = BuildingType.Tower, Level = 5 });
            await db.SaveChangesAsync(Ct);
        }

        Authorize(client, owner.Auth.AccessToken);
        Task<HttpResponseMessage> Build(string type, HexCoord at) =>
            client.PostJsonAsync($"/api/v1/settlements/{owner.Settlement.Id}/builds", new QueueBuildRequest(type, at.Q, at.R), Ct);

        // A gate on its own is no straight.
        Assert.Equal("GateNotOnStraight", await (await Build("palisadegate", line![1])).RejectionAsync(Ct));

        // The two outer posts, then the gate between them.
        Assert.Equal(HttpStatusCode.Accepted, (await Build("palisade", line[0])).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await Build("palisade", line[2])).StatusCode);
        Assert.Equal(HttpStatusCode.Accepted, (await Build("palisadegate", line[1])).StatusCode);

        // A fourth hex beside the gate would be a third arm.
        Assert.Equal("PalisadeWouldBranch", await (await Build("palisade", branch)).RejectionAsync(Ct));

        // Not on the settlement's own building.
        Assert.Equal("HexOccupied", await (await Build("palisade", centre)).RejectionAsync(Ct));
    }

    [Fact]
    public async Task A_dispatch_into_a_walled_in_target_is_refused_for_another_player_and_goes_through_the_gate_for_the_wall_owner()
    {
        var (client, world, island, owner, rivers) = await SetUpAsync();
        using var _ = client;

        // A second player, far enough away (the founding spacing) on the same island, and a target between the two settlements whose whole
        // ring is plain river-free land and that both can walk to: chosen with the server's own sampler and rivers.
        var ownerHex = new HexCoord(owner.Settlement.Q, owner.Settlement.R);
        var terrain = await TerrainAroundAsync(client, world.Id, ownerHex, 24);
        bool Plain(HexCoord c) => terrain.TryGetValue(c, out var t) && t is "grass" or "sand" or "forest" && !rivers.Contains(c);
        var candidates = terrain.Keys.Where(c => Plain(c) && c.Neighbours().All(Plain)).ToList();
        TileCoordinate? plot = null;
        HexCoord target = default;
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var worldEntity = await db.Worlds.SingleAsync(w => w.Id == world.Id, Ct);
            var sampler = await WorldTerrain.SamplerAsync(db, worldEntity, Ct);
            var index = await WorldRivers.IndexAsync(db, world.Id, Ct);
            int? Steps(HexCoord from, HexCoord to) =>
                HexPathfinder.FindPath(from, to, sampler.TerrainAt, true, index.IsRiver, index.IsWide)?.Count;

            foreach (var p in island.StartPositions
                .Where(p => new HexCoord(p.Q, p.R).DistanceTo(ownerHex) >= SettlementService.MinimumSpacing)
                .OrderBy(p => new HexCoord(p.Q, p.R).DistanceTo(ownerHex)))
            {
                var from = new HexCoord(p.Q, p.R);
                var best = candidates
                    .Where(c => c.DistanceTo(ownerHex) >= 3 && c.DistanceTo(from) >= 3)
                    .OrderBy(c => Math.Max(c.DistanceTo(ownerHex), c.DistanceTo(from)))
                    .Take(300)
                    .FirstOrDefault(c => Steps(ownerHex, c) is <= 18 && Steps(from, c) is <= 18);
                if (best != default)
                {
                    plot = p;
                    target = best;
                    break;
                }
            }
        }

        Assert.NotNull(plot);
        // A client of its own: the first one now carries the owner's session.
        using var strangerClient = _factory.CreateClient();
        var stranger = await FoundAsync(strangerClient, world.Id, island, plot, "Egil");
        await GrantAsync(client, (owner.Settlement.Id, 10), (stranger.Settlement.Id, 10));

        var ring = target.Neighbours();

        DispatchArmyRequest ToTarget() => new([new UnitCountRequest("spearman", 2)], null, new HexPointRequest(target.Q, target.R), 20);
        async Task<HttpResponseMessage> DispatchAsync(Player who)
        {
            Authorize(client, who.Auth.AccessToken);
            return await client.PostJsonAsync($"/api/v1/settlements/{who.Settlement.Id}/armies", ToTarget(), Ct);
        }

        // Control: both players reach the target while no wall stands there.
        var strangerControl = await DispatchAsync(stranger);
        Assert.True(strangerControl.IsSuccessStatusCode, await strangerControl.Content.ReadAsStringAsync(Ct));
        var ownerControl = await DispatchAsync(owner);
        Assert.True(ownerControl.IsSuccessStatusCode, await ownerControl.Content.ReadAsStringAsync(Ct));

        // The owner walls the target in, with a gate on one ring hex; the foundations (level 0) block nobody yet.
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            db.PlacedBuildings.AddRange(ring.Select((h, i) => new PlacedBuildingEntity
            {
                SettlementId = owner.Settlement.Id,
                Q = h.Q,
                R = h.R,
                Type = i == 0 ? BuildingType.PalisadeGate : BuildingType.Palisade,
                Level = 0,
            }));
            await db.SaveChangesAsync(Ct);
        }

        var duringConstruction = await DispatchAsync(stranger);
        Assert.True(duringConstruction.IsSuccessStatusCode, "a foundation must not block: " + await duringConstruction.Content.ReadAsStringAsync(Ct));

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            foreach (var wall in await db.PlacedBuildings.Where(b => b.SettlementId == owner.Settlement.Id && b.Level == 0).ToListAsync(Ct))
            {
                wall.Level = 1;
            }

            await db.SaveChangesAsync(Ct);
        }

        // The stranger is walled out (every wall hex of a closed ring blocks, the gate included) ...
        var refused = await DispatchAsync(stranger);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        var problem = await refused.Content.ReadFromJsonAsync<ProblemDetails>(SqliteApiFixture.StrictJson, Ct);
        Assert.Equal("UnreachableLeg", problem!.Extensions["rejection"]?.ToString());

        // ... while the owner walks in through its own gate.
        var accepted = await DispatchAsync(owner);
        Assert.True(accepted.IsSuccessStatusCode, await accepted.Content.ReadAsStringAsync(Ct));
        var army = await accepted.ReadStrictAsync<ArmyResponse>(Ct);
        var path = army.Movement!.Path.Select(p => new HexCoord(p.Q, p.R)).ToList();
        Assert.Equal(target, path[^1]);
        Assert.Equal(ring[0], path[^2]);
    }
}
