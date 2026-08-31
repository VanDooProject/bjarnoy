using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

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

    /// <summary>This suite's one client-local id — see FoundAsync's own X-Owner-Id remark.</summary>
    private const string OwnerId = "ulf-player";

    /// <summary>
    /// Creates a world and founds a settlement on its first usable plot.
    /// Also sets <paramref name="client"/>'s default <c>X-Owner-Id</c> header
    /// to <see cref="OwnerId"/> — the id the settlement was just founded
    /// under — so every other test in this file that goes on to mutate the
    /// settlement (build, train) needs no ownership boilerplate of its own;
    /// see SettlementOwnershipEndpointFilter. Tests that specifically probe
    /// the ownership boundary (the "ownership" region below) override or
    /// remove this header themselves afterwards.
    /// </summary>
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
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", OwnerId),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", OwnerId);

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
            new FoundSettlementRequest(island.Id, 9999, 9999, "Nowhere", "Ulf", "ulf-player"),
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
            new FoundSettlementRequest(island.Id, settlement.Q, settlement.R, "Grimhold", "Sigrid", "sigrid-player"),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        // The frontend picks its reaction off this field, not the 409
        // status alone (see LandingView.vue's foundHere) — PlotTaken means
        // "someone beat you here, try another plot", not "you already have
        // a settlement".
        Assert.Equal("PlotTaken", await again.RejectionAsync(Ct));
    }

    [Fact]
    public async Task A_player_cannot_found_a_second_settlement_in_the_same_world()
    {
        using var client = Client();
        var (worldId, settlement) = await FoundAsync(client);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);
        // A different island's start position: still a legal plot on its own,
        // so only the per-player rule (checked ahead of spacing) can refuse it.
        var island = islands!.First(i => i.Id != settlement.IslandId && i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        // Same OwnerId as the settlement FoundAsync already created ("ulf-player"),
        // a different name and a different, otherwise-perfectly-legal plot.
        var again = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Second realm", "Ulf", "ulf-player"),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, again.StatusCode);
        // Distinguishes this from PlotTaken/TooCloseToNeighbour: this is the
        // one rejection where the frontend should navigate the player to
        // their existing settlement instead of retrying on the landing page.
        Assert.Equal("AlreadyFounded", await again.RejectionAsync(Ct));

        var list = await client.GetFromJsonAsync<List<SettlementSummary>>(
            $"/api/v1/worlds/{worldId}/settlements", SqliteApiFixture.StrictJson, Ct);
        Assert.Single(list!);
    }

    [Fact]
    public async Task A_different_player_can_found_alongside_an_existing_settlement()
    {
        using var client = Client();
        var (worldId, settlement) = await FoundAsync(client);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);
        // A different island entirely, so this can never collide with the
        // spacing rule — only the per-player uniqueness this test targets.
        var island = islands!.First(i => i.Id != settlement.IslandId && i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var again = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Second realm", "Sigrid", "sigrid-player"),
            Ct);

        Assert.Equal(HttpStatusCode.Created, again.StatusCode);
    }

    /// <summary>
    /// Regression coverage for the fix scoping <c>MinimumSpacing</c> to the
    /// same island: raising that constant to cover the worst-case border
    /// overlap (two max-level longhouses — see <c>Settlement.MaxClaimRadius</c>)
    /// used to reject foundings on two separate, unrelated islands purely
    /// because their start positions happened to be within that many hexes
    /// of each other — even though separate islands are always divided by
    /// open sea and their claim discs can never overlap any real land.
    /// </summary>
    [Fact]
    public async Task Spacing_is_enforced_within_an_island_but_never_across_separate_islands()
    {
        using var client = Client();
        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), 21, 60), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);

        // Two start positions on the very same island, closer together than
        // MinimumSpacing — with an island's start positions this dense
        // (FindStartPositions places one on every qualifying grass hex),
        // any pair within a real island is essentially guaranteed to have
        // at least one such pair.
        (Guid IslandId, TileCoordinate First, TileCoordinate Second)? sameIsland = null;
        foreach (var island in islands!)
        {
            for (var i = 0; i < island.StartPositions.Count && sameIsland is null; i++)
            {
                for (var j = i + 1; j < island.StartPositions.Count; j++)
                {
                    var a = new HexCoord(island.StartPositions[i].Q, island.StartPositions[i].R);
                    var b = new HexCoord(island.StartPositions[j].Q, island.StartPositions[j].R);
                    if (a.DistanceTo(b) < SettlementService.MinimumSpacing)
                    {
                        sameIsland = (island.Id, island.StartPositions[i], island.StartPositions[j]);
                        break;
                    }
                }
            }

            if (sameIsland is not null)
            {
                break;
            }
        }

        Assert.True(sameIsland is not null, "Seed 21/radius 60 no longer has an island dense enough to exercise same-island spacing.");
        var (islandId, first, second) = sameIsland!.Value;

        var founded = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(islandId, first.Q, first.R, "First realm", "Ulf", Unique("owner")),
            Ct);
        Assert.Equal(HttpStatusCode.Created, founded.StatusCode);

        var rejected = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(islandId, second.Q, second.R, "Second realm", "Sigrid", Unique("owner")),
            Ct);
        Assert.Equal(HttpStatusCode.Conflict, rejected.StatusCode);
        Assert.Equal("TooCloseToNeighbour", await rejected.RejectionAsync(Ct));

        // A start position on a *different* island, just as close to the
        // first settlement by raw hex distance, must still found cleanly.
        var firstCentre = new HexCoord(first.Q, first.R);
        (Guid IslandId, TileCoordinate Plot)? crossIsland = null;
        foreach (var island in islands.Where(i => i.Id != islandId))
        {
            var close = island.StartPositions.FirstOrDefault(
                p => new HexCoord(p.Q, p.R).DistanceTo(firstCentre) < SettlementService.MinimumSpacing);
            if (close is not null)
            {
                crossIsland = (island.Id, close);
                break;
            }
        }

        Assert.True(crossIsland is not null, "Seed 21/radius 60 no longer has two islands close enough to exercise cross-island spacing.");
        var (crossIslandId, crossPlot) = crossIsland!.Value;

        var crossFounded = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(crossIslandId, crossPlot.Q, crossPlot.R, "Third realm", "Astrid", Unique("owner")),
            Ct);
        Assert.Equal(HttpStatusCode.Created, crossFounded.StatusCode);
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
        Assert.False(lumber.RequiresCoastalWater);
        Assert.True(lumber.Cost.Wood > 0);
        Assert.True(lumber.BuildSeconds > 0);
        Assert.True(lumber.ProductionPerHour.Wood > 0);

        var fishingHut = catalogue.Single(d => d.Type == "fishinghut");
        Assert.True(fishingHut.RequiresCoastalWater);
        Assert.Empty(fishingHut.AllowedTerrain);
    }

    [Fact]
    public async Task A_fishing_hut_can_be_built_on_coastal_water_and_reports_its_orientation()
    {
        using var client = Client();

        // Seed 1 is arbitrary — chosen only because (checked by inspection)
        // it has an island whose start position reaches coastal water within
        // 3 hexes, so a level-4 longhouse's claim (radius 1 + level/2) can
        // reach the shore without an excessive number of upgrades here.
        // Everything past that is found dynamically through the same API a
        // player would use, not hard-coded.
        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), 1, 60), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);

        TileCoordinate? start = null;
        HexCoord waterCoord = default;
        foreach (var island in islands!)
        {
            foreach (var candidate in island.StartPositions)
            {
                var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
                    $"/api/v1/worlds/{world.Id}/tiles?qMin={candidate.Q - 3}&qMax={candidate.Q + 3}"
                    + $"&rMin={candidate.R - 3}&rMax={candidate.R + 3}",
                    SqliteApiFixture.StrictJson, Ct);

                var candidateCentre = new HexCoord(candidate.Q, candidate.R);
                var water = chunk!.Tiles.FirstOrDefault(t =>
                    t.IsCoastalWater && candidateCentre.DistanceTo(new HexCoord(t.Q, t.R)) <= 3);

                if (water is not null)
                {
                    start = candidate;
                    waterCoord = new HexCoord(water.Q, water.R);
                    break;
                }
            }

            if (start is not null)
            {
                break;
            }
        }

        Assert.NotNull(start);
        var foundStart = start!;

        var founded = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(
                islands!.First(i => i.StartPositions.Contains(foundStart)).Id,
                foundStart.Q, foundStart.R, "Sjostad", "Ulf", OwnerId),
            Ct);
        Assert.Equal(HttpStatusCode.Created, founded.StatusCode);
        client.DefaultRequestHeaders.Add("X-Owner-Id", OwnerId);
        var settlement = await founded.ReadStrictAsync<SettlementResponse>(Ct);
        var centre = new HexCoord(settlement.Q, settlement.R);

        // Claim radius is 1 + longhouseLevel/2 — grow to level 4 (radius 3)
        // so the shore found above is actually reachable. Each level costs
        // more than the settlement can afford right away (cost grows faster
        // than a single longhouse's own production), so a rejected attempt
        // just means "not stocked up yet" — advance time and retry rather
        // than treating it as a failure, bounded so a real regression still
        // fails loudly instead of spinning.
        for (var attempt = 0; settlement.LonghouseLevel < 4; attempt++)
        {
            Assert.True(attempt < 40, $"longhouse stuck at level {settlement.LonghouseLevel} after {attempt} attempts");

            var upgrade = await client.PostJsonAsync(
                $"/api/v1/settlements/{settlement.Id}/builds",
                new QueueBuildRequest("longhouse", settlement.Q, settlement.R),
                Ct);

            if (upgrade.StatusCode == HttpStatusCode.Accepted)
            {
                _factory.Time.Advance(TimeSpan.FromHours(2));
            }
            else
            {
                // Still saving up for this level — wait longer and retry.
                _factory.Time.Advance(TimeSpan.FromHours(24));
            }

            settlement = (await GetAsync(client, settlement.Id))!;
        }

        Assert.True(centre.DistanceTo(waterCoord) <= settlement.ClaimRadius);

        HttpResponseMessage queued;
        var queueAttempt = 0;
        while (true)
        {
            Assert.True(queueAttempt++ < 20, "fishing hut never became affordable");

            queued = await client.PostJsonAsync(
                $"/api/v1/settlements/{settlement.Id}/builds",
                new QueueBuildRequest("fishinghut", waterCoord.Q, waterCoord.R),
                Ct);
            if (queued.StatusCode == HttpStatusCode.Accepted)
            {
                break;
            }

            _factory.Time.Advance(TimeSpan.FromHours(6));
            settlement = (await GetAsync(client, settlement.Id))!;
        }

        _factory.Time.Advance(TimeSpan.FromHours(1));
        settlement = (await GetAsync(client, settlement.Id))!;

        var hut = settlement.Buildings.Single(b => b.Type == "fishinghut");
        Assert.Equal(1, hut.Level);
        Assert.NotNull(hut.Orientation);

        var expectedOrientation = new TerrainSampler(WorldGenerationOptions.ForSeed(1) with { Radius = 60 })
            .FishingHutOrientation(waterCoord, centre)
            .ToWireName();
        Assert.Equal(expectedOrientation, hut.Orientation);
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
    public async Task A_build_orders_total_seconds_stays_fixed_across_polls()
    {
        // Issue #99: the client needs the order's full duration, not just its
        // remaining time, to compute progress without the bar snapping back
        // on every poll — see BuildQueuePanel.vue.
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        var queued = await QueueFarmAsync(client, settlement);
        Assert.NotNull(queued);
        Assert.True(queued!.TotalSeconds > 0);

        _factory.Time.Advance(TimeSpan.FromSeconds(30));
        var polled = await GetAsync(client, settlement.Id);

        Assert.Single(polled!.Queue);
        Assert.Equal(queued.TotalSeconds, polled.Queue[0].TotalSeconds, 3);
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
        using var adminClient = await AdminClientAsync();
        var resumed = await adminClient.PostJsonAsync(
            $"/api/v1/admin/worlds/{worldId}/run-state",
            new SetWorldRunStateRequest("resume", GraceMinutes: 2 * 60),
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

        using var adminClient = await AdminClientAsync();
        var response = await adminClient.PostJsonAsync(
            $"/api/v1/admin/worlds/{worldId}/run-state", new SetWorldRunStateRequest("banana"), Ct);

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

    // ------------------------------------------------------------- ownership

    [Fact]
    public async Task Build_is_refused_with_no_owner_header()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("farm", settlement.Q + 1, settlement.R),
            Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Build_is_refused_with_someone_elses_owner_header()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", "someone-else");

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("farm", settlement.Q + 1, settlement.R),
            Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Build_succeeds_with_the_founding_browsers_own_owner_header()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        // FoundAsync already set X-Owner-Id to its own OwnerId — the
        // founding browser's client-local id — so nothing more to arrange.

        Assert.NotNull(await QueueFarmAsync(client, settlement));
    }

    [Fact]
    public async Task Train_units_is_refused_for_a_settlement_with_a_different_owner()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", "someone-else");

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/units",
            new TrainUnitsRequest("thrall", 1),
            Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task A_claimed_settlement_refuses_a_build_from_a_different_account()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        await ClaimAsync(client, "ulf-player");

        // A different, unrelated account — proves the settlement's specific
        // claim is what's checked, not merely "any authenticated caller".
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await RegisterAsync(client, Unique("rival")));

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("farm", settlement.Q + 1, settlement.R),
            Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task A_claimed_settlement_accepts_a_build_from_its_own_account()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        var ownerToken = await ClaimAsync(client, "ulf-player");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", ownerToken);

        Assert.NotNull(await QueueFarmAsync(client, settlement));
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

    /// <summary>
    /// World pause/lock/maintenance/resume, as a test fixture rather than the
    /// thing under test — routed through the real admin surface
    /// (<c>POST /api/v1/admin/worlds/{id}/run-state</c>) since the endpoint
    /// this used to hit (an unauthenticated duplicate at
    /// <c>POST /api/v1/worlds/{id}/state</c>) was removed as a bypass of the
    /// Admin policy the real one enforces — see
    /// docs/codebase-gap-analysis.md.
    /// </summary>
    private async Task PauseAsync(HttpClient client, Guid worldId, string state)
    {
        var action = state switch
        {
            "paused" => "pause",
            "running" => "resume",
            "locked" => "lock",
            "maintenance" => "maintenance",
            _ => throw new ArgumentOutOfRangeException(nameof(state), state, "Unknown world state."),
        };

        using var adminClient = await AdminClientAsync();
        var response = await adminClient.PostJsonAsync(
            $"/api/v1/admin/worlds/{worldId}/run-state", new SetWorldRunStateRequest(action), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    /// <summary>Registers a fresh account, with no settlement claim, returning its access token.</summary>
    private async Task<string> RegisterAsync(HttpClient client, string userName)
    {
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        return (await registered.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
    }

    /// <summary>
    /// Registers a fresh account claiming every unclaimed settlement founded
    /// under the client-local <paramref name="ownerId"/> (see
    /// <c>AuthService.RegisterAsync</c>'s <c>existingOwnerId</c>), returning
    /// its access token.
    /// </summary>
    private async Task<string> ClaimAsync(HttpClient client, string ownerId)
    {
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register",
            new RegisterRequest(Unique("owner"), "correct-horse-battery", ownerId),
            Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        return (await registered.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
    }

    /// <summary>An HTTP client already carrying a fresh admin's access token.</summary>
    private async Task<HttpClient> AdminClientAsync()
    {
        var client = _factory.CreateClient();

        var userName = Unique("admin");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);

        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == auth.User.Id, Ct);
            user.Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var loggedIn = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);
        var token = (await loggedIn.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
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
