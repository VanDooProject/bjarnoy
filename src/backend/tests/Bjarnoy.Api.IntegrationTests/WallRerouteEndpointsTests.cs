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
using Microsoft.EntityFrameworkCore;
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

    /// <summary>One wall hex of the scene, standing (level 1) from <paramref name="After"/> past the start (negative: before it).</summary>
    private sealed record WallPlan(HexCoord Hex, TimeSpan After, bool Gate = false);

    private Task<Scene> PlantAsync(
        bool returning, double provisions, IEnumerable<HexCoord> walls, TimeSpan wallAfter, WallKind kind) =>
        PlantAsync(returning, provisions, walls.Select(h => new WallPlan(h, wallAfter)), kind, guildmate: null);

    /// <param name="guildmate">The marching owner's account when it is a real one in the wall owner's guild (so the wall owner's gates open for it); anonymous otherwise.</param>
    /// <param name="camp">A strong camp (a level 1 wolf den) planted on the island there.</param>
    /// <param name="attack">The army marches to attack an undefended settlement of another player on <see cref="Target"/> instead of moving there.</param>
    private async Task<Scene> PlantAsync(
        bool returning, double provisions, IEnumerable<WallPlan> walls, WallKind kind, Guid? guildmate, HexCoord? camp = null,
        bool attack = false)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var start = _factory.Time.GetUtcNow();
        var world = new WorldEntity { Name = $"w-{Guid.CreateVersion7():N}", MaxPlayers = 100 };
        world.ApplyGenerationOptions(LandOptions);
        db.Worlds.Add(world);
        var island = new IslandEntity { WorldId = world.Id, Name = "Island", CentreQ = 0, CentreR = 0 };
        if (camp is { } campHex)
        {
            island.Camps = [new CampRecord(campHex.Q, campHex.R, CampFamilies.Wolfden, 1, 0)];
        }

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
        if (guildmate is { } marcher)
        {
            var guild = new GuildEntity { WorldId = world.Id, Name = "Wall guild", Tag = "WALL" };
            guild.Memberships.Add(new GuildMembershipEntity { UserId = builder.Id });
            guild.Memberships.Add(new GuildMembershipEntity { UserId = marcher });
            db.Guilds.Add(guild);
        }

        var home = Settlement(Owner, guildmate ?? SystemUserIds.Abandoned, Home);
        var wallOwner = Settlement("builder-owner", builder.Id, new HexCoord(20, 20));
        db.Settlements.AddRange(home, wallOwner);
        SettlementEntity? defender = null;
        if (attack)
        {
            var defenderUser = new UserEntity { UserName = "defender", NormalizedUserName = "DEFENDER", PasswordHash = "hash" };
            db.Users.Add(defenderUser);
            defender = Settlement("defender-owner", defenderUser.Id, Target);
            db.Settlements.Add(defender);
        }

        foreach (var (hex, wallAfter, gate) in walls)
        {
            var standsAt = start + wallAfter;
            var type = gate ? BuildingType.PalisadeGate : BuildingType.Palisade;
            wallOwner.Buildings.Add(new PlacedBuildingEntity
            {
                SettlementId = wallOwner.Id, Q = hex.Q, R = hex.R, Type = type,
                Level = kind == WallKind.Standing ? 1 : 0,
                StandingSince = kind == WallKind.Standing ? standsAt : null,
            });
            if (kind == WallKind.Ordered)
            {
                wallOwner.Queue.Add(new BuildOrderEntity
                {
                    SettlementId = wallOwner.Id, Q = hex.Q, R = hex.R, Type = type, TargetLevel = 1,
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
            Mission = (int)(attack ? ArmyMission.Attack : ArmyMission.Move),
            TargetSettlementId = defender?.Id,
            AtHome = false,
            Provisions = provisions,
            DepartedAt = start,
            RoutePlannedAt = start,
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

    /// <summary>A plain line (0,0)..(0,3) standing since long before the army set out: (0,0), on the army's way, is its half-open end.</summary>
    private static IEnumerable<WallPlan> OldLineEndingOnTheRoute() =>
        Enumerable.Range(0, 4).Select(r => new WallPlan(new HexCoord(0, r), TimeSpan.FromHours(-10)));

    [Fact]
    public async Task An_army_whose_half_open_end_was_closed_by_the_next_piece_re_routes_from_where_it_was_then_and_never_walks_through()
    {
        // At +2 h the owner extends the line by (0,-1): (0,0) is no end any more and blocks; the army reaches it only at +6 h.
        var walls = OldLineEndingOnTheRoute().Append(new WallPlan(new HexCoord(0, -1), TimeSpan.FromHours(2)));
        var scene = await PlantAsync(returning: false, 1_000, walls, WallKind.Standing, guildmate: null);
        using var client = Client();

        _factory.Time.Advance(TimeSpan.FromHours(3));
        var army = await ArmyAsync(client, scene.ArmyId);

        var movement = army.Movement!;
        Assert.False(movement.IsReturning);
        Assert.False(movement.IsStranded);
        Assert.Equal(scene.Start + TimeSpan.FromHours(2), movement.DepartedAt);
        Assert.Equal(P(-4, 0), movement.Path[0]);
        Assert.Equal(P(Target.Q, Target.R), movement.Path[^1]);
        Assert.DoesNotContain(P(0, 0), movement.Path);
        Assert.DoesNotContain(P(0, 0), movement.ReturnPath);

        // Later settles keep that route: the army is not sent back to where it was at +2 h again.
        _factory.Time.Advance(TimeSpan.FromHours(4));
        var later = (await ArmyAsync(client, scene.ArmyId)).Movement!;
        Assert.Equal(movement.DepartedAt, later.DepartedAt);
        Assert.Equal(movement.Path, later.Path);
        Assert.Empty(await ReportsAsync(client, scene.WorldId));
    }

    /// <summary>A wall line across r = 0 at q = 0 (r -2..2) whose middle (0,0) is a gate of the wall owner, standing long before the army set out.</summary>
    private static IEnumerable<WallPlan> OldLineWithGate() =>
        Enumerable.Range(-2, 5).Select(r => new WallPlan(new HexCoord(0, r), TimeSpan.FromHours(-10), Gate: r == 0));

    private const string Password = "correct-horse-battery";

    /// <summary>A real account for the marching owner (signed in with <see cref="SignInAsync"/>).</summary>
    private async Task<(Guid Id, string Name)> RegisterAsync(HttpClient client)
    {
        var name = $"m{Guid.CreateVersion7():N}"[..16];
        var response = await client.PostAsJsonAsync("/api/v1/auth/register", new RegisterRequest(name, Password, null), Ct);
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>(SqliteApiFixture.StrictJson, Ct))!;
        return (auth.User.Id, name);
    }

    /// <summary>Signs <paramref name="name"/> in afresh (the test clock jumps by hours, past an access token's lifetime).</summary>
    private async Task SignInAsync(HttpClient client, string name)
    {
        client.DefaultRequestHeaders.Authorization = null;
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new LoginRequest(name, Password), Ct);
        response.EnsureSuccessStatusCode();
        var auth = (await response.Content.ReadFromJsonAsync<AuthResponse>(SqliteApiFixture.StrictJson, Ct))!;
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", auth.AccessToken);
    }

    private async Task LeaveGuildAsync(Guid userId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        await db.GuildMemberships.Where(m => m.UserId == userId).ExecuteDeleteAsync(Ct);
    }

    [Fact]
    public async Task An_army_that_passed_a_gate_before_its_friendship_ended_is_not_rewound()
    {
        using var client = Client();
        var marcher = await RegisterAsync(client);
        var scene = await PlantAsync(returning: false, 1_000, OldLineWithGate(), WallKind.Standing, marcher.Id);

        // Through the gate at +6 h, while still a guildmate; the friendship ends after that.
        _factory.Time.Advance(TimeSpan.FromHours(8));
        await SignInAsync(client, marcher.Name);
        await ArmyAsync(client, scene.ArmyId);
        await LeaveGuildAsync(marcher.Id);
        _factory.Time.Advance(TimeSpan.FromHours(1));
        await SignInAsync(client, marcher.Name);
        var army = await ArmyAsync(client, scene.ArmyId);

        var movement = army.Movement!;
        Assert.Equal(scene.Start, movement.DepartedAt);
        Assert.Equal(P(Home.Q, Home.R), movement.Path[0]);
        Assert.Contains(P(0, 0), movement.Path);
        Assert.Equal(P(3, 0), army.Position);
    }

    [Fact]
    public async Task An_army_whose_gate_closed_before_it_got_there_re_routes_from_where_it_is_when_settled()
    {
        using var client = Client();
        var marcher = await RegisterAsync(client);
        var scene = await PlantAsync(returning: false, 1_000, OldLineWithGate(), WallKind.Standing, marcher.Id);

        _factory.Time.Advance(TimeSpan.FromHours(2));
        await SignInAsync(client, marcher.Name);
        await ArmyAsync(client, scene.ArmyId);
        await LeaveGuildAsync(marcher.Id);
        _factory.Time.Advance(TimeSpan.FromHours(1));
        await SignInAsync(client, marcher.Name);
        var army = await ArmyAsync(client, scene.ArmyId);

        var movement = army.Movement!;
        Assert.Equal(scene.Start + TimeSpan.FromHours(3), movement.DepartedAt);
        Assert.Equal(P(-3, 0), movement.Path[0]);
        Assert.DoesNotContain(P(0, 0), movement.Path);
        Assert.DoesNotContain(P(0, 0), movement.ReturnPath);
    }

    [Fact]
    public async Task A_stranded_army_still_walking_to_its_stop_stops_before_a_wall_built_on_the_rest_of_the_walk()
    {
        // Its home is walled in at +2 h (it walks on to (-4,0), stranded); at +4 h a wall across its walk goes up at q = 0.
        var walls = Home.Neighbours().Select(h => new WallPlan(h, TimeSpan.FromHours(2)))
            .Concat(LineAcross().Select(h => new WallPlan(h, TimeSpan.FromHours(4))));
        var scene = await PlantAsync(returning: true, 1_000, walls, WallKind.Standing, guildmate: null);
        using var client = Client();

        _factory.Time.Advance(TimeSpan.FromHours(11));
        var army = await ArmyAsync(client, scene.ArmyId);

        Assert.True(army.Movement!.IsStranded);
        Assert.Equal(P(1, 0), army.Position);
        Assert.Equal(P(1, 0), army.Movement.Path[^1]);
        var stuck = (await ReportsAsync(client, scene.WorldId)).Where(r => r.Kind == "stuck").OrderBy(r => r.OccurredAt).ToList();
        Assert.Equal([P(-4, 0), P(1, 0)], stuck.Select(r => r.Hex));
        Assert.Equal(scene.Start + TimeSpan.FromHours(4), stuck[1].OccurredAt);
    }

    [Fact]
    public async Task A_stranded_army_still_walking_to_its_stop_is_ambushed_by_a_strong_camp_on_the_way()
    {
        var range = new Camp(new HexCoord(0, 0), CampFamilies.Wolfden, 1, TileOrientation.E).GuardRange;
        Assert.InRange(range, 1, 5);
        // In guard range of the walk from q = range - 2 on, which the army reaches hours after it was stranded at (4,0).
        var campHex = new HexCoord(-2, range);
        var walls = Home.Neighbours().Select(h => new WallPlan(h, TimeSpan.FromHours(2)));
        var scene = await PlantAsync(returning: true, 1_000, walls, WallKind.Standing, guildmate: null, camp: campHex);
        using var client = Client();

        _factory.Time.Advance(TimeSpan.FromHours(11));
        (await client.GetAsync($"/api/v1/armies/{scene.ArmyId}", Ct)).Dispose();

        var reports = (await client.GetFromJsonAsync<List<CampReportResponse>>(
            $"/api/v1/worlds/{scene.WorldId}/camp-reports", SqliteApiFixture.StrictJson, Ct))!;
        var ambush = Assert.Single(reports);
        Assert.Equal("ambush", ambush.Kind);
        Assert.Equal(scene.ArmyId, ambush.ArmyId);
        Assert.Equal((campHex.Q, campHex.R), (ambush.Camp.Q, ambush.Camp.R));
        Assert.True(ambush.OccurredAt > scene.Start + TimeSpan.FromHours(2));
    }

    /// <summary>A wall line across r = 0 at q = -3 (r -2..2), standing from +4 h: the army passed (-3,0) at +3 h on its way out. With a gate in the middle (another player's, hostile) when asked.</summary>
    private static IEnumerable<WallPlan> LineBehindTheArmy(bool gate = false) =>
        Enumerable.Range(-2, 5).Select(r => new WallPlan(new HexCoord(-3, r), TimeSpan.FromHours(4), Gate: gate && r == 0));

    [Fact]
    public async Task A_wall_built_behind_an_outbound_army_is_found_when_it_turns_around_even_when_it_is_first_settled_after_that()
    {
        // It turns around at +16 h and is first read at +18 h, on its way home.
        var scene = await PlantAsync(returning: false, 1_000, LineBehindTheArmy(), WallKind.Standing, guildmate: null);
        using var client = Client();

        _factory.Time.Advance(TimeSpan.FromHours(18));
        var army = await ArmyAsync(client, scene.ArmyId);

        var movement = army.Movement!;
        Assert.True(movement.IsReturning);
        Assert.Equal(scene.Start + TimeSpan.FromHours(16), movement.DepartedAt);
        Assert.Equal(P(Target.Q, Target.R), movement.Path[0]);
        Assert.Equal(P(Home.Q, Home.R), movement.Path[^1]);
        Assert.DoesNotContain(P(-3, 0), movement.Path);
    }

    [Fact]
    public async Task A_wall_built_behind_an_attacking_army_is_found_on_its_way_home_after_the_battle()
    {
        // It fights at +12 h (the target is undefended) and is first read at +14 h, on its way home.
        var scene = await PlantAsync(returning: false, 1_000, LineBehindTheArmy(), WallKind.Standing, guildmate: null, attack: true);
        using var client = Client();

        _factory.Time.Advance(TimeSpan.FromHours(14));
        var army = await ArmyAsync(client, scene.ArmyId);

        var movement = army.Movement!;
        Assert.True(movement.IsReturning);
        Assert.Equal(scene.Start + TimeSpan.FromHours(12), movement.DepartedAt);
        Assert.Equal(P(Home.Q, Home.R), movement.Path[^1]);
        Assert.DoesNotContain(P(-3, 0), movement.Path);
    }

    [Fact]
    public async Task A_hostile_gate_built_behind_an_outbound_army_is_found_when_it_turns_around_not_only_when_it_is_settled()
    {
        var scene = await PlantAsync(returning: false, 1_000, LineBehindTheArmy(gate: true), WallKind.Standing, guildmate: null);
        using var client = Client();

        _factory.Time.Advance(TimeSpan.FromHours(18));
        var army = await ArmyAsync(client, scene.ArmyId);

        var movement = army.Movement!;
        Assert.True(movement.IsReturning);
        Assert.Equal(scene.Start + TimeSpan.FromHours(16), movement.DepartedAt);
        Assert.Equal(P(Target.Q, Target.R), movement.Path[0]);
        Assert.DoesNotContain(P(-3, 0), movement.Path);
    }

    [Fact]
    public async Task A_wall_whose_instant_turns_out_to_lie_before_the_route_was_planned_is_still_walked_around()
    {
        // A waiting order gets its instants, in the past, only when its owner settles: here the line stood an hour before the army
        // planned its route straight through the middle (0,0), and nothing changed after that.
        var scene = await PlantAsync(returning: false, 1_000, LineAcross(), TimeSpan.FromHours(-1), WallKind.Standing);
        using var client = Client();

        _factory.Time.Advance(TimeSpan.FromHours(2));
        var army = await ArmyAsync(client, scene.ArmyId);

        var movement = army.Movement!;
        Assert.False(movement.IsReturning);
        Assert.Equal(P(Target.Q, Target.R), movement.Path[^1]);
        Assert.DoesNotContain(P(0, 0), movement.Path);
        Assert.DoesNotContain(P(0, 0), movement.ReturnPath);
    }
}
