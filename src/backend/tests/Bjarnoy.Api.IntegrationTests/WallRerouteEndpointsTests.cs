using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <c>docs/design/troop-movement-range.md</c> §5, "Walls built after an army set out block it too": an army already marching looks for a new
/// route when a new wall closes its way, on its way out or home, and only when there is none stops at the last hex before the wall and its
/// owner gets an "army stuck" report. Planted armies on an all-land island walk one hex an hour along r = 0 between q = -6 (home) and q = 6;
/// the walls belong to another player's settlement that is never settled during the test, so a wall raised by a build order only counts
/// through that order (the lazily applied level is not there yet).
/// </summary>
public sealed class WallRerouteEndpointsTests : IAsyncLifetime
{
    private const string Owner = "marching-owner";

    private static readonly HexCoord Home = new(-6, 0);
    private static readonly HexCoord Target = new(6, 0);

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    /// <summary>A single huge all-land island, as <c>ArmyStarvationEndpointsTests.LandOptions</c>.</summary>
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

    private static readonly (int Q, int R)[] Outbound = [.. Enumerable.Range(-6, 13).Select(q => (q, 0))];

    private static readonly (int Q, int R)[] Homeward = [.. Outbound.Reverse()];

    private sealed record Scene(Guid WorldId, Guid ArmyId, DateTimeOffset Start);

    /// <summary>The wall's owner: another player, so its settlement is never settled by the marching owner's requests.</summary>
    private enum WallKind
    {
        /// <summary>Standing (level 1) with its standing instant recorded.</summary>
        Standing,

        /// <summary>A foundation (level 0) whose build order to level 1 completes at the instant.</summary>
        Ordered,
    }

    private async Task<Scene> PlantAsync(
        bool returning, double provisions, IEnumerable<HexCoord> walls, TimeSpan wallAfter, WallKind kind)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var start = _factory.Time.GetUtcNow();
        var world = new WorldEntity { Name = $"w-{Guid.CreateVersion7():N}", MaxPlayers = 100 };
        world.ApplyGenerationOptions(LandOptions);
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
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
        var wallOwner = Settlement("builder-owner", builder.Id, new HexCoord(20, 20));
        db.Settlements.AddRange(home, wallOwner);

        var standsAt = start + wallAfter;
        foreach (var hex in walls)
        {
            wallOwner.Buildings.Add(new PlacedBuildingEntity
            {
                SettlementId = wallOwner.Id, Q = hex.Q, R = hex.R, Type = BuildingType.Palisade,
                Level = kind == WallKind.Standing ? 1 : 0,
                StandingSince = kind == WallKind.Standing ? standsAt : null,
            });
            if (kind == WallKind.Ordered)
            {
                wallOwner.Queue.Add(new BuildOrderEntity
                {
                    SettlementId = wallOwner.Id, Q = hex.Q, R = hex.R, Type = BuildingType.Palisade, TargetLevel = 1,
                    Kind = BuildOrderKind.Build, QueuedAt = start, BaseDuration = wallAfter, StartedAt = start, CompletesAt = standsAt,
                });
            }
        }

