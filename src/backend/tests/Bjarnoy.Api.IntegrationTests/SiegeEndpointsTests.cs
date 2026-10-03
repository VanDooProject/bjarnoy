using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The siege mission against a player's palisade end to end (docs/design/endgame.md, "Breaching walls"): dispatch
/// through HTTP, then the lazy arrival that fights the wall owner's standing armies and strikes the wall, with the clock
/// under the test's control. A second class below runs the same scenario on PostgreSQL.
/// </summary>
public sealed class SiegeEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    [Fact]
    public async Task A_siege_dispatch_is_refused_without_a_wall_without_a_siege_unit_and_for_own_and_friendly_walls()
    {
        using var scenario = await SiegeScenario.SetUpAsync(_factory, wallLevel: 3);
        var ulf = scenario.Attacker;

        // No wall on a plain hex next to the real one.
        var noWall = await scenario.DispatchSiegeAsync(ulf, scenario.NearHex, ("ram", 2), ("spearman", 50));
        Assert.Equal("NoWallAtDestination", await noWall.RejectionAsync(Ct));

        // No siege unit in the army.
        var noEngine = await scenario.DispatchSiegeAsync(ulf, scenario.WallHex, ("spearman", 50));
        Assert.Equal("SiegeRequiresSiegeUnit", await noEngine.RejectionAsync(Ct));

        // Ships (and a mixed fleet) are refused too.
        var ships = await scenario.DispatchSiegeAsync(ulf, scenario.WallHex, ("karve", 1));
        Assert.Equal("SiegeRequiresLandUnits", await ships.RejectionAsync(Ct));

        // The wall owner cannot siege its own wall.
        var own = await scenario.DispatchSiegeAsync(scenario.WallOwner, scenario.WallHex, ("ram", 2), ("spearman", 50));
        Assert.Equal("CannotSiegeFriendlyWall", await own.RejectionAsync(Ct));

        // A friend (same guild) is refused as well.
        await scenario.MakeFriendsAsync();
        var friend = await scenario.DispatchSiegeAsync(ulf, scenario.WallHex, ("ram", 2), ("spearman", 50));
        Assert.Equal("CannotSiegeFriendlyWall", await friend.RejectionAsync(Ct));
    }

    [Fact]
    public async Task A_siege_march_ends_on_a_hex_next_to_the_wall_not_on_it()
    {
        using var scenario = await SiegeScenario.SetUpAsync(_factory, wallLevel: 3);

        var dispatched = await scenario.DispatchSiegeAsync(scenario.Attacker, scenario.WallHex, ("ram", 2), ("spearman", 50));
        var army = await scenario.ReadAcceptedAsync(dispatched);

        Assert.Equal("siege", army.Mission);
        var path = army.Movement!.Path.Select(p => new HexCoord(p.Q, p.R)).ToList();
        Assert.Equal(1, path[^1].DistanceTo(scenario.WallHex));
        Assert.DoesNotContain(scenario.WallHex, path);
        Assert.Equal(new HexCoord(scenario.Attacker.Settlement.Q, scenario.Attacker.Settlement.R), army.Movement.ReturnPath.Select(p => new HexCoord(p.Q, p.R)).Last());
    }

    [Fact]
    public async Task An_undefended_wall_is_breached_by_a_single_ram_and_both_players_get_the_report()
    {
        // 1 ram = 40 siege power -> 4 levels, more than the 3 a palisade can have: the hex is freed.
        using var scenario = await SiegeScenario.SetUpAsync(_factory, wallLevel: 3);

        var army = await scenario.ReadAcceptedAsync(
            await scenario.DispatchSiegeAsync(scenario.Attacker, scenario.WallHex, ("ram", 1), ("spearman", 50)));
        await scenario.ArriveAsync(army);

        Assert.Null(await scenario.WallLevelAsync());

        var report = Assert.Single(await scenario.ReportsAsync(scenario.Attacker));
        Assert.Equal("siege", report.Mission);
        Assert.Equal("attacker", report.Winner);
        Assert.NotNull(report.Siege);
        Assert.Equal("palisade", report.Siege!.TargetType);
        Assert.Equal((scenario.WallHex.Q, scenario.WallHex.R), (report.Siege.TargetCoord.Q, report.Siege.TargetCoord.R));
        Assert.Equal((3, 0), (report.Siege.LevelBefore, report.Siege.LevelAfter));
        Assert.False(report.Siege.SettlementRazed);
        Assert.Empty(report.DefenderLines);

        var ownerReport = Assert.Single(await scenario.ReportsAsync(scenario.WallOwner));
        Assert.Equal(report.Id, ownerReport.Id);

        // The army walks home with every unit.
        var returning = await scenario.GetArmyAsync(army.Id);
        Assert.NotNull(returning);
        Assert.True(returning!.Movement!.IsReturning);
        Assert.Equal(1, returning.Stacks.Single(s => s.Unit == "ram").Count);
    }

    [Fact]
    public async Task A_wall_taken_to_level_zero_is_removed_and_its_hex_is_free_again()
    {
        // 3 rams = 120 siege power -> 7 levels, more than the level 3 gate has: the gate is removed.
        using var scenario = await SiegeScenario.SetUpAsync(_factory, wallLevel: 3, BuildingType.PalisadeGate);

        var army = await scenario.ReadAcceptedAsync(
            await scenario.DispatchSiegeAsync(scenario.Attacker, scenario.WallHex, ("ram", 3), ("spearman", 50)));
        await scenario.ArriveAsync(army);

        Assert.Null(await scenario.WallLevelAsync());

        var report = Assert.Single(await scenario.ReportsAsync(scenario.Attacker));
        Assert.Equal("palisadegate", report.Siege!.TargetType);
        Assert.Equal((3, 0), (report.Siege.LevelBefore, report.Siege.LevelAfter));
    }

    [Fact]
    public async Task The_owners_standing_army_next_to_the_wall_fights_first_and_a_won_battle_is_followed_by_the_strike()
    {
        using var scenario = await SiegeScenario.SetUpAsync(_factory, wallLevel: 3);
        var defenderId = await scenario.StandDefendersAsync(("thrall", 5));

        var army = await scenario.ReadAcceptedAsync(
            await scenario.DispatchSiegeAsync(scenario.Attacker, scenario.WallHex, ("ram", 3), ("spearman", 50)));
        await scenario.ArriveAsync(army);

        var report = Assert.Single(await scenario.ReportsAsync(scenario.Attacker));
        Assert.Equal("attacker", report.Winner);
        var defenderLine = Assert.Single(report.DefenderLines);
        Assert.Equal(("thrall", 5, 0), (defenderLine.Unit, defenderLine.Lost, defenderLine.Survived));
        Assert.Null(await scenario.WallLevelAsync());
        Assert.False(await scenario.ArmyExistsAsync(defenderId), "the beaten defenders are gone");
    }

    [Fact]
    public async Task An_army_that_loses_the_battle_never_strikes_the_wall()
    {
        using var scenario = await SiegeScenario.SetUpAsync(_factory, wallLevel: 3);
        await scenario.StandDefendersAsync(("spearman", 3000));

        var army = await scenario.ReadAcceptedAsync(
            await scenario.DispatchSiegeAsync(scenario.Attacker, scenario.WallHex, ("ram", 2), ("spearman", 50)));
        await scenario.ArriveAsync(army);

        var report = Assert.Single(await scenario.ReportsAsync(scenario.Attacker));
        Assert.Equal("defender", report.Winner);
        Assert.Null(report.Siege);
        Assert.Equal(3, await scenario.WallLevelAsync());
        Assert.Null(await scenario.GetArmyAsync(army.Id));
    }

    [Fact]
    public async Task A_wall_that_is_gone_on_arrival_is_not_struck_and_the_army_just_returns()
    {
        using var scenario = await SiegeScenario.SetUpAsync(_factory, wallLevel: 3);
        var army = await scenario.ReadAcceptedAsync(
            await scenario.DispatchSiegeAsync(scenario.Attacker, scenario.WallHex, ("ram", 2), ("spearman", 50)));

        await scenario.RemoveWallAsync();
        await scenario.ArriveAsync(army);

        Assert.Empty(await scenario.ReportsAsync(scenario.Attacker));
        var returning = await scenario.GetArmyAsync(army.Id);
        Assert.NotNull(returning);
        Assert.True(returning!.Movement!.IsReturning);
        Assert.Equal(2, returning.Stacks.Single(s => s.Unit == "ram").Count);
    }

    [Fact]
    public async Task A_wall_that_became_friendly_on_arrival_is_not_struck()
    {
        using var scenario = await SiegeScenario.SetUpAsync(_factory, wallLevel: 3);
        var army = await scenario.ReadAcceptedAsync(
            await scenario.DispatchSiegeAsync(scenario.Attacker, scenario.WallHex, ("ram", 2), ("spearman", 50)));

        await scenario.MakeFriendsAsync();
        await scenario.ArriveAsync(army);

        Assert.Empty(await scenario.ReportsAsync(scenario.Attacker));
        Assert.Equal(3, await scenario.WallLevelAsync());
        Assert.NotNull(await scenario.GetArmyAsync(army.Id));
    }
}

