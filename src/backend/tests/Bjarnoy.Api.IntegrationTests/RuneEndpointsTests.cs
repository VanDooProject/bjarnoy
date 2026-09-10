using System.Net;
using System.Net.Http.Headers;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Shrines and runes end to end (issue #53): raising a shrine through the
/// normal build queue, granting a rune through the admin god-mode stand-in
/// for a real acquisition source, and a player slotting/unslotting it.
/// </summary>
public sealed class RuneEndpointsTests : IAsyncLifetime
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

    /// <summary>
    /// Founds a settlement, then raises its Longhouse to level 10 and stands
    /// a level-10 Barracks and Archery Range — a Shrine of Thor's full
    /// prerequisite chain (BuildingCatalogue.PrerequisiteTable: Tower ->
    /// Barracks -> Archery Range -> Shrine of Thor) — all via admin
    /// god-mode rather than walking the real queue up through each rung.
    /// </summary>
    private async Task<SettlementResponse> FoundWithLonghouseLevelThreeAsync(HttpClient client)
    {
        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), Seed: 21, Radius: 60), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var ownerId = Unique("ulf-player");
        var founded = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId),
            Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);

        // Anonymous-owned settlements now enforce ownership on every mutation
        // (QueueBuild included) — proven for the Abandoned system user by
        // this same client-local id echoed back on X-Owner-Id, see
        // OwnershipGate.EnforceAsync.
        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);

        Authorize(client, await CreateAdminTokenAsync(client));
        var leveledLonghouse = await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{founded.Id}/buildings/{founded.Q}/{founded.R}/level",
            new SetBuildingLevelRequest(10), Ct);
        Assert.Equal(HttpStatusCode.OK, leveledLonghouse.StatusCode);

        var layout = await client.GetFromJsonAsync<AdminSettlementLayoutResponse>(
            $"/api/v1/admin/settlements/{founded.Id}/layout", SqliteApiFixture.StrictJson, Ct);
        var grassHexes = layout!.Hexes
            .Where(h => !h.IsCentre && h.Building is null && h.Terrain == "grass")
            .Take(2)
            .ToList();
        Assert.Equal(2, grassHexes.Count);

        var placedBarracks = await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{founded.Id}/buildings/{grassHexes[0].Q}/{grassHexes[0].R}",
            new PlaceBuildingRequest("barracks", 10), Ct);
        Assert.Equal(HttpStatusCode.OK, placedBarracks.StatusCode);
        var placedArcheryRange = await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{founded.Id}/buildings/{grassHexes[1].Q}/{grassHexes[1].R}",
            new PlaceBuildingRequest("archeryrange", 10), Ct);
        Assert.Equal(HttpStatusCode.OK, placedArcheryRange.StatusCode);

        var leveled = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{founded.Id}", SqliteApiFixture.StrictJson, Ct);

        client.DefaultRequestHeaders.Authorization = null;
        return leveled!;
    }

    /// <summary>
    /// Queues and completes a level-1 shrine of Thor on an empty Grass hex
    /// inside the settlement's claim. A shrine is Grass-only
    /// (BuildingCatalogue.Shrine's AllowedTerrain), so unlike before this
    /// gate existed, the hex right next to the longhouse can't be assumed to
    /// qualify — the admin layout endpoint (same one
    /// AdminGodModeEndpointsTests.FirstBuildableHex uses) reports each
    /// claimed hex's actual terrain.
    /// </summary>
    private async Task<SettlementResponse> BuildShrineOfThorAsync(HttpClient client, SettlementResponse settlement)
    {
        Authorize(client, await CreateAdminTokenAsync(client));
        var layout = await client.GetFromJsonAsync<AdminSettlementLayoutResponse>(
            $"/api/v1/admin/settlements/{settlement.Id}/layout", SqliteApiFixture.StrictJson, Ct);
        var grassHex = layout!.Hexes.First(h => !h.IsCentre && h.Building is null && h.Terrain == "grass");
        client.DefaultRequestHeaders.Authorization = null;

        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("shrineofthor", grassHex.Q, grassHex.R), Ct);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);

        // The shrine's own build duration is well under a day even at level 1
        // (see BuildingCatalogue.Shrine); a day comfortably clears it.
        _factory.Time.Advance(TimeSpan.FromDays(1));

        var built = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Contains(built!.Buildings, b => b.Type == "shrineofthor" && b.Level == 1);
        return built;
    }

    [Fact]
    public async Task A_completed_shrine_of_thor_leaves_production_untouched_with_no_rune_slotted()
    {
        using var client = Client();
        var settlement = await FoundWithLonghouseLevelThreeAsync(client);
        var before = settlement.Resources.RatePerHour;

        var built = await BuildShrineOfThorAsync(client, settlement);

        // Thor's own favour is a land-unit attack bonus (ShrineCatalogue.Favour:
        // LandAttackBonus, ResourceAmounts.Zero) — it used to boost Wood, and
        // this pins that a bare shrine no longer moves any production rate.
        // The attack bonus itself is asserted at the domain level
        // (ShrineRuneTests / BattleResolverTests); SettlementResponse does not
        // surface it. A shrine consumes no workers and produces nothing, and
        // nothing else changed between the two reads (the day advanced only
        // clears the build), so the rates are exactly equal, not merely close.
        Assert.Equal(before.Wood, built.Resources.RatePerHour.Wood, 6);
        Assert.Equal(before.Stone, built.Resources.RatePerHour.Stone, 6);
        Assert.Equal(before.Food, built.Resources.RatePerHour.Food, 6);
        Assert.Equal(before.Iron, built.Resources.RatePerHour.Iron, 6);
    }

    [Fact]
    public async Task Admin_can_grant_a_rune_and_a_player_can_slot_it_into_a_shrine()
    {
        using var client = Client();
        var settlement = await FoundWithLonghouseLevelThreeAsync(client);
        var built = await BuildShrineOfThorAsync(client, settlement);
        var shrineHex = built.Buildings.Single(b => b.Type == "shrineofthor");

        Authorize(client, await CreateAdminTokenAsync(client));
        var granted = await (await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{built.Id}/runes",
            new GrantRuneRequest("fehu", "carved"), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);

        var rune = Assert.Single(granted.Runes);
        Assert.Equal("fehu", rune.Type);
        Assert.Equal("carved", rune.Rarity);
        Assert.Null(rune.SlottedAtQ);

        // The rune's own storage is player-facing, not admin-only.
        client.DefaultRequestHeaders.Authorization = null;

        var slotResponse = await client.PostJsonAsync(
            $"/api/v1/settlements/{built.Id}/runes/{rune.Id}/slot",
            new SlotRuneRequest(shrineHex.Q, shrineHex.R), Ct);
        Assert.Equal(HttpStatusCode.OK, slotResponse.StatusCode);
        var slotted = await slotResponse.ReadStrictAsync<SettlementResponse>(Ct);

        var slottedRune = Assert.Single(slotted.Runes);
        Assert.Equal(shrineHex.Q, slottedRune.SlottedAtQ);
        Assert.Equal(shrineHex.R, slottedRune.SlottedAtR);

        // Fehu adds on top of the shrine's own favour, so production is
        // higher slotted than it was with the bare shrine.
        Assert.True(slotted.Resources.RatePerHour.Wood > built.Resources.RatePerHour.Wood);

        var unslotResponse = await client.PostJsonAsync(
            $"/api/v1/settlements/{built.Id}/runes/{rune.Id}/unslot", new { }, Ct);
        Assert.Equal(HttpStatusCode.OK, unslotResponse.StatusCode);
        var unslotted = await unslotResponse.ReadStrictAsync<SettlementResponse>(Ct);

        var unslottedRune = Assert.Single(unslotted.Runes);
        Assert.Null(unslottedRune.SlottedAtQ);
        Assert.Equal(built.Resources.RatePerHour.Wood, unslotted.Resources.RatePerHour.Wood, 6);
    }

    [Fact]
    public async Task Slotting_a_rune_into_a_hex_with_no_shrine_is_a_conflict()
    {
        using var client = Client();
        var settlement = await FoundWithLonghouseLevelThreeAsync(client);

        Authorize(client, await CreateAdminTokenAsync(client));
        var granted = await (await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/runes",
            new GrantRuneRequest("fehu", "carved"), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);
        var rune = Assert.Single(granted.Runes);

        client.DefaultRequestHeaders.Authorization = null;
        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/runes/{rune.Id}/slot",
            new SlotRuneRequest(settlement.Q, settlement.R), Ct); // the longhouse's own hex, not a shrine

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    }

    [Fact]
    public async Task Slotting_a_rune_is_refused_for_a_settlement_with_a_different_owner()
    {
        using var client = Client();
        var settlement = await FoundWithLonghouseLevelThreeAsync(client);
        var built = await BuildShrineOfThorAsync(client, settlement);
        var shrineHex = built.Buildings.Single(b => b.Type == "shrineofthor");

        Authorize(client, await CreateAdminTokenAsync(client));
        var granted = await (await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{built.Id}/runes",
            new GrantRuneRequest("fehu", "carved"), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);
        var rune = Assert.Single(granted.Runes);

        // FoundWithLonghouseLevelThreeAsync already set X-Owner-Id to this
        // settlement's real owner — swap it for someone else's before either
        // player-facing rune call, same as SettlementEndpointsTests does for
        // QueueBuild/TrainUnits.
        client.DefaultRequestHeaders.Authorization = null;
        client.DefaultRequestHeaders.Remove("X-Owner-Id");
        client.DefaultRequestHeaders.Add("X-Owner-Id", "someone-else");

        var slotResponse = await client.PostJsonAsync(
            $"/api/v1/settlements/{built.Id}/runes/{rune.Id}/slot",
            new SlotRuneRequest(shrineHex.Q, shrineHex.R), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, slotResponse.StatusCode);

        var unslotResponse = await client.PostJsonAsync(
            $"/api/v1/settlements/{built.Id}/runes/{rune.Id}/unslot", new { }, Ct);
        Assert.Equal(HttpStatusCode.Forbidden, unslotResponse.StatusCode);
    }

    [Fact]
    public async Task Granting_an_unknown_rune_type_is_a_validation_error()
    {
        using var client = Client();
        var settlement = await FoundWithLonghouseLevelThreeAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{settlement.Id}/runes",
            new GrantRuneRequest("not-a-rune", "carved"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
