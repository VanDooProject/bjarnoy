using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// A founding convoy that goes by sea, end to end: a Karve carries the five settlers and their escorts from a coastal
/// settlement to a land hex it beaches on, and on arrival the new settlement's garrison is the ship and the escorts
/// (<c>Army.PlanFoundingArrival</c>) — through HTTP, the EF model and a real database, with the clock under the test's
/// control.
/// </summary>
public sealed class SeaFoundingEndpointsTests : IAsyncLifetime
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

    private static readonly (int Dq, int Dr)[] NeighbourOffsets = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)];

    private sealed record Setup(
        Guid WorldId, SettlementResponse Home, AuthResponse Player, HexCoord Target, HashSet<(int Q, int R)> Sea);

    private static bool IsSea(Dictionary<(int Q, int R), string> terrain, HexCoord hex) =>
        terrain.TryGetValue((hex.Q, hex.R), out var t) && t == "sea";

    private static IEnumerable<HexCoord> NeighboursOf(HexCoord hex) =>
        NeighbourOffsets.Select(o => new HexCoord(hex.Q + o.Dq, hex.R + o.Dr));

    /// <summary>
    /// A founded settlement on a coastal grass hex with a Karve, five Settlers, two Spearmen and two Berserkers in its
    /// garrison, owned by a registered player who has the renown for a second settlement, plus the founding target: the
    /// grass hex next to the sea that clears the founding spacing from the home claim and is nearest to home, among
    /// those whose adjacent sea is connected to the sea around home (a real flood fill over the fetched terrain).
    /// </summary>
    private async Task<Setup> SetUpConvoyAsync(HttpClient client)
    {
        const int Window = 40;
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];
        var plotHex = new HexCoord(plot.Q, plot.R);

        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{world.Id}/tiles?qMin={plot.Q - Window}&qMax={plot.Q + Window}&rMin={plot.R - Window}&rMax={plot.R + Window}",
            SqliteApiFixture.StrictJson, Ct);
        var terrain = chunk!.Tiles.ToDictionary(t => (t.Q, t.R), t => t.Terrain);

        var home = terrain
            .Where(t => t.Value == "grass")
            .Select(t => new HexCoord(t.Key.Q, t.Key.R))
            .Where(h => NeighboursOf(h).Count(n => IsSea(terrain, n)) >= 3 && h.DistanceTo(plotHex) <= 20)
            .OrderBy(h => h.DistanceTo(plotHex)).ThenBy(h => h.Q).ThenBy(h => h.R)
            .First();

        // The sea around home: a flood fill from home's sea neighbours.
        var sea = new HashSet<(int Q, int R)>();
        var queue = new Queue<HexCoord>();
        foreach (var n in NeighboursOf(home).Where(n => IsSea(terrain, n)))
        {
            if (sea.Add((n.Q, n.R)))
            {
                queue.Enqueue(n);
            }
        }

        while (queue.Count > 0)
        {
            foreach (var n in NeighboursOf(queue.Dequeue()).Where(n => IsSea(terrain, n)))
            {
                if (sea.Add((n.Q, n.R)))
                {
                    queue.Enqueue(n);
                }
            }
        }

        // Home's Longhouse starts at level 1; the level-5 claim radius is the safe upper bound the settler golden path uses too.
        var minDistance = Settlement.ClaimRadiusForLonghouseLevel(5) + SettlementService.MinimumSpacing;
        var targetOrNull = terrain
            .Where(t => t.Value == "grass")
            .Select(t => new HexCoord(t.Key.Q, t.Key.R))
            .Where(h => h.DistanceTo(home) >= minDistance)
            .Where(h => NeighboursOf(h).Any(n => sea.Contains((n.Q, n.R))))
            .OrderBy(h => h.DistanceTo(home)).ThenBy(h => h.Q).ThenBy(h => h.R)
            .Select(h => (HexCoord?)h)
            .FirstOrDefault();
        Assert.True(targetOrNull is not null, "no coastal grass hex reachable by sea clears the founding spacing");
        var target = targetOrNull.Value;

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var entity = await db.Islands.SingleAsync(i => i.Id == island.Id, Ct);
            entity.StartPositions = [.. entity.StartPositions, new HexPoint(home.Q, home.R)];
            await db.SaveChangesAsync(Ct);
        }

        var ownerId = Unique("local-owner-");
        var founded = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, home.Q, home.R, "Bjornstad", "Ulf", ownerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, founded.StatusCode);
        var settlement = await founded.ReadStrictAsync<SettlementResponse>(Ct);

        var player = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("ulf-"), "correct-horse-battery", ownerId), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", player.AccessToken);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == player.User.Id, Ct);
            user.RenownTotal = RenownThresholds.RequiredFor(2);
            db.UnitStacks.Add(new UnitStackEntity { SettlementId = settlement.Id, SpotQ = settlement.Q, SpotR = settlement.R, UnitType = UnitType.Karve, Count = 1 });
            db.UnitStacks.Add(new UnitStackEntity { SettlementId = settlement.Id, SpotQ = settlement.Q, SpotR = settlement.R, UnitType = UnitType.Settler, Count = 5 });
            db.UnitStacks.Add(new UnitStackEntity { SettlementId = settlement.Id, SpotQ = settlement.Q, SpotR = settlement.R, UnitType = UnitType.Spearman, Count = 2 });
            db.UnitStacks.Add(new UnitStackEntity { SettlementId = settlement.Id, SpotQ = settlement.Q, SpotR = settlement.R, UnitType = UnitType.Berserker, Count = 2 });
            await db.SaveChangesAsync(Ct);
        }

        return new Setup(world.Id, settlement, player, target, sea);
    }

    private static Task<HttpResponseMessage> DispatchAsync(HttpClient client, Setup s, params UnitCountRequest[] units) =>
        client.PostJsonAsync(
            $"/api/v1/settlements/{s.Home.Id}/armies",
            // Five settlers carry at most 5 * 40 = 200 food; the same ceiling the overland golden path uses.
            new DispatchArmyRequest([new(s.Home.Spot(), units)], null, new HexPointRequest(s.Target.Q, s.Target.R), 200, "found"),
            Ct);

    [Fact]
    public async Task A_karve_carries_the_settlers_and_their_escort_to_a_beach_and_the_ship_and_escort_garrison_the_new_settlement()
    {
        using var client = _factory.CreateClient();
        var s = await SetUpConvoyAsync(client);

        var dispatch = await DispatchAsync(
            client, s, new UnitCountRequest("karve", 1), new UnitCountRequest("settler", 5), new UnitCountRequest("spearman", 2));

        Assert.True(dispatch.IsSuccessStatusCode, $"dispatch was refused: {await dispatch.Content.ReadAsStringAsync(Ct)}");
        var army = await dispatch.ReadStrictAsync<ArmyResponse>(Ct);
        Assert.Equal("found", army.Mission);

        var path = army.Movement!.Path;
        Assert.Equal((s.Target.Q, s.Target.R), (path[^1].Q, path[^1].R));
        Assert.All(path.Skip(1).SkipLast(1), p => Assert.Contains((p.Q, p.R), s.Sea));

        // Past arrival; the army resolves lazily on read. The access token does not survive the clock skip.
        _factory.Time.Advance(TimeSpan.FromDays(3));
        var refreshed = await (await client.PostJsonAsync("/api/v1/auth/refresh", new RefreshRequest(s.Player.RefreshToken), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", refreshed.AccessToken);

        var armyAfter = await client.GetAsync($"/api/v1/armies/{army.Id}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, armyAfter.StatusCode); // consumed by founding

        var mine = await client.GetFromJsonAsync<List<SettlementSummary>>(
            $"/api/v1/worlds/{s.WorldId}/settlements/mine", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(2, mine!.Count);
        var founded = Assert.Single(mine, m => m.Q == s.Target.Q && m.R == s.Target.R);

        var settlement = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{founded.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(settlement!.Garrison, g => g.Unit == "karve" && g.Count == 1);
        Assert.Contains(settlement.Garrison, g => g.Unit == "spearman" && g.Count == 2);
        Assert.DoesNotContain(settlement.Garrison, g => g.Unit == "settler");
    }

    [Fact]
    public async Task A_founding_convoy_whose_passengers_overfill_the_karve_is_refused()
    {
        using var client = _factory.CreateClient();
        var s = await SetUpConvoyAsync(client);

        // 5 settlers + 2 berserkers (4 slots each) = 13 slots on one Karve of 10.
        var response = await DispatchAsync(
            client, s, new UnitCountRequest("karve", 1), new UnitCountRequest("settler", 5), new UnitCountRequest("berserker", 2));

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("InsufficientShipCapacity", await response.RejectionAsync(Ct));
    }
}