/// <summary>The same dispatch and arrival on PostgreSQL: the new columns and the report flag persist and read back there too.</summary>
public sealed class SiegePostgreSqlTests(PostgreSqlFixture postgres) : IClassFixture<PostgreSqlFixture>
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_siege_dispatches_arrives_and_breaches_the_wall_on_postgresql()
    {
        Assert.SkipWhen(postgres.SkipReason is not null, postgres.SkipReason ?? string.Empty);
        await using var factory = BjarnoyApiFactory.PostgreSql(postgres.ConnectionString);
        await factory.MigrateAsync(Ct);
        using var scenario = await SiegeScenario.SetUpAsync(factory, wallLevel: 3);

        var army = await scenario.ReadAcceptedAsync(
            await scenario.DispatchSiegeAsync(scenario.Attacker, scenario.WallHex, ("ram", 2), ("spearman", 50)));
        Assert.Equal("siege", army.Mission);
        await scenario.ArriveAsync(army);

        Assert.Null(await scenario.WallLevelAsync());
        var report = Assert.Single(await scenario.ReportsAsync(scenario.WallOwner));
        Assert.Equal("siege", report.Mission);
        Assert.Equal((3, 0), (report.Siege!.LevelBefore, report.Siege.LevelAfter));
    }
}

/// <summary>
/// Two players on one island and a lone level-N wall of the second (the "wall owner") two hexes from the first (the attacker),
/// on plain land with plain neighbours; the attacker is granted rams and spearmen by an admin.
/// </summary>
internal sealed class SiegeScenario : IDisposable
{
    internal sealed record Player(SettlementResponse Settlement, AuthResponse Auth, string Username);