        var path = returning ? Homeward : Outbound;
        var back = Homeward;
        List<double> hours = [.. path.Select((_, i) => (double)i)];
        List<double> backHours = [.. back.Select((_, i) => (double)i)];
        var army = new ArmyEntity
        {
            SettlementId = home.Id,
            HomeSpotQ = Home.Q,
            HomeSpotR = Home.R,
            Mission = (int)ArmyMission.Move,
            AtHome = false,
            Provisions = provisions,
            DepartedAt = start,
            Path = [.. path.Select(p => new HexPoint(p.Q, p.R))],
            CumulativeHours = hours,
            EdgeHours = hours,
            ReturnPath = [.. back.Select(p => new HexPoint(p.Q, p.R))],
            ReturnCumulativeHours = backHours,
            ReturnEdgeHours = backHours,
            TurnAroundAt = returning ? start : start + TimeSpan.FromHours(path.Length - 1 + 4),
            IsReturning = returning,
            Stacks = [new ArmyUnitStackEntity { UnitType = UnitType.Spearman, Count = 5 }],
        };
        db.Armies.Add(army);
        await db.SaveChangesAsync(Ct);
        return new Scene(world.Id, army.Id, start);
    }

    /// <summary>A wall line across r = 0 at q = 0 (r -2..2): its middle blocks, its two ends are half open, so an army can get by.</summary>
    private static IEnumerable<HexCoord> LineAcross() => Enumerable.Range(-2, 5).Select(r => new HexCoord(0, r));

    private HttpClient Client()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Owner-Id", Owner);
        return client;
    }

    private async Task<ArmyResponse> ArmyAsync(HttpClient client, Guid armyId) =>
        (await client.GetFromJsonAsync<ArmyResponse>($"/api/v1/armies/{armyId}", SqliteApiFixture.StrictJson, Ct))!;

    private async Task<List<ArmyReportResponse>> ReportsAsync(HttpClient client, Guid worldId) =>
        (await client.GetFromJsonAsync<List<ArmyReportResponse>>($"/api/v1/worlds/{worldId}/army-reports", SqliteApiFixture.StrictJson, Ct))!;

    private static HexPointResponse P(int q, int r) => new(q, r);

    [Fact]
    public async Task An_outbound_army_walks_around_a_wall_whose_order_completed_while_its_owner_never_settled()
    {
        var scene = await PlantAsync(returning: false, 1_000, LineAcross(), TimeSpan.FromHours(2), WallKind.Ordered);
        using var client = Client();

        _factory.Time.Advance(TimeSpan.FromHours(5));
        var army = await ArmyAsync(client, scene.ArmyId);

        var movement = army.Movement!;
        Assert.False(movement.IsReturning);
        Assert.False(movement.IsStranded);
        Assert.Equal(scene.Start + TimeSpan.FromHours(2), movement.DepartedAt);
        Assert.Equal(P(-4, 0), movement.Path[0]);
        Assert.Equal(P(Target.Q, Target.R), movement.Path[^1]);
        Assert.DoesNotContain(P(0, 0), movement.Path);
        Assert.DoesNotContain(P(0, 0), movement.ReturnPath);
        Assert.Empty(await ReportsAsync(client, scene.WorldId));
    }

    [Fact]
    public async Task An_outbound_army_with_no_way_to_its_target_stops_before_the_wall_stands_like_after_a_move_and_reports_it()
    {
        // The target is walled in on every side.
        var scene = await PlantAsync(returning: false, 1_000, Target.Neighbours(), TimeSpan.FromHours(2), WallKind.Standing);
        using var client = Client();

        _factory.Time.Advance(TimeSpan.FromHours(11));
        var army = await ArmyAsync(client, scene.ArmyId);

        Assert.Equal(P(4, 0), army.Position);
        Assert.Equal("move", army.Mission);
        Assert.False(army.Movement!.IsStranded);
        Assert.False(army.Movement.IsReturning);
        Assert.Equal(P(4, 0), army.Movement.Path[^1]);
        Assert.Equal(P(Home.Q, Home.R), army.Movement.ReturnPath[^1]);

        var report = Assert.Single(await ReportsAsync(client, scene.WorldId));
        Assert.Equal("stuck", report.Kind);
        Assert.Equal(scene.ArmyId, report.ArmyId);
        Assert.Equal(P(4, 0), report.Hex);
        Assert.Equal(scene.Start + TimeSpan.FromHours(2), report.OccurredAt);
        Assert.Equal([new ArmyReportUnitLineResponse("spearman", 5)], report.Units);
    }

    [Fact]
    public async Task An_army_on_its_way_home_walks_around_a_new_wall()
    {
        var scene = await PlantAsync(returning: true, 1_000, LineAcross(), TimeSpan.FromHours(2), WallKind.Standing);
        using var client = Client();

        _factory.Time.Advance(TimeSpan.FromHours(4));
        var army = await ArmyAsync(client, scene.ArmyId);

        var movement = army.Movement!;
        Assert.True(movement.IsReturning);
        Assert.Equal(scene.Start + TimeSpan.FromHours(2), movement.DepartedAt);
        Assert.Equal(P(4, 0), movement.Path[0]);
        Assert.Equal(P(Home.Q, Home.R), movement.Path[^1]);
        Assert.DoesNotContain(P(0, 0), movement.Path);
        Assert.Empty(await ReportsAsync(client, scene.WorldId));
    }

    [Fact]
    public async Task An_army_whose_home_is_walled_in_stops_before_the_wall_is_stranded_reports_it_and_starves()
    {
        // 5 spearmen with 60 food: they starve 60 / (5 x upkeep) hours after setting out.
        var scene = await PlantAsync(returning: true, 60, Home.Neighbours(), TimeSpan.FromHours(2), WallKind.Standing);
        using var client = Client();

        _factory.Time.Advance(TimeSpan.FromHours(11));
        var army = await ArmyAsync(client, scene.ArmyId);

        Assert.True(army.Movement!.IsStranded);
        Assert.Equal(P(-4, 0), army.Position);
        Assert.Equal(P(-4, 0), army.Movement.Path[^1]);
        var upkeep = UnitCatalogue.Get(UnitType.Spearman).UpkeepPerHour * 5;
        Assert.Equal(scene.Start + TimeSpan.FromHours(60 / upkeep), army.StarvesAt);

        var stuck = Assert.Single(await ReportsAsync(client, scene.WorldId));
        Assert.Equal("stuck", stuck.Kind);
        Assert.Equal(P(-4, 0), stuck.Hex);

        _factory.Time.Advance(army.StarvesAt!.Value - _factory.Time.GetUtcNow() + TimeSpan.FromMinutes(1));
        var gone = await client.GetAsync($"/api/v1/armies/{scene.ArmyId}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);

        var reports = await ReportsAsync(client, scene.WorldId);
        var starved = Assert.Single(reports, r => r.Kind == "starved");
        Assert.Equal(P(-4, 0), starved.Hex);
    }
}
