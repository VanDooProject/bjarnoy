using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Units;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The admin god-mode surface added by issue #105: instant build, the
/// graphical editor's layout/place/raze endpoints, direct troop creation, the
/// army editor, and admin world creation — plus the 401/403 matrix each of
/// them sits behind.
/// </summary>
public sealed class AdminGodModeEndpointsTests : IAsyncLifetime
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

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    private async Task<string> CreateAdminTokenAsync(HttpClient client)
    {
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
        return (await loggedIn.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
    }

    private async Task<string> CreatePlayerTokenAsync(HttpClient client)
    {
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("player"), "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        return (await registered.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
    }

    private async Task<(Guid WorldId, SettlementResponse Settlement)> FoundAsync(
        HttpClient client, string ownerName = "Ulf", int seed = 21, int radius = 60)
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
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", ownerName, $"{ownerName}-player"),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (world.Id, await response.ReadStrictAsync<SettlementResponse>(Ct));
    }

    [Fact]
    public async Task Anonymous_and_player_callers_are_refused_every_new_god_mode_route()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);

        string[] routes =
        [
            $"/api/v1/admin/settlements/{settlement.Id}/layout",
            "/api/v1/admin/armies?worldId=" + Guid.CreateVersion7(),
        ];

        foreach (var route in routes)
        {
            using var anonymous = Client();
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(route, Ct)).StatusCode);

            using var player = Client();
            Authorize(player, await CreatePlayerTokenAsync(player));
            Assert.Equal(HttpStatusCode.Forbidden, (await player.GetAsync(route, Ct)).StatusCode);
        }

        using var playerWriting = Client();
        Authorize(playerWriting, await CreatePlayerTokenAsync(playerWriting));

        var queue = await playerWriting.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/queue/complete", new CompleteQueuesRequest(), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, queue.StatusCode);

        var garrison = await playerWriting.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/garrison", new AdjustGarrisonRequest("thrall", 5), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, garrison.StatusCode);

        var world = await playerWriting.PostJsonAsync(
            "/api/v1/admin/worlds", new CreateWorldRequest(Unique("w"), 7, 40), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, world.StatusCode);
    }

    [Fact]
    public async Task Instant_build_finishes_a_queued_build_that_would_otherwise_take_hours()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        // Fill the coffers first so the upgrade is affordable outright rather
        // than after a wait — the wait is what this test is removing.
        await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/resources",
            new GrantResourcesRequest(Wood: 100_000, Stone: 100_000, Food: 100_000, Iron: 100_000), Ct);

        var queued = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("longhouse", settlement.Q, settlement.R), Ct);
        Assert.Equal(HttpStatusCode.Accepted, queued.StatusCode);

        var stillRunning = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/admin/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Single(stillRunning!.Queue);

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/queue/complete", new CompleteQueuesRequest(), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var completed = await response.ReadStrictAsync<CompleteQueuesResponse>(Ct);

        Assert.Equal(1, completed.CompletedBuilds);
        Assert.Empty(completed.Settlement.Queue);
        Assert.Equal(2, completed.Settlement.LonghouseLevel);
    }

    [Fact]
    public async Task Instant_build_lands_a_training_batch_in_the_garrison()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/resources",
            new GrantResourcesRequest(Wood: 100_000, Stone: 100_000, Food: 100_000, Iron: 100_000), Ct);

        var queued = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/units", new TrainUnitsRequest("thrall", 3), Ct);
        Assert.Equal(HttpStatusCode.Accepted, queued.StatusCode);

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/queue/complete", new CompleteQueuesRequest(), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var completed = await response.ReadStrictAsync<CompleteQueuesResponse>(Ct);

        Assert.Equal(1, completed.CompletedTraining);
        Assert.Empty(completed.Settlement.TrainingQueue);
        Assert.Equal(3, completed.Settlement.Garrison.Single(s => s.Unit == "thrall").Count);
    }

    [Fact]
    public async Task Instant_build_on_an_unknown_settlement_is_a_404()
    {
        using var client = Client();
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{Guid.CreateVersion7()}/queue/complete", new CompleteQueuesRequest(), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task The_layout_covers_every_claimed_hex_and_marks_the_longhouse()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var layout = await client.GetFromJsonAsync<AdminSettlementLayoutResponse>(
            $"/api/v1/admin/settlements/{settlement.Id}/layout", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(layout);
        Assert.Equal(settlement.ClaimRadius, layout.ClaimRadius);

        // A hex disc of radius r holds 3r(r+1)+1 hexes.
        var r = layout.ClaimRadius;
        Assert.Equal((3 * r * (r + 1)) + 1, layout.Hexes.Count);

        var centre = layout.Hexes.Single(h => h.IsCentre);
        Assert.Equal(settlement.Q, centre.Q);
        Assert.Equal("longhouse", centre.Building);
        Assert.Equal(settlement.LonghouseLevel, centre.Level);
        Assert.Contains("farm", layout.BuildingTypes);
    }

    [Fact]
    public async Task Admin_can_place_a_building_on_an_empty_hex_and_raze_it_again()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var layout = await client.GetFromJsonAsync<AdminSettlementLayoutResponse>(
            $"/api/v1/admin/settlements/{settlement.Id}/layout", SqliteApiFixture.StrictJson, Ct);

        // Which building is legal depends on the hex's terrain, and a start
        // position's neighbours are whatever the generator put there — so the
        // test follows the terrain rather than assuming grass is on offer.
        var (target, building) = FirstBuildableHex(layout!);

        var placed = await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/buildings/{target.Q}/{target.R}",
            new PlaceBuildingRequest(building, 4), Ct);

        Assert.Equal(HttpStatusCode.OK, placed.StatusCode);
        var withBuilding = await placed.ReadStrictAsync<SettlementResponse>(Ct);
        var built = withBuilding.Buildings.Single(b => b.Q == target.Q && b.R == target.R);
        Assert.Equal(building, built.Type);
        Assert.Equal(4, built.Level);

        var razed = await client.DeleteAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/buildings/{target.Q}/{target.R}", Ct);

        Assert.Equal(HttpStatusCode.OK, razed.StatusCode);
        var withoutBuilding = await razed.ReadStrictAsync<SettlementResponse>(Ct);
        Assert.DoesNotContain(withoutBuilding.Buildings, b => b.Q == target.Q && b.R == target.R);
    }

    [Fact]
    public async Task Razing_the_longhouse_and_placing_a_second_one_are_both_refused()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var razed = await client.DeleteAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/buildings/{settlement.Q}/{settlement.R}", Ct);
        Assert.Equal(HttpStatusCode.BadRequest, razed.StatusCode);

        var layout = await client.GetFromJsonAsync<AdminSettlementLayoutResponse>(
            $"/api/v1/admin/settlements/{settlement.Id}/layout", SqliteApiFixture.StrictJson, Ct);
        // Terrain is irrelevant here: PlaceBuilding rejects a second longhouse
        // before it ever looks at what the hex is made of.
        var empty = layout!.Hexes.First(h => !h.IsCentre && h.Building is null);

        var second = await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/buildings/{empty.Q}/{empty.R}",
            new PlaceBuildingRequest("longhouse", 1), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
    }

    [Fact]
    public async Task Admin_can_create_troops_straight_into_the_garrison_and_take_them_away_again()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var created = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/garrison",
            new AdjustGarrisonRequest("spearman", 12), Ct);

        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var withTroops = await created.ReadStrictAsync<SettlementResponse>(Ct);
        Assert.Equal(12, withTroops.Garrison.Single(s => s.Unit == "spearman").Count);

        var removed = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/garrison",
            new AdjustGarrisonRequest("spearman", -12), Ct);

        Assert.Equal(HttpStatusCode.OK, removed.StatusCode);
        var emptied = await removed.ReadStrictAsync<SettlementResponse>(Ct);
        Assert.DoesNotContain(emptied.Garrison, s => s.Unit == "spearman");
    }

    [Fact]
    public async Task Creating_troops_of_an_unknown_type_or_removing_too_many_is_refused()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var unknown = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/garrison",
            new AdjustGarrisonRequest("dragon", 1), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);

        var tooMany = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/garrison",
            new AdjustGarrisonRequest("thrall", -1), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, tooMany.StatusCode);
    }

    [Fact]
    public async Task Admin_can_retime_an_army_so_it_arrives_now_and_move_it_to_another_hex()
    {
        using var client = Client();
        var (worldId, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var armyId = await PlantArmyAsync(settlement);

        var listed = await client.GetFromJsonAsync<List<AdminArmyResponse>>(
            $"/api/v1/admin/armies?worldId={worldId}", SqliteApiFixture.StrictJson, Ct);
        Assert.Single(listed!, a => a.Army.Id == armyId);

        var retimed = await client.PatchJsonAsync(
            $"/api/v1/admin/armies/{armyId}", new AdminEditArmyRequest(ArriveInMinutes: 0), Ct);

        Assert.Equal(HttpStatusCode.OK, retimed.StatusCode);
        var landed = await retimed.ReadStrictAsync<AdminArmyResponse>(Ct);
        Assert.NotNull(landed.Army.Movement);
        Assert.True(
            (landed.Army.Movement.ArrivesAt - _factory.Time.GetUtcNow()).Duration() < TimeSpan.FromMinutes(1),
            "the army should arrive now, not in ten hours");

        // Its own centre hex is land by construction, so it is always a legal
        // place to stand.
        var moved = await client.PatchJsonAsync(
            $"/api/v1/admin/armies/{armyId}",
            new AdminEditArmyRequest(
                Units: [new AdminUnitCountRequest("spearman", 7)],
                Provisions: 250,
                Position: new HexPointRequest(settlement.Q, settlement.R)),
            Ct);

        Assert.Equal(HttpStatusCode.OK, moved.StatusCode);
        var edited = await moved.ReadStrictAsync<AdminArmyResponse>(Ct);

        Assert.Equal(settlement.Q, edited.Army.Position.Q);
        Assert.Equal(settlement.R, edited.Army.Position.R);
        Assert.Equal(7, edited.Army.Stacks.Single(s => s.Unit == "spearman").Count);
        Assert.Equal(250, edited.Army.Provisions, 0);
    }

    [Fact]
    public async Task Editing_an_unknown_army_is_a_404_and_emptying_one_is_refused()
    {
        using var client = Client();
        var (_, settlement) = await FoundAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var missing = await client.PatchJsonAsync(
            $"/api/v1/admin/armies/{Guid.CreateVersion7()}", new AdminEditArmyRequest(Provisions: 10), Ct);
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);

        var armyId = await PlantArmyAsync(settlement);
        var emptied = await client.PatchJsonAsync(
            $"/api/v1/admin/armies/{armyId}",
            new AdminEditArmyRequest(Units: [new AdminUnitCountRequest("thrall", 0)]), Ct);
        Assert.Equal(HttpStatusCode.BadRequest, emptied.StatusCode);
    }

    [Fact]
    public async Task Admin_can_create_a_world_and_a_duplicate_name_is_a_409()
    {
        using var client = Client();
        Authorize(client, await CreateAdminTokenAsync(client));

        var name = Unique("world");
        var created = await client.PostJsonAsync(
            "/api/v1/admin/worlds", new CreateWorldRequest(name, Seed: 21, Radius: 40, MaxPlayers: 42), Ct);

        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var world = await created.ReadStrictAsync<AdminWorldResponse>(Ct);
        Assert.Equal(name, world.Name);
        Assert.Equal(42, world.MaxPlayers);

        var listed = await client.GetFromJsonAsync<List<AdminWorldResponse>>(
            "/api/v1/admin/worlds", SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(listed!, w => w.Id == world.Id);

        var duplicate = await client.PostJsonAsync(
            "/api/v1/admin/worlds", new CreateWorldRequest(name, Seed: 22, Radius: 40), Ct);
        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }

    /// <summary>
    /// The first empty claimed hex something can actually be built on, and a
    /// building type its terrain allows. A settlement's start position is
    /// vetted land, but its neighbours are whatever the generator produced —
    /// forest, ridge, sand or grass — so a test that hard-coded one terrain
    /// would pass or fail on the world seed rather than on the rule it means
    /// to check.
    /// </summary>
    private static (AdminSettlementHexResponse Hex, string Building) FirstBuildableHex(
        AdminSettlementLayoutResponse layout)
    {
        // Mirrors BuildingCatalogue's terrain gates for one representative
        // producer per land terrain.
        var byTerrain = new Dictionary<string, string>
        {
            ["grass"] = "farm",
            ["forest"] = "lumberjack",
            ["mountain"] = "quarry",
            ["sand"] = "tower",
        };

        foreach (var hex in layout.Hexes.Where(h => !h.IsCentre && h.Building is null))
        {
            if (byTerrain.TryGetValue(hex.Terrain, out var building))
            {
                return (hex, building);
            }
        }

        Assert.Fail("No empty buildable hex inside the settlement's claim.");
        throw new InvalidOperationException("unreachable");
    }

    /// <summary>
    /// Puts a ten-hour outbound journey into the database directly. Dispatching
    /// through the player endpoint would need an owning account, a trained
    /// garrison and a reachable destination — none of which is what these
    /// tests are about.
    /// </summary>
    private async Task<Guid> PlantArmyAsync(SettlementResponse settlement)
    {
        var departedAt = _factory.Time.GetUtcNow();
        var army = new ArmyEntity
        {
            SettlementId = settlement.Id,
            Mission = (int)ArmyMission.Move,
            AtHome = false,
            IsSupporting = false,
            Provisions = 1_000,
            DepartedAt = departedAt,
            Path = [new HexPoint(settlement.Q, settlement.R), new HexPoint(settlement.Q + 1, settlement.R)],
            CumulativeHours = [0, 10],
            ReturnPath = [new HexPoint(settlement.Q + 1, settlement.R), new HexPoint(settlement.Q, settlement.R)],
            ReturnCumulativeHours = [0, 10],
            TurnAroundAt = departedAt + TimeSpan.FromHours(100),
            IsReturning = false,
            Stacks = [new ArmyUnitStackEntity { UnitType = UnitType.Thrall, Count = 5 }],
        };

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        db.Armies.Add(army);
        await db.SaveChangesAsync(Ct);

        return army.Id;
    }
}