    private readonly BjarnoyApiFactory _factory;
    private readonly HttpClient _client;

    private SiegeScenario(
        BjarnoyApiFactory factory, HttpClient client, Guid worldId, Player attacker, Player wallOwner, HexCoord wallHex,
        HexCoord nearHex, HexCoord farSide)
    {
        _factory = factory;
        _client = client;
        WorldId = worldId;
        Attacker = attacker;
        WallOwner = wallOwner;
        WallHex = wallHex;
        NearHex = nearHex;
        FarSideHex = farSide;
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public Guid WorldId { get; }

    public Player Attacker { get; }

    public Player WallOwner { get; }

    public HexCoord WallHex { get; }

    /// <summary>A plain hex that is not a wall: the neighbour of the wall nearest the attacker.</summary>
    public HexCoord NearHex { get; }

    /// <summary>The neighbour of the wall furthest from the attacker: where the owner's defenders stand, off the attacker's route.</summary>
    public HexCoord FarSideHex { get; }

    private static string Unique(string prefix) => $"{prefix}-{Guid.NewGuid():N}"[..20];

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    /// <summary>Signs <paramref name="who"/> in afresh: the test clock jumps hours at a time, which expires an earlier access token.</summary>
    private async Task AuthorizeAsync(Player who)
    {
        var login = await (await _client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(who.Username, "correct-horse-battery"), Ct)).ReadStrictAsync<AuthResponse>(Ct);
        Authorize(_client, login.AccessToken);
    }

