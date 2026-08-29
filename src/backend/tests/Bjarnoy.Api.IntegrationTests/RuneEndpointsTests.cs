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

    /// <summary>Founds a settlement, then raises its Longhouse to level 3 (a shrine's prerequisite) via admin god-mode.</summary>
    private async Task<SettlementResponse> FoundWithLonghouseLevelThreeAsync(HttpClient client)
    {
        var world = await (await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(Unique("w"), seed: 21, radius: 60), Ct))
            .ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var founded = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", "ulf-player"),
            Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);

        Authorize(client, await CreateAdminTokenAsync(client));
        var leveled = await (await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{founded.Id}/buildings/{founded.Q}/{founded.R}/level",
            new SetBuildingLevelRequest(3), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);

        client.DefaultRequestHeaders.Authorization = null;
        return leveled;
    }

    /// <summary>Queues and completes a level-1 shrine of Thor on the hex next to the longhouse.</summary>
    private async Task<SettlementResponse> BuildShrineOfThorAsync(HttpClient client, SettlementResponse settlement)
    {
        var response = await client.PostJsonAsync(
            $"/api/v1/settlements/{settlement.Id}/builds",
            new QueueBuildRequest("shrineofthor", settlement.Q + 1, settlement.R), Ct);
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
    public async Task A_completed_shrine_boosts_matching_production_with_no_rune_slotted()
    {
        using var client = Client();
        var settlement = await FoundWithLonghouseLevelThreeAsync(client);
        var before = settlement.Resources.RatePerHour.Wood;

        var built = await BuildShrineOfThorAsync(client, settlement);

        // Thor's own favour alone (no rune) is a real, positive boost to Wood.
        Assert.True(built.Resources.RatePerHour.Wood > before);
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
