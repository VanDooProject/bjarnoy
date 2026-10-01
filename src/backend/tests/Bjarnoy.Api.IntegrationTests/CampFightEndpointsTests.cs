using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Wildlife camp fights end to end (docs/design/wildlife-camps.md, "Gameplay"): the camps endpoint, the hunt mission
/// from dispatch to lazy arrival resolution, the camp report inbox, and the build rule on a cleared hex — through
/// HTTP, the EF model and a real database, with the clock under the test's control.
/// </summary>
public sealed class CampFightEndpointsTests : IAsyncLifetime
{
    private const string OwnerId = "ulf-player";

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

    private static readonly (int Dq, int Dr)[] NeighbourOffsets = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)];

    /// <summary>
    /// A founded settlement (client carries its owner id), a camp of <paramref name="family"/> on a grass neighbour of it
    /// (inside its claim) and <paramref name="axemen"/> axemen in its garrison.
    /// </summary>
    private async Task<(Guid WorldId, SettlementResponse Settlement, HexCoord CampHex, Guid IslandId)> SetUpAsync(
        HttpClient client, string family = CampFamilies.Harewarren, int level = 1, int axemen = 20)
    {
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
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", OwnerId);

        // A grass neighbour: walkable for the hunters and buildable once the camp is gone.
        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{world.Id}/tiles?qMin={plot.Q - 2}&qMax={plot.Q + 2}&rMin={plot.R - 2}&rMax={plot.R + 2}",
            SqliteApiFixture.StrictJson, Ct);
        var terrain = chunk!.Tiles.ToDictionary(t => (t.Q, t.R), t => t.Terrain);
        var campHex = NeighbourOffsets
            .Select(o => new HexCoord(plot.Q + o.Dq, plot.R + o.Dr))
            .First(h => terrain.TryGetValue((h.Q, h.R), out var t) && t == "grass");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var entity = await db.Islands.SingleAsync(i => i.Id == island.Id, Ct);
            entity.Camps = [new CampRecord(campHex.Q, campHex.R, family, level, 0)];
            db.UnitStacks.Add(new UnitStackEntity { SettlementId = settlement.Id, UnitType = UnitType.Axeman, Count = axemen });
            await db.SaveChangesAsync(Ct);
        }

        return (world.Id, settlement, campHex, island.Id);
    }

    private static Task<HttpResponseMessage> HuntAsync(
        HttpClient client, Guid settlementId, HexCoord destination, string unit = "axeman", int count = 10) =>
        client.PostJsonAsync(
            $"/api/v1/settlements/{settlementId}/armies",
            new DispatchArmyRequest(
                [new UnitCountRequest(unit, count)], null, new HexPointRequest(destination.Q, destination.R),
                Math.Min(50, count * 10), "hunt"),
            Ct);

    private Task<List<CampStateResponse>?> CampsAsync(HttpClient client, Guid worldId, string query = "") =>
        client.GetFromJsonAsync<List<CampStateResponse>>(
            $"/api/v1/worlds/{worldId}/camps{query}", SqliteApiFixture.StrictJson, Ct);

    /// <summary>The generated world has camps of its own; this is the one the test planted.</summary>
    private async Task<CampStateResponse> CampAtAsync(HttpClient client, Guid worldId, HexCoord hex) =>
        (await CampsAsync(client, worldId))!.Single(c => (c.Q, c.R) == (hex.Q, hex.R));

    private Task<List<CampReportResponse>?> CampReportsAsync(HttpClient client, Guid settlementId) =>
        client.GetFromJsonAsync<List<CampReportResponse>>(
            $"/api/v1/settlements/{settlementId}/camp-reports", SqliteApiFixture.StrictJson, Ct);

    /// <summary>Lets the army arrive, fight and walk home; reading it is what settles it (a folded army is a 404).</summary>
    private async Task ResolveHuntAsync(HttpClient client, Guid armyId)
    {
        _factory.Time.Advance(TimeSpan.FromHours(2));
        var read = await client.GetAsync($"/api/v1/armies/{armyId}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, read.StatusCode);
    }

    [Fact]
    public async Task The_camps_endpoint_reports_a_pristine_camp_at_full_strength()
    {
        using var client = Client();
        var (worldId, _, campHex, islandId) = await SetUpAsync(client, CampFamilies.Wolfden, level: 3);

        var camp = await CampAtAsync(client, worldId, campHex);

        Assert.Equal(CampFamilies.Wolfden, camp.Family);
        Assert.Equal((3, 3), (camp.Level, camp.EffectiveLevel));
        Assert.True(camp.Strong);
        Assert.Equal(new Camp(campHex, CampFamilies.Wolfden, 3, TileOrientation.E).GuardRange, camp.GuardRange);
        Assert.Equal(new CampGarrisonResponse(5, 12, 2), camp.Garrison);
        Assert.Equal(camp.Garrison, camp.FullGarrison);
        Assert.False(camp.Empty);
        Assert.True(camp.Aggressive);
        Assert.Null(camp.CalmUntil);
        Assert.Equal(0, camp.Clears);
        Assert.False(camp.Removed);
        Assert.Equal(new ResourceAmountsResponse(0, 0, 0, 0), camp.Leftover);

        // The island filter narrows to that island's camps; another island id matches nothing.
        var onIsland = (await CampsAsync(client, worldId, $"?islandId={islandId}"))!;
        Assert.Contains(onIsland, c => (c.Q, c.R) == (campHex.Q, campHex.R));
        Assert.True(onIsland.Count < (await CampsAsync(client, worldId))!.Count);
        Assert.Empty((await CampsAsync(client, worldId, $"?islandId={Guid.NewGuid()}"))!);
    }

    [Fact]
    public async Task The_camps_endpoint_never_writes_state_and_answers_404_for_an_unknown_world()
    {
        using var client = Client();
        var (worldId, _, _, _) = await SetUpAsync(client);

        await CampsAsync(client, worldId);
        _factory.Time.Advance(TimeSpan.FromHours(48));
        await CampsAsync(client, worldId);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            Assert.Empty(await db.CampStates.ToListAsync(Ct));
        }

        var missing = await client.GetAsync($"/api/v1/worlds/{Guid.NewGuid()}/camps", Ct);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task A_building_standing_on_the_hex_marks_the_camp_removed()
    {
        using var client = Client();
        var (worldId, settlement, campHex, _) = await SetUpAsync(client);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            db.PlacedBuildings.Add(new PlacedBuildingEntity
            {
                SettlementId = settlement.Id, Q = campHex.Q, R = campHex.R, Type = BuildingType.Farm, Level = 1,
            });
            await db.SaveChangesAsync(Ct);
        }

        Assert.True((await CampAtAsync(client, worldId, campHex)).Removed);
    }

    [Fact]
    public async Task Hunting_a_camp_is_accepted_and_hunting_an_empty_hex_is_refused()
    {
        using var client = Client();
        var (_, settlement, campHex, _) = await SetUpAsync(client);

        var accepted = await HuntAsync(client, settlement.Id, campHex);
        Assert.Equal(HttpStatusCode.Created, accepted.StatusCode);
        Assert.Equal("hunt", (await accepted.ReadStrictAsync<ArmyResponse>(Ct)).Mission);

        var notACamp = new HexCoord(settlement.Q, settlement.R);
        var refused = await HuntAsync(client, settlement.Id, notACamp);
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("NoCampAtDestination", await refused.RejectionAsync(Ct));
    }

    [Fact]
    public async Task Starting_a_hunt_completes_the_hunt_quest_and_it_can_be_claimed_once()
    {
        using var client = Client();
        var (_, settlement, campHex, _) = await SetUpAsync(client);
        Task<SettlementResponse?> Get() =>
            client.GetFromJsonAsync<SettlementResponse>($"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        var claimUrl = $"/api/v1/settlements/{settlement.Id}/quests/hunt1/claim";

        Assert.False((await Get())!.Quests.Single(q => q.Id == "hunt1").Completed);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsync(claimUrl, null, Ct)).StatusCode);

        // A plain move does not count as a hunt.
        var moved = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/armies",
            new DispatchArmyRequest(
                [new UnitCountRequest("axeman", 2)], null, new HexPointRequest(campHex.Q, campHex.R), 20, "move"),
            Ct);
        Assert.Equal(HttpStatusCode.Created, moved.StatusCode);
        Assert.False((await Get())!.Quests.Single(q => q.Id == "hunt1").Completed);

        // Starting the hunt is enough: the army has not arrived, let alone won.
        Assert.Equal(HttpStatusCode.Created, (await HuntAsync(client, settlement.Id, campHex)).StatusCode);
        var before = (await Get())!;
        Assert.True(before.Quests.Single(q => q.Id == "hunt1").Completed);

        var claim = await client.PostAsync(claimUrl, null, Ct);
        Assert.Equal(HttpStatusCode.OK, claim.StatusCode);
        var after = (await claim.Content.ReadFromJsonAsync<SettlementResponse>(SqliteApiFixture.StrictJson, Ct))!;
        Assert.True(after.Quests.Single(q => q.Id == "hunt1").Claimed);
        Assert.Equal(
            Math.Min(before.Resources.Stock.Wood + 400, after.Resources.Capacity.Wood), after.Resources.Stock.Wood, 1);
        Assert.Equal(
            Math.Min(before.Resources.Stock.Food + 300, after.Resources.Capacity.Food), after.Resources.Stock.Food, 1);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsync(claimUrl, null, Ct)).StatusCode);
    }

    [Fact]
    public async Task A_hunt_needs_a_destination_and_land_units()
    {
        using var client = Client();
        var (_, settlement, campHex, _) = await SetUpAsync(client);

        var noDestination = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/armies",
            new DispatchArmyRequest([new UnitCountRequest("axeman", 5)], null, null, 20, "hunt"), Ct);
        Assert.Equal(HttpStatusCode.Conflict, noDestination.StatusCode);
        Assert.Equal("DestinationRequired", await noDestination.RejectionAsync(Ct));

        // More than the garrison holds is the ordinary refusal, hunt or not.
        var tooMany = await HuntAsync(client, settlement.Id, campHex, count: 500);
        Assert.Equal(HttpStatusCode.Conflict, tooMany.StatusCode);
    }

    [Fact]
    public async Task A_won_hunt_clears_the_camp_pays_loot_and_leaves_a_report_and_a_buildable_hex()
    {
        using var client = Client();
        var (worldId, settlement, campHex, _) = await SetUpAsync(client);
        var dispatched = await HuntAsync(client, settlement.Id, campHex);
        var army = await dispatched.ReadStrictAsync<ArmyResponse>(Ct);

        // Guarded: building on the hex is still refused while the beasts live.
        var blocked = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds", new QueueBuildRequest("reindeerherder", campHex.Q, campHex.R), Ct);
        Assert.Equal("HexOccupiedByCamp", await blocked.RejectionAsync(Ct));

        await ResolveHuntAsync(client, army.Id);

        var camp = await CampAtAsync(client, worldId, campHex);
        Assert.True(camp.Empty);
        Assert.Equal(new CampGarrisonResponse(0, 0, 0), camp.Garrison);
        Assert.Equal(1, camp.Clears);
        Assert.NotNull(camp.CalmUntil);
        Assert.False(camp.Aggressive);
        Assert.False(camp.Removed);

        var report = Assert.Single((await CampReportsAsync(client, settlement.Id))!);
        Assert.Equal("hunt", report.Kind);
        Assert.Equal("army", report.Winner);
        Assert.True(report.CampCleared);
        Assert.Equal(army.Id, report.ArmyId);
        Assert.Equal(settlement.Id, report.SettlementId);
        Assert.Equal((campHex.Q, campHex.R, CampFamilies.Harewarren, 1), (report.Camp.Q, report.Camp.R, report.Camp.Family, report.Camp.EffectiveLevel));
        Assert.True(report.Loot.Food > 0);
        var axemen = Assert.Single(report.Units);
        Assert.Equal(("axeman", 10), (axemen.Type, axemen.Sent));
        Assert.Equal(new[] { "young", "adult" }, report.Beasts.Select(b => b.Tier));
        Assert.All(report.Beasts, b => Assert.Equal(b.Before, b.Lost));

        // What the survivors could not carry stays at the camp.
        Assert.Equal(450, report.Loot.Food + camp.Leftover.Food);

        // The owner reads the same report by id.
        var byId = await client.GetFromJsonAsync<CampReportResponse>(
            $"/api/v1/camp-reports/{report.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(report.Id, byId!.Id);

        // The cleared hex is buildable now.
        var built = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds", new QueueBuildRequest("reindeerherder", campHex.Q, campHex.R), Ct);
        Assert.True(built.IsSuccessStatusCode, await built.Content.ReadAsStringAsync(Ct));
    }

    [Fact]
    public async Task A_hunt_at_a_cleared_camp_picks_up_the_leftover_without_clearing_it_again()
    {
        using var client = Client();
        var (worldId, settlement, campHex, _) = await SetUpAsync(client);
        var first = await (await HuntAsync(client, settlement.Id, campHex)).ReadStrictAsync<ArmyResponse>(Ct);
        await ResolveHuntAsync(client, first.Id);
        var leftover = (await CampAtAsync(client, worldId, campHex)).Leftover;
        Assert.True(leftover.Food > 0, "sanity: 10 axemen cannot carry the whole pool");

        var second = await (await HuntAsync(client, settlement.Id, campHex)).ReadStrictAsync<ArmyResponse>(Ct);
        await ResolveHuntAsync(client, second.Id);

        var camp = await CampAtAsync(client, worldId, campHex);
        Assert.Equal(1, camp.Clears);
        Assert.True(camp.Empty);

        var reports = (await CampReportsAsync(client, settlement.Id))!;
        Assert.Equal(2, reports.Count);
        var pickup = reports[0];
        Assert.Equal("army", pickup.Winner);
        Assert.False(pickup.CampCleared);
        Assert.Empty(pickup.Beasts);
        Assert.True(pickup.Loot.Food > 0);
        Assert.Equal(leftover.Food, pickup.Loot.Food + camp.Leftover.Food);
    }

    [Fact]
    public async Task A_lost_hunt_destroys_the_army_and_the_camp_keeps_its_survivors()
    {
        using var client = Client();
        var (worldId, settlement, campHex, _) = await SetUpAsync(client, CampFamilies.Wolfden, level: 5);
        var army = await (await HuntAsync(client, settlement.Id, campHex, count: 2)).ReadStrictAsync<ArmyResponse>(Ct);

        await ResolveHuntAsync(client, army.Id);

        var camp = await CampAtAsync(client, worldId, campHex);
        Assert.False(camp.Empty);
        Assert.Equal(0, camp.Clears);
        Assert.NotNull(camp.CalmUntil);
        Assert.False(camp.Aggressive);

        var report = Assert.Single((await CampReportsAsync(client, settlement.Id))!);
        Assert.Equal("camp", report.Winner);
        Assert.False(report.CampCleared);
        Assert.True(report.Loot.Wood + report.Loot.Stone + report.Loot.Food + report.Loot.Iron == 0);
        Assert.Equal(2, Assert.Single(report.Units).Lost);

        // The two axemen are gone, not back home.
        var home = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(18, home!.Garrison.Single(g => g.Unit == "axeman").Count);
    }

    [Fact]
    public async Task A_camp_report_is_only_readable_by_the_settlements_owner()
    {
        using var client = Client();
        var (_, settlement, campHex, _) = await SetUpAsync(client);
        var army = await (await HuntAsync(client, settlement.Id, campHex)).ReadStrictAsync<ArmyResponse>(Ct);
        await ResolveHuntAsync(client, army.Id);
        var report = Assert.Single((await CampReportsAsync(client, settlement.Id))!);

        using var stranger = Client();
        stranger.DefaultRequestHeaders.Add("X-Owner-Id", "someone-else");

        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GetAsync($"/api/v1/camp-reports/{report.Id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GetAsync($"/api/v1/settlements/{settlement.Id}/camp-reports", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/v1/camp-reports/{Guid.NewGuid()}", Ct)).StatusCode);
    }
}