    public static async Task<SiegeScenario> SetUpAsync(
        BjarnoyApiFactory factory, int wallLevel, BuildingType wallType = BuildingType.Palisade)
    {
        var client = factory.CreateClient();
        var world = await factory.CreateWorldAsync(Unique("w"), 21, 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.Where(i => i.StartPositions.Count > 3).OrderByDescending(i => i.TileCount).First();

        var attacker = await FoundAsync(client, world.Id, island, island.StartPositions[0], "Ulf");
        var home = new HexCoord(attacker.Settlement.Q, attacker.Settlement.R);
        var rivers = island.RiverTiles.Select(t => new HexCoord(t.Q, t.R)).ToHashSet();

        var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
            $"/api/v1/worlds/{world.Id}/tiles?qMin={home.Q - 5}&qMax={home.Q + 5}&rMin={home.R - 5}&rMax={home.R + 5}",
            SqliteApiFixture.StrictJson, Ct);
        var terrain = chunk!.Tiles.ToDictionary(t => new HexCoord(t.Q, t.R), t => t.Terrain);
        bool Plain(HexCoord c) => terrain.TryGetValue(c, out var t) && t is "grass" or "sand" or "forest" && !rivers.Contains(c);

        var wallHex = terrain.Keys
            .Where(c => c.DistanceTo(home) == 2 && Plain(c) && c.Neighbours().All(Plain))
            .OrderBy(c => c.Q).ThenBy(c => c.R)
            .First();
        var near = wallHex.Neighbours().Where(n => n.DistanceTo(home) == 1).OrderBy(n => n.Q).ThenBy(n => n.R).First();
        var far = wallHex.Neighbours().OrderByDescending(n => n.DistanceTo(home)).ThenBy(n => n.Q).ThenBy(n => n.R).First();

        var ownerPlot = island.StartPositions
            .Where(p => new HexCoord(p.Q, p.R).DistanceTo(home) >= SettlementService.MinimumSpacing)
            .OrderBy(p => new HexCoord(p.Q, p.R).DistanceTo(home))
            .First();
        using var ownerClient = factory.CreateClient();
        var wallOwner = await FoundAsync(ownerClient, world.Id, island, ownerPlot, "Egil");

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            db.PlacedBuildings.Add(new PlacedBuildingEntity
            {
                SettlementId = wallOwner.Settlement.Id,
                Q = wallHex.Q,
                R = wallHex.R,
                Type = wallType,
                Level = wallLevel,
            });
            await db.SaveChangesAsync(Ct);
        }

