using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Buildings outside the realm decay (<c>docs/design/economy.md</c> section 5): losing the tower that chains a lumberjack into the
/// realm switches the lumberjack off at once, and the clock then takes its levels one by one until it is gone — through HTTP,
/// the EF model and a real database, on the test clock.
/// </summary>
public sealed class RealmDecayEndpointsTests : IAsyncLifetime
{
    private const string OwnerId = "ulf-player";
    private const int LumberjackLevel = 3;

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private sealed record Scene(HttpClient Client, SettlementResponse Settlement, HexCoord Tower, HexCoord Lumberjack);

    /// <summary>A settlement whose longhouse has a tower in its disc and a lumberjack out on the tower's ground only.</summary>
    private async Task<Scene> FoundWithChainedLumberjackAsync()
    {
        var client = _factory.CreateClient();
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var founded = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", OwnerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, founded.StatusCode);
        var settlement = await founded.ReadStrictAsync<SettlementResponse>(Ct);
        client.DefaultRequestHeaders.Add("X-Owner-Id", OwnerId);

        var centre = new HexCoord(plot.Q, plot.R);
        var longhouseReach = Settlement.ClaimRadiusForLonghouseLevel(settlement.LonghouseLevel);
        var tower = new HexCoord(centre.Q + longhouseReach, centre.R);
        var lumberjack = new HexCoord(centre.Q + longhouseReach + 1, centre.R);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var entity = await db.Settlements.Include(s => s.Buildings).FirstAsync(s => s.Id == settlement.Id, Ct);
            entity.Buildings.Add(new PlacedBuildingEntity { SettlementId = entity.Id, Q = tower.Q, R = tower.R, Type = BuildingType.Tower, Level = 5 });
            entity.Buildings.Add(new PlacedBuildingEntity
            {
                SettlementId = entity.Id, Q = lumberjack.Q, R = lumberjack.R, Type = BuildingType.Lumberjack, Level = LumberjackLevel,
            });
            await db.SaveChangesAsync(Ct);
        }

        return new Scene(client, settlement, tower, lumberjack);
    }

    private static Task<SettlementResponse> ReadAsync(Scene scene) =>
        scene.Client.GetFromJsonAsync<SettlementResponse>($"/api/v1/settlements/{scene.Settlement.Id}", SqliteApiFixture.StrictJson, Ct)!;

    private async Task RazeTowerAsync(Scene scene)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var settlements = scope.ServiceProvider.GetRequiredService<SettlementService>();
        var result = await settlements.RazeBuildingAsync(scene.Settlement.Id, scene.Tower, Ct);
        Assert.Equal(AdminEditOutcome.Applied, result.Outcome);
    }

    [Fact]
    public async Task Losing_the_chaining_tower_switches_the_lumberjack_off_at_once_and_the_clock_then_takes_it_level_by_level()
    {
        var scene = await FoundWithChainedLumberjackAsync();
        var interval = BuildingCatalogue.DecayInterval(BuildingType.Lumberjack);

        var working = await ReadAsync(scene);
        var workingWood = working.Resources.RatePerHour.Wood;
        Assert.Null(working.Buildings.Single(b => b.Type == "lumberjack").OutsideRealmSince);
        Assert.True(workingWood > scene.Settlement.Resources.RatePerHour.Wood);

        // The tower falls: the lumberjack stands on ground nobody claims any more.
        await RazeTowerAsync(scene);
        var cut = await ReadAsync(scene);
        var marked = cut.Buildings.Single(b => b.Type == "lumberjack");
        Assert.NotNull(marked.OutsideRealmSince);
        Assert.Equal(LumberjackLevel, marked.Level);
        Assert.True(marked.NextLevelLossInSeconds > 0);
        Assert.True(cut.Resources.RatePerHour.Wood < workingWood);
        Assert.Equal(scene.Settlement.Resources.RatePerHour.Wood, cut.Resources.RatePerHour.Wood, 6);

        // Two and a half intervals later: two levels gone, read twice with the same answer.
        _factory.Time.Advance(interval * 2.5);
        var later = await ReadAsync(scene);
        Assert.Equal(LumberjackLevel - 2, later.Buildings.Single(b => b.Type == "lumberjack").Level);
        var again = await ReadAsync(scene);
        Assert.Equal(LumberjackLevel - 2, again.Buildings.Single(b => b.Type == "lumberjack").Level);

        // The last level goes and the hex is free.
        _factory.Time.Advance(interval);
        var gone = await ReadAsync(scene);
        Assert.DoesNotContain(gone.Buildings, b => b.Type == "lumberjack");
        Assert.Contains(gone.Buildings, b => b.Type == "longhouse");
    }

    [Fact]
    public async Task The_sweep_decays_a_settlement_nobody_reads()
    {
        var scene = await FoundWithChainedLumberjackAsync();
        var interval = BuildingCatalogue.DecayInterval(BuildingType.Lumberjack);
        await ReadAsync(scene);
        await RazeTowerAsync(scene);

        _factory.Time.Advance(interval * 1.5);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var changed = await scope.ServiceProvider.GetRequiredService<SettlementService>().SweepRealmStateAsync(Ct);
            Assert.Equal(1, changed);
        }

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var stored = await db.PlacedBuildings.AsNoTracking()
                .SingleAsync(b => b.SettlementId == scene.Settlement.Id && b.Type == BuildingType.Lumberjack, Ct);
            Assert.Equal(LumberjackLevel - 1, stored.Level);
            Assert.NotNull(stored.OutsideRealmSince);
        }
    }

    [Fact]
    public async Task Rebuilding_the_tower_brings_the_lumberjack_back_with_the_levels_it_has_left()
    {
        var scene = await FoundWithChainedLumberjackAsync();
        var interval = BuildingCatalogue.DecayInterval(BuildingType.Lumberjack);
        await RazeTowerAsync(scene);
        _factory.Time.Advance(interval * 1.5);
        var decayed = await ReadAsync(scene);
        Assert.Equal(LumberjackLevel - 1, decayed.Buildings.Single(b => b.Type == "lumberjack").Level);

        // The tower stands again (planted on the entity, as the scene does; the next read finds the realm has reached the hex).
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            db.PlacedBuildings.Add(new PlacedBuildingEntity
            {
                SettlementId = scene.Settlement.Id, Q = scene.Tower.Q, R = scene.Tower.R, Type = BuildingType.Tower, Level = 5,
            });
            await db.SaveChangesAsync(Ct);
        }

        var back = await ReadAsync(scene);
        var lumberjack = back.Buildings.Single(b => b.Type == "lumberjack");
        Assert.Null(lumberjack.OutsideRealmSince);
        Assert.Equal(LumberjackLevel - 1, lumberjack.Level);
        Assert.True(back.Resources.RatePerHour.Wood > decayed.Resources.RatePerHour.Wood);
    }
}
