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

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Beginner protection end to end (issue #132 design doc §1-3): founding
/// grants a shield, the shield can be yielded voluntarily, and an actual
/// attack dispatch drops it implicitly.
/// </summary>
public sealed class BeginnerProtectionTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private HttpClient Client() => _factory.CreateClient();

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private async Task<(Guid WorldId, SettlementResponse Settlement)> FoundAsync(
        HttpClient client, string ownerId, int seed = 21, int radius = 60)
    {
        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), seed, radius), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId),
            Ct);

        response.EnsureSuccessStatusCode();

        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);

        return (world.Id, await response.ReadStrictAsync<SettlementResponse>(Ct));
    }

    [Fact]
    public async Task Founding_grants_a_shield_that_expires_within_the_3_to_14_day_range()
    {
        using var client = Client();
        var before = _factory.Time.GetUtcNow();
        var (_, settlement) = await FoundAsync(client, "ulf-player");

        Assert.True(settlement.IsShielded);
        Assert.NotNull(settlement.ShieldExpiresAtUtc);
        var days = (settlement.ShieldExpiresAtUtc!.Value - before).TotalDays;
        Assert.InRange(days, Settlement.MinShieldDays - 0.01, Settlement.MaxShieldDays + 0.01);
    }

    [Fact]
    public async Task Yielding_the_shield_clears_it_and_a_second_yield_is_refused()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client, "ulf-player");
        Assert.True(settlement.IsShielded);

        var yielded = await (await client.PostAsync(
            $"/api/v1/settlements/{settlement.Id}/yield-shield", content: null, Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);

        Assert.False(yielded.IsShielded);
        Assert.Null(yielded.ShieldExpiresAtUtc);

        var again = await client.PostAsync(
            $"/api/v1/settlements/{settlement.Id}/yield-shield", content: null, Ct);
        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Yielding_an_unknown_settlements_shield_is_not_found()
    {
        using var client = Client();
        client.DefaultRequestHeaders.Add("X-Owner-Id", "nobody");

        var response = await client.PostAsync(
            $"/api/v1/settlements/{Guid.CreateVersion7()}/yield-shield", content: null, Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    /// <summary>
    /// Dispatching an actual attack from a shielded settlement drops the
    /// shield unconditionally (design doc §3) — even though the dispatch
    /// endpoint itself is exercised elsewhere, this asserts the shield side
    /// effect specifically, so it drives <see cref="ArmyService"/> and
    /// <see cref="SettlementService"/> directly via DI rather than composing
    /// a full HTTP dispatch (route/food-range shaping is not what this test
    /// is about) — inserting the attacker/defender settlements directly onto
    /// two of the same island's real (land-connected) start positions so
    /// pathfinding is real but the distance is under this test's control,
    /// rather than trusting whatever <c>FoundAsync</c>'s founding-time
    /// spacing rule happens to produce.
    /// </summary>
    [Fact]
    public async Task An_attack_dispatch_drops_the_attackers_shield_even_if_the_defender_wins()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var worlds = scope.ServiceProvider.GetRequiredService<WorldService>();
        var armies = scope.ServiceProvider.GetRequiredService<ArmyService>();

        var world = await worlds.CreateWorldAsync(
            Unique("w"), WorldGenerationOptions.ForSeed(21) with { Radius = 60 }, maxPlayers: 500, Ct);

        var islands = await worlds.GetIslandsAsync(world.Id, Ct);

        // The closest pair of start positions on the same island — guarantees
        // a real, land-connected path exists between them, with the
        // shortest plausible travel time for this test's fixed provisions.
        var island = islands
            .Where(i => i.StartPositions.Count >= 2)
            .OrderBy(i => ClosestPairDistance(i.StartPositions))
            .First();
        var (attackerPlot, defenderPlot) = ClosestPair(island.StartPositions);

        var now = _factory.Time.GetUtcNow();
        var attacker = NewSettlement(world.Id, island.Id, attackerPlot, shieldExpiresAtUtc: now + TimeSpan.FromDays(5), now);
        var defender = NewSettlement(world.Id, island.Id, defenderPlot, shieldExpiresAtUtc: null, now);
        dbContext.Settlements.AddRange(attacker, defender);
        await dbContext.SaveChangesAsync(Ct);

        Assert.True(attacker.ToDomain().IsShielded(now));

        var result = await armies.DispatchAsync(
            attacker.Id,
            unitCounts: [new UnitStack(UnitType.Axeman, 5)],
            waypoints: [],
            destination: null,
            provisions: 50, // 5 axemen * FoodCarryCapacity(10) — the max they can carry.
            mission: ArmyMission.Attack,
            targetSettlementId: defender.Id,
            cancellationToken: Ct);

        Assert.True(result.Accepted, $"expected the attack to dispatch, got {result.Rejection}");

        var reloaded = await dbContext.Settlements.AsNoTracking()
            .FirstAsync(s => s.Id == attacker.Id, Ct);
        Assert.Null(reloaded.ShieldExpiresAtUtc);
        Assert.False(reloaded.ToDomain().IsShielded(now));
    }

    /// <summary>A Move (non-attack) dispatch leaves a shielded settlement's shield untouched.</summary>
    [Fact]
    public async Task A_move_dispatch_does_not_drop_the_shield()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var worlds = scope.ServiceProvider.GetRequiredService<WorldService>();
        var armies = scope.ServiceProvider.GetRequiredService<ArmyService>();

        var world = await worlds.CreateWorldAsync(
            Unique("w"), WorldGenerationOptions.ForSeed(21) with { Radius = 60 }, maxPlayers: 500, Ct);
        var islands = await worlds.GetIslandsAsync(world.Id, Ct);
        var island = islands.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var now = _factory.Time.GetUtcNow();
        var settlement = NewSettlement(world.Id, island.Id, plot, shieldExpiresAtUtc: now + TimeSpan.FromDays(5), now);
        dbContext.Settlements.Add(settlement);
        await dbContext.SaveChangesAsync(Ct);

        var neighbourCoord = new HexCoord(plot.Q + 1, plot.R);

        var result = await armies.DispatchAsync(
            settlement.Id,
            unitCounts: [new UnitStack(UnitType.Axeman, 5)],
            waypoints: [],
            destination: neighbourCoord,
            provisions: 50,
            mission: ArmyMission.Move,
            cancellationToken: Ct);

        // Whether or not the move itself lands on walkable land, the shield
        // must not be touched — only Attack/Raid clears it (design doc §3).
        var reloaded = await dbContext.Settlements.AsNoTracking()
            .FirstAsync(s => s.Id == settlement.Id, Ct);
        Assert.NotNull(reloaded.ShieldExpiresAtUtc);
        Assert.True(reloaded.ToDomain().IsShielded(now));
    }

    private static (HexPoint A, HexPoint B) ClosestPair(IReadOnlyList<HexPoint> positions)
    {
        var best = (A: positions[0], B: positions[1], Distance: int.MaxValue);
        for (var i = 0; i < positions.Count; i++)
        {
            for (var j = i + 1; j < positions.Count; j++)
            {
                var distance = new HexCoord(positions[i].Q, positions[i].R)
                    .DistanceTo(new HexCoord(positions[j].Q, positions[j].R));
                if (distance < best.Distance)
                {
                    best = (positions[i], positions[j], distance);
                }
            }
        }

        return (best.A, best.B);
    }

    private static int ClosestPairDistance(IReadOnlyList<HexPoint> positions)
    {
        var min = int.MaxValue;
        for (var i = 0; i < positions.Count; i++)
        {
            for (var j = i + 1; j < positions.Count; j++)
            {
                var distance = new HexCoord(positions[i].Q, positions[i].R)
                    .DistanceTo(new HexCoord(positions[j].Q, positions[j].R));
                min = Math.Min(min, distance);
            }
        }

        return min;
    }

    private static SettlementEntity NewSettlement(
        Guid worldId, Guid islandId, HexPoint at, DateTimeOffset? shieldExpiresAtUtc, DateTimeOffset now)
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        var settlement = new SettlementEntity
        {
            WorldId = worldId,
            IslandId = islandId,
            Name = $"Realm-{Guid.CreateVersion7():N}"[..12],
            OwnerName = "Ulf",
            OwnerId = $"owner-{Guid.CreateVersion7():N}",
            UserId = SystemUserIds.Abandoned,
            CentreQ = at.Q,
            CentreR = at.R,
            FoundedAt = now,
            ShieldExpiresAtUtc = shieldExpiresAtUtc,
        };

        settlement.ApplyDomain(new Settlement
        {
            Id = settlement.Id,
            Name = settlement.Name,
            Centre = new HexCoord(at.Q, at.R),
            Buildings = [new PlacedBuilding(new HexCoord(at.Q, at.R), BuildingType.Longhouse, 1)],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(100_000), production, capacity, now),
            Garrison = [new UnitStack(UnitType.Axeman, 5)],
            ShieldExpiresAtUtc = shieldExpiresAtUtc,
        });

        return settlement;
    }
}