        var scenario = new SiegeScenario(factory, client, world.Id, attacker, wallOwner, wallHex, near, far);
        await scenario.GrantAsync(attacker.Settlement.Id, ("ram", 5), ("spearman", 200), ("karve", 2));
        return scenario;
    }

    private static async Task<Player> FoundAsync(HttpClient client, Guid worldId, IslandResponse island, TileCoordinate plot, string name)
    {
        var ownerId = Unique("local-owner-");
        var settlement = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, name, name, ownerId), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);
        var username = Unique(name.ToLowerInvariant() + "-");
        var auth = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(username, "correct-horse-battery", ownerId), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        return new Player(settlement, auth, username);
    }

    private async Task GrantAsync(Guid settlementId, params (string Unit, int Count)[] grants)
    {
        var adminName = Unique("admin");
        var admin = await (await _client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(adminName, "correct-horse-battery"), Ct)).ReadStrictAsync<AuthResponse>(Ct);
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            (await db.Users.SingleAsync(u => u.Id == admin.User.Id, Ct)).Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var token = (await (await _client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(adminName, "correct-horse-battery"), Ct)).ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
        Authorize(_client, token);
        foreach (var (unit, count) in grants)
        {
            var granted = await _client.PostJsonAsync(
                $"/api/v1/admin/settlements/{settlementId}/garrison", new AdjustGarrisonRequest(unit, count), Ct);
            Assert.Equal(HttpStatusCode.OK, granted.StatusCode);
        }
    }

    public async Task<HttpResponseMessage> DispatchSiegeAsync(Player who, HexCoord target, params (string Unit, int Count)[] units)
    {
        await AuthorizeAsync(who);
        var spearmen = units.Where(u => u.Unit == "spearman").Sum(u => u.Count);
        return await _client.PostJsonAsync(
            $"/api/v1/settlements/{who.Settlement.Id}/armies",
            new DispatchArmyRequest(
                [.. units.Select(u => new UnitCountRequest(u.Unit, u.Count))], null, new HexPointRequest(target.Q, target.R),
                Math.Min(spearmen * 10, 400), "siege"),
            Ct);
    }

    public async Task<ArmyResponse> ReadAcceptedAsync(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync(Ct));
        return await response.ReadStrictAsync<ArmyResponse>(Ct);
    }

    /// <summary>Moves the clock just past the army's arrival and reads it, which settles the arrival (fight and strike).</summary>
    public async Task ArriveAsync(ArmyResponse army)
    {
        var travel = army.Movement!.ArrivesAt - army.Movement.DepartedAt;
        _factory.Time.Advance(travel + TimeSpan.FromMinutes(5));
        await AuthorizeAsync(Attacker);
        var read = await _client.GetAsync($"/api/v1/armies/{army.Id}", Ct);
        Assert.True(read.StatusCode is HttpStatusCode.OK or HttpStatusCode.NotFound, read.StatusCode.ToString());
    }

    public async Task<ArmyResponse?> GetArmyAsync(Guid armyId)
    {
        await AuthorizeAsync(Attacker);
        var read = await _client.GetAsync($"/api/v1/armies/{armyId}", Ct);
        return read.StatusCode == HttpStatusCode.NotFound ? null : await read.ReadStrictAsync<ArmyResponse>(Ct);
    }

    public async Task<List<BattleReportResponse>> ReportsAsync(Player who)
    {
        await AuthorizeAsync(who);
        return (await _client.GetFromJsonAsync<List<BattleReportResponse>>(
            $"/api/v1/settlements/{who.Settlement.Id}/reports", SqliteApiFixture.StrictJson, Ct))!;
    }

    /// <summary>The wall's level, or null once it is gone.</summary>
    public async Task<int?> WallLevelAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.PlacedBuildings
            .Where(b => b.SettlementId == WallOwner.Settlement.Id && b.Q == WallHex.Q && b.R == WallHex.R)
            .Select(b => (int?)b.Level)
            .SingleOrDefaultAsync(Ct);
    }

    public async Task RemoveWallAsync()
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        db.PlacedBuildings.RemoveRange(db.PlacedBuildings.Where(b => b.SettlementId == WallOwner.Settlement.Id && b.Q == WallHex.Q && b.R == WallHex.R));
        await db.SaveChangesAsync(Ct);
    }

    public async Task<bool> ArmyExistsAsync(Guid armyId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        return await db.Armies.AnyAsync(a => a.Id == armyId, Ct);
    }

    /// <summary>
    /// An army of the wall owner that arrived beside the wall long ago and is still standing there (its turn-around is far in the
    /// future), written straight onto the database: reaching the wall is the owner's own march, not what this test is about.
    /// </summary>
    public async Task<Guid> StandDefendersAsync(params (string Unit, int Count)[] stacks)
    {
        var now = _factory.Time.GetUtcNow();
        var home = new HexCoord(WallOwner.Settlement.Q, WallOwner.Settlement.R);
        var armyId = Guid.CreateVersion7();
        var army = new Army
        {
            Id = armyId,
            SettlementId = WallOwner.Settlement.Id,
            Stacks = [.. stacks.Select(s => new UnitStack(UnitCatalogue.AllTypes.Single(t => t.ToWireName() == s.Unit), s.Count))],
            Location = new ArmyLocation.InTransit(new Movement
            {
                DepartedAt = now - TimeSpan.FromHours(10),
                Path = [home, FarSideHex],
                CumulativeHours = [0, 1],
                ReturnPath = [FarSideHex, home],
                ReturnCumulativeHours = [0, 1],
                TurnAroundAt = now + TimeSpan.FromDays(30),
            }),
            Provisions = 1000,
            Mission = ArmyMission.Move,
        };

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var entity = new ArmyEntity { Id = armyId, SettlementId = WallOwner.Settlement.Id };
        entity.ApplyDomain(army);
        db.Armies.Add(entity);
        await db.SaveChangesAsync(Ct);
        return armyId;
    }

    /// <summary>Puts both players in one guild, so the wall belongs to a friend.</summary>
    public async Task MakeFriendsAsync()
    {
        await AuthorizeAsync(Attacker);
        var created = await _client.PostJsonAsync(
            $"/api/v1/worlds/{WorldId}/guilds", new CreateGuildRequest(Unique("Hird"), "SGE", null), Ct);
        Assert.True(created.IsSuccessStatusCode, await created.Content.ReadAsStringAsync(Ct));
        var guild = await created.ReadStrictAsync<GuildResponse>(Ct);
        await AuthorizeAsync(WallOwner);
        var joined = await _client.PostJsonAsync($"/api/v1/guilds/{guild.Id}/join", new { }, Ct);
        Assert.True(joined.IsSuccessStatusCode, await joined.Content.ReadAsStringAsync(Ct));
    }

    public void Dispose() => _client.Dispose();
}
