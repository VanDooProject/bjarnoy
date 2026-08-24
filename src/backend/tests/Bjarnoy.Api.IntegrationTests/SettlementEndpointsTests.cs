using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The lazy model end to end: through HTTP, the EF model and a real database,
/// with the clock under the test's control.
/// </summary>
public sealed class SettlementEndpointsTests : IAsyncLifetime
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

    /// <summary>Creates a world and founds a settlement on its first usable plot.</summary>
    private async Task<(Guid WorldId, SettlementResponse Settlement)> FoundAsync(
        HttpClient client, int seed = 21, int radius = 60)
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
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf"),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (world.Id, await response.ReadStrictAsync<SettlementResponse>(Ct));
    }

    private Task<SettlementResponse?> GetAsync(HttpClient client, Guid id) =>
        client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{id}", SqliteApiFixture.StrictJson, Ct);

    [Fact]
    public async Task Founding_a_settlement_gives_it_a_longhouse_and_a_starting_stock()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        Assert.Equal("Bjornstad", settlement.Name);
        Assert.Equal(1, settlement.LonghouseLevel);
        Assert.Contains(settlement.Buildings, b => b.Type == "longhouse" && b.Level == 1);
        Assert.True(settlement.Resources.Stock.Wood > 0);
        Assert.True(settlement.Resources.RatePerHour.Wood > 0);
        Assert.Empty(settlement.Queue);
        Assert.True(settlement.World.Running);
    }

    [Fact]
    public async Task A_plot_that_is_not_a_start_position_is_refused()
    {
        using var client = Client();
        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), 21, 60), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, 9999, 9999, "Nowhere", "Ulf"),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task The_same_plot_cannot_be_founded_twice()
    {
        using var client = Client();
        var (worldId, settlement) = await FoundAsync(client);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.Id == settlement.IslandId);

        var again = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, settlement.Q, settlement.R, "Grimhold", "Sigrid"),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
    }

    [Fact]
    public async Task Resources_accrue_between_reads_with_nothing_running_in_between()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        var before = settlement.Resources.Stock.Food;
        var rate = settlement.Resources.RatePerHour.Food;

        _factory.Time.Advance(TimeSpan.FromHours(5));
        var later = await GetAsync(client, settlement.Id);

        // No worker ran, no tick fired: five hours of production is simply what
        // the timestamp implies.
        Assert.Equal(before + (rate * 5), later!.Resources.Stock.Food, 0);
    }

    [Fact]
    public async Task Reading_a_settlement_with_nothing_due_does_not_write_to_the_database()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        var settledAt = await ReadSettledAtAsync(settlement.Id);

        _factory.Time.Advance(TimeSpan.FromHours(3));
        await GetAsync(client, settlement.Id);
        await GetAsync(client, settlement.Id);

        // The stock is only written when it changes. Three hours of accrual and
        // two reads must leave the stored row exactly as it was.
        Assert.Equal(settledAt, await ReadSettledAtAsync(settlement.Id));
    }

    [Fact]
    public async Task A_queued_build_completes_by_clock_on_the_next_read()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        var queued = await QueueFarmAsync(client, settlement);
        Assert.NotNull(queued);

        var duringBuild = await GetAsync(client, settlement.Id);
        Assert.Single(duringBuild!.Queue);
        Assert.DoesNotContain(duringBuild.Buildings, b => b.Type == "farm");

        _factory.Time.Advance(TimeSpan.FromHours(2));
        var afterBuild = await GetAsync(client, settlement.Id);

        Assert.Empty(afterBuild!.Queue);
        Assert.Contains(afterBuild.Buildings, b => b.Type == "farm" && b.Level == 1);
        Assert.True(afterBuild.Resources.RatePerHour.Food > settlement.Resources.RatePerHour.Food);
    }

    [Fact]
    public async Task Queueing_a_build_charges_for_it_immediately()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        var before = settlement.Resources.Stock.Wood;

        Assert.NotNull(await QueueFarmAsync(client, settlement));

        var after = await GetAsync(client, settlement.Id);
        Assert.True(after!.Resources.Stock.Wood < before);
    }

    [Fact]
    public async Task A_building_cannot_be_put_on_terrain_it_does_not_belong_on()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        // A start position is grass with no water within two hexes, so a quarry
        // (mountain only) can never be legal on the centre hex.
        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("quarry", settlement.Q, settlement.R),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_building_name_is_a_400()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("castle", settlement.Q, settlement.R),
            Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_unknown_settlement_is_a_404()
    {
        using var client = Client();

        var response = await client.GetAsync($"/api/v1/settlements/{Guid.CreateVersion7()}", Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task The_building_catalogue_reports_costs_and_allowed_terrain()
    {
        using var client = Client();

        var catalogue = await client.GetFromJsonAsync<List<BuildingDefinitionResponse>>(
            "/api/v1/buildings?level=1", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(catalogue);
        var lumber = catalogue.Single(d => d.Type == "lumberjack");

        Assert.Equal(["forest"], lumber.AllowedTerrain);
        Assert.True(lumber.Cost.Wood > 0);
        Assert.True(lumber.BuildSeconds > 0);
        Assert.True(lumber.ProductionPerHour.Wood > 0);
    }

    // ---------------------------------------------------------------- pausing

    [Fact]
    public async Task A_paused_world_stops_producing()
    {
        using var client = Client();
        var (worldId, settlement) = await FoundAsync(client);

        await PauseAsync(client, worldId, "paused");
        var atPause = await GetAsync(client, settlement.Id);

        _factory.Time.Advance(TimeSpan.FromDays(3));
        var afterPause = await GetAsync(client, settlement.Id);

        Assert.False(afterPause!.World.Running);
        Assert.Equal(atPause!.Resources.Stock.Food, afterPause.Resources.Stock.Food, 0);
    }

    [Fact]
    public async Task A_paused_world_refuses_new_builds()
    {
        using var client = Client();
        var (worldId, settlement) = await FoundAsync(client);

        await PauseAsync(client, worldId, "paused");

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("farm", settlement.Q + 1, settlement.R),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Resuming_gives_back_exactly_the_paused_time()
    {
        using var client = Client();
        var (worldId, settlement) = await FoundAsync(client);

        var beforePause = await GetAsync(client, settlement.Id);
        var rate = beforePause!.Resources.RatePerHour.Food;

        await PauseAsync(client, worldId, "paused");
        _factory.Time.Advance(TimeSpan.FromDays(3));
        await PauseAsync(client, worldId, "running");

        _factory.Time.Advance(TimeSpan.FromHours(2));
        var afterResume = await GetAsync(client, settlement.Id);

        // Three days paused count for nothing; the two hours after count fully.
        Assert.Equal(
            beforePause.Resources.Stock.Food + (rate * 2),
            afterResume!.Resources.Stock.Food,
            0);
    }

    [Fact]
    public async Task A_build_keeps_its_remaining_time_across_a_pause()
    {
        using var client = Client();
        var (worldId, settlement) = await FoundAsync(client);

        Assert.NotNull(await QueueFarmAsync(client, settlement));

        await PauseAsync(client, worldId, "paused");
        _factory.Time.Advance(TimeSpan.FromDays(7));

        var whilePaused = await GetAsync(client, settlement.Id);
        Assert.Single(whilePaused!.Queue);
        // The countdown is suspended, not merely postponed.
        Assert.Null(whilePaused.Queue[0].CompletesInSeconds);

        await PauseAsync(client, worldId, "running");
        _factory.Time.Advance(TimeSpan.FromHours(2));

        var afterResume = await GetAsync(client, settlement.Id);
        Assert.Empty(afterResume!.Queue);
        Assert.Contains(afterResume.Buildings, b => b.Type == "farm");
    }

    [Fact]
    public async Task A_locked_world_finishes_queued_work_but_takes_no_new_orders()
    {
        using var client = Client();
        var (worldId, settlement) = await FoundAsync(client);

        Assert.NotNull(await QueueFarmAsync(client, settlement));
        await PauseAsync(client, worldId, "locked");

        _factory.Time.Advance(TimeSpan.FromHours(2));
        var settled = await GetAsync(client, settlement.Id);

        // Time kept running, so the farm finished.
        Assert.Contains(settled!.Buildings, b => b.Type == "farm");
        Assert.True(settled.World.Running);
        Assert.False(settled.World.AcceptsCommands);

        var refused = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("storagehouse", settlement.Q, settlement.R + 1),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
    }

    [Fact]
    public async Task Maintenance_freezes_the_world_and_resuming_can_credit_grace()
    {
        using var client = Client();
        var (worldId, settlement) = await FoundAsync(client);

        var before = await GetAsync(client, settlement.Id);
        var rate = before!.Resources.RatePerHour.Food;

        await PauseAsync(client, worldId, "maintenance");
        _factory.Time.Advance(TimeSpan.FromHours(1));

        // Resume crediting two extra hours on top of the hour of downtime.
        var resumed = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/state",
            new SetWorldStateRequest("running", GraceSeconds: 2 * 3600),
            Ct);
        Assert.Equal(HttpStatusCode.OK, resumed.StatusCode);

        // One hour frozen plus two credited: game time is now two hours behind
        // where it was when the world stopped.
        var afterResume = await GetAsync(client, settlement.Id);

        // Grace delays what is still to come; it never claws back what was
        // already banked. Resources sit at the last settled figure rather than
        // going backwards.
        Assert.Equal(before.Resources.Stock.Food, afterResume!.Resources.Stock.Food, 0);

        // The two credited hours have to be served before anything accrues again.
        _factory.Time.Advance(TimeSpan.FromHours(2));
        var graceServed = await GetAsync(client, settlement.Id);
        Assert.Equal(before.Resources.Stock.Food, graceServed!.Resources.Stock.Food, 0);

        // And after that, production resumes at the normal rate.
        _factory.Time.Advance(TimeSpan.FromHours(3));
        var running = await GetAsync(client, settlement.Id);
        Assert.Equal(before.Resources.Stock.Food + (rate * 3), running!.Resources.Stock.Food, 0);
    }

    [Fact]
    public async Task An_unknown_world_state_is_a_400()
    {
        using var client = Client();
        var (worldId, _) = await FoundAsync(client);

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/state", new SetWorldStateRequest("banana"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Settlements_are_listed_for_their_world()
    {
        using var client = Client();
        var (worldId, settlement) = await FoundAsync(client);

        var list = await client.GetFromJsonAsync<List<SettlementSummary>>(
            $"/api/v1/worlds/{worldId}/settlements", SqliteApiFixture.StrictJson, Ct);

        var only = Assert.Single(list!);
        Assert.Equal(settlement.Id, only.Id);
        Assert.Equal("Ulf", only.OwnerName);
        Assert.Equal(1, only.LonghouseLevel);
    }

    // ---------------------------------------------------------------- helpers

    private async Task<BuildOrderResponse?> QueueFarmAsync(
        HttpClient client, SettlementResponse settlement)
    {
        // Walk the settlement's own claim for a hex a farm is legal on.
        foreach (var (dq, dr) in new[] { (1, 0), (0, 1), (-1, 1), (1, -1), (-1, 0), (0, -1) })
        {
            var response = await client.PostJsonAsync(
                $"/api/v1/settlements/{settlement.Id}/builds",
                new QueueBuildRequest("farm", settlement.Q + dq, settlement.R + dr),
                Ct);

            if (response.StatusCode == HttpStatusCode.Accepted)
            {
                return await response.ReadStrictAsync<BuildOrderResponse>(Ct);
            }
        }

        return null;
    }

    private async Task PauseAsync(HttpClient client, Guid worldId, string state)
    {
        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/state", new SetWorldStateRequest(state), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private async Task<DateTimeOffset> ReadSettledAtAsync(Guid settlementId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();

        return await db.Settlements
            .AsNoTracking()
            .Where(s => s.Id == settlementId)
            .Select(s => s.SettledAt)
            .FirstAsync(Ct);
    }
}
