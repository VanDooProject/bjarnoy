using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Api.Json;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The admin world-management surface (issue #27): the 401/403 matrix, the
/// settings PATCH, and the run-state POST that wires the existing
/// <see cref="Bjarnoy.Domain.Economy.GameClock"/> machine to HTTP — plus the
/// seed preview and map reseed added by issue #133.
/// </summary>
public sealed class AdminWorldEndpointsTests(SqliteApiFixture fixture) : IClassFixture<SqliteApiFixture>
{
    private readonly SqliteApiFixture _fixture = fixture;

    private CancellationToken Ct => TestContext.Current.CancellationToken;

    private static string UniqueName(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    private async Task<WorldResponse> CreateWorldAsync(HttpClient client, int maxPlayers = 100)
    {
        var response = await client.PostJsonAsync(
            "/api/v1/worlds",
            new CreateWorldRequest(UniqueName("world"), Seed: 4242, Radius: 30, MaxPlayers: maxPlayers),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<WorldResponse>(Ct);
    }

    /// <summary>Founds a settlement (one longhouse) on <paramref name="world"/>'s first usable plot.</summary>
    private async Task<SettlementResponse> FoundSettlementAsync(HttpClient client, WorldResponse world)
    {
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", "ulf-player"),
            Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<SettlementResponse>(Ct);
    }

    /// <summary>Registers a fresh player, promotes it to Admin in the DB, then logs in to mint a token carrying the role.</summary>
    private async Task<string> CreateAdminTokenAsync(HttpClient client) =>
        (await CreateAdminAsync(client)).AccessToken;

    /// <summary>
    /// <see cref="CreateAdminTokenAsync"/>, but also handing back the admin's
    /// own user id — the reseed guard (issue #133) treats that admin's own
    /// settlements differently from everyone else's, so its tests need to know
    /// who it is.
    /// </summary>
    private async Task<(string AccessToken, Guid UserId)> CreateAdminAsync(HttpClient client)
    {
        var userName = UniqueName("admin");
        var registered = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);

        await using (var scope = _fixture.Factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == auth.User.Id, Ct);
            user.Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var loggedIn = await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(userName, "correct-horse-battery"), Ct);
        Assert.Equal(HttpStatusCode.OK, loggedIn.StatusCode);
        return ((await loggedIn.ReadStrictAsync<AuthResponse>(Ct)).AccessToken, auth.User.Id);
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

    [Fact]
    public async Task Anonymous_and_player_callers_are_refused_the_admin_surface()
    {
        using var anonymous = _fixture.CreateClient();
        var anonymousResponse = await anonymous.GetAsync("/api/v1/admin/worlds", Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, anonymousResponse.StatusCode);

        using var player = _fixture.CreateClient();
        var registered = await player.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(UniqueName("player"), "correct-horse-battery"), Ct);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);
        Authorize(player, auth.AccessToken);

        var playerResponse = await player.GetAsync("/api/v1/admin/worlds", Ct);
        Assert.Equal(HttpStatusCode.Forbidden, playerResponse.StatusCode);
    }

    [Fact]
    public async Task Admin_can_list_worlds_with_admin_fields()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.GetAsync("/api/v1/admin/worlds", Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var worlds = await response.ReadStrictAsync<IReadOnlyList<AdminWorldResponse>>(Ct);
        var listed = Assert.Single(worlds, w => w.Id == world.Id);
        Assert.Equal(1.0, listed.SpeedFactor);
        Assert.False(listed.JoinsClosed);
        Assert.Equal("running", listed.RunState);
    }

    [Fact]
    public async Task Admin_can_update_speed_factor_start_date_stop_join_and_endboss()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var startsAt = DateTimeOffset.UtcNow.AddDays(1);
        var endbossAt = startsAt.AddDays(7);

        var response = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(
                SpeedFactor: 2.0,
                StartsAt: Optional<DateTimeOffset?>.Of(startsAt),
                JoinsClosed: true,
                EndbossAt: Optional<DateTimeOffset?>.Of(endbossAt)),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.ReadStrictAsync<AdminWorldResponse>(Ct);

        Assert.Equal(2.0, updated.SpeedFactor);
        Assert.Equal(startsAt, updated.StartsAt);
        Assert.True(updated.JoinsClosed);
        Assert.Equal(endbossAt, updated.EndbossAt);

        // A field omitted from the next PATCH must be left as-is.
        var second = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(SpeedFactor: 3.0),
            Ct);
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        var afterSecond = await second.ReadStrictAsync<AdminWorldResponse>(Ct);
        Assert.Equal(3.0, afterSecond.SpeedFactor);
        Assert.Equal(startsAt, afterSecond.StartsAt);
        Assert.True(afterSecond.JoinsClosed);
        Assert.Equal(endbossAt, afterSecond.EndbossAt);

        // Explicit null clears a previously-set nullable field.
        var cleared = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(SpeedFactor: null, EndbossAt: Optional<DateTimeOffset?>.Of(null)),
            Ct);
        Assert.Equal(HttpStatusCode.OK, cleared.StatusCode);
        var afterCleared = await cleared.ReadStrictAsync<AdminWorldResponse>(Ct);
        Assert.Null(afterCleared.EndbossAt);
        Assert.Equal(startsAt, afterCleared.StartsAt);
    }

    [Fact]
    public async Task A_non_positive_speed_factor_is_rejected()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(SpeedFactor: 0),
            Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task An_endboss_instant_at_or_before_the_start_date_is_rejected()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var startsAt = DateTimeOffset.UtcNow.AddDays(1);

        var response = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(
                SpeedFactor: null,
                StartsAt: Optional<DateTimeOffset?>.Of(startsAt),
                EndbossAt: Optional<DateTimeOffset?>.Of(startsAt)),
            Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    /// <summary>Design doc §1: BaseShieldDays is admin-configurable per world, mirroring SpeedFactor's own shape.</summary>
    [Fact]
    public async Task Admin_can_update_base_shield_days()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var listed = await client.GetFromJsonAsync<IReadOnlyList<AdminWorldResponse>>(
            "/api/v1/admin/worlds", SqliteApiFixture.StrictJson, Ct);
        Assert.Equal(7, Assert.Single(listed!, w => w.Id == world.Id).BaseShieldDays);

        var response = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(SpeedFactor: null, BaseShieldDays: 10),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.ReadStrictAsync<AdminWorldResponse>(Ct);
        Assert.Equal(10, updated.BaseShieldDays);

        // Omitted from the next PATCH — left as-is, same as SpeedFactor's own contract.
        var second = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(SpeedFactor: 2.0),
            Ct);
        var afterSecond = await second.ReadStrictAsync<AdminWorldResponse>(Ct);
        Assert.Equal(10, afterSecond.BaseShieldDays);
    }

    [Fact]
    public async Task A_non_positive_base_shield_days_is_rejected()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(SpeedFactor: null, BaseShieldDays: 0),
            Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    /// <summary>Design doc §7: a fresh world's islands have no settlements yet, so every ring it has qualifies with capacity.</summary>
    [Fact]
    public async Task Admin_world_listing_reports_beginner_ring_capacity()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var listed = await client.GetFromJsonAsync<IReadOnlyList<AdminWorldResponse>>(
            "/api/v1/admin/worlds", SqliteApiFixture.StrictJson, Ct);
        var admin = Assert.Single(listed!, w => w.Id == world.Id);

        Assert.True(admin.BeginnerRingsTotal > 0);
        Assert.Equal(admin.BeginnerRingsTotal, admin.BeginnerRingsWithCapacity);
        Assert.False(admin.BeginnerTotalExhaustion);
    }

    [Fact]
    public async Task Admin_can_pause_and_resume_a_world_with_grace()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var pauseResponse = await client.PostJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/run-state", new SetWorldRunStateRequest("pause"), Ct);
        Assert.Equal(HttpStatusCode.OK, pauseResponse.StatusCode);
        var paused = await pauseResponse.ReadStrictAsync<AdminWorldResponse>(Ct);
        Assert.Equal("paused", paused.RunState);

        var resumeResponse = await client.PostJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/run-state",
            new SetWorldRunStateRequest("resume", GraceMinutes: 5),
            Ct);
        Assert.Equal(HttpStatusCode.OK, resumeResponse.StatusCode);
        var resumed = await resumeResponse.ReadStrictAsync<AdminWorldResponse>(Ct);
        Assert.Equal("running", resumed.RunState);
    }

    [Fact]
    public async Task An_unknown_run_state_action_is_rejected()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/run-state", new SetWorldRunStateRequest("nonsense"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Admin_endpoints_404_for_an_unknown_world()
    {
        using var client = _fixture.CreateClient();
        Authorize(client, await CreateAdminTokenAsync(client));

        var missing = Guid.CreateVersion7();

        var settingsResponse = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{missing}/settings", new UpdateWorldSettingsRequest(SpeedFactor: 2.0), Ct);
        Assert.Equal(HttpStatusCode.NotFound, settingsResponse.StatusCode);

        var runStateResponse = await client.PostJsonAsync(
            $"/api/v1/admin/worlds/{missing}/run-state", new SetWorldRunStateRequest("pause"), Ct);
        Assert.Equal(HttpStatusCode.NotFound, runStateResponse.StatusCode);
    }

    [Fact]
    public async Task Doubling_the_speed_factor_immediately_doubles_a_settlements_production_rate()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        var settlement = await FoundSettlementAsync(client, world);
        var baseRate = settlement.Resources.RatePerHour.Food;

        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(SpeedFactor: 2.0),
            Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var afterRetune = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);

        Assert.Equal(baseRate * 2, afterRetune!.Resources.RatePerHour.Food, 6);
    }

    [Fact]
    public async Task Closing_joins_refuses_a_new_settlement_but_leaves_existing_players_alone()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        var settlement = await FoundSettlementAsync(client, world);

        Authorize(client, await CreateAdminTokenAsync(client));
        var response = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(SpeedFactor: null, JoinsClosed: true),
            Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        client.DefaultRequestHeaders.Authorization = null;

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var refused = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Grimhold", "Sigrid", "sigrid-player"),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("JoinsClosed", await refused.RejectionAsync(Ct));

        var stillThere = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{settlement.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.NotNull(stillThere);
    }

    [Fact]
    public async Task A_world_that_has_not_started_yet_refuses_new_settlements()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);

        Authorize(client, await CreateAdminTokenAsync(client));
        var response = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(SpeedFactor: null, StartsAt: Optional<DateTimeOffset?>.Of(DateTimeOffset.UtcNow.AddDays(1))),
            Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        client.DefaultRequestHeaders.Authorization = null;

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var refused = await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Grimhold", "Sigrid", "sigrid-player"),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
        Assert.Equal("NotStartedYet", await refused.RejectionAsync(Ct));
    }

    [Fact]
    public async Task The_endboss_trigger_fires_exactly_once_and_leaves_joins_open()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);

        Authorize(client, await CreateAdminTokenAsync(client));
        var endbossAt = _fixture.Factory.Time.GetUtcNow().AddHours(1);
        var response = await client.PatchJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/settings",
            new UpdateWorldSettingsRequest(
                SpeedFactor: null, EndbossAt: Optional<DateTimeOffset?>.Of(endbossAt)),
            Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        client.DefaultRequestHeaders.Authorization = null;

        // Not due yet: a scan right now must not fire it.
        var tooEarly = await TriggerDueEndbossesAsync();
        Assert.DoesNotContain(world.Id, tooEarly);

        _fixture.Factory.Time.Advance(TimeSpan.FromHours(2));

        var fired = await TriggerDueEndbossesAsync();
        Assert.Contains(world.Id, fired);

        var again = await TriggerDueEndbossesAsync();
        Assert.DoesNotContain(world.Id, again);

        var list = await client.GetFromJsonAsync<List<WorldResponse>>(
            "/api/v1/worlds", SqliteApiFixture.StrictJson, Ct);
        Assert.True(list!.Single(w => w.Id == world.Id).EndbossTriggered);

        // Out of scope for #27, but must not regress: joins stay open.
        await FoundSettlementAsync(client, world);
    }

    // ---- Seed preview and reseed (issue #133) ----

    /// <summary>The stored facts a reseed is supposed to change, read straight from the database.</summary>
    private async Task<(int Seed, List<Guid> IslandIds, int Settlements)> ReadWorldStateAsync(Guid worldId)
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var world = await db.Worlds.AsNoTracking().SingleAsync(w => w.Id == worldId, Ct);
        var islands = await db.Islands.AsNoTracking()
            .Where(i => i.WorldId == worldId).OrderBy(i => i.Index).Select(i => i.Id).ToListAsync(Ct);
        var settlements = await db.Settlements.AsNoTracking().CountAsync(s => s.WorldId == worldId, Ct);
        return (world.Seed, islands, settlements);
    }

    /// <summary>
    /// Hands a settlement to a real account. Founding always starts a settlement
    /// out on <see cref="SystemUserIds.Abandoned"/> (see SettlementService) —
    /// real ownership is only ever assigned later, at registration — so a test
    /// that needs a real owner has to do what registration would.
    /// </summary>
    private async Task AssignSettlementOwnerAsync(Guid settlementId, Guid userId)
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
        var settlement = await db.Settlements.SingleAsync(s => s.Id == settlementId, Ct);
        settlement.UserId = userId;
        await db.SaveChangesAsync(Ct);
    }

    [Fact]
    public async Task Previewing_a_seed_returns_a_map_and_changes_nothing_in_the_database()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        await FoundSettlementAsync(client, world);
        var before = await ReadWorldStateAsync(world.Id);

        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/preview-seed",
            new PreviewWorldSeedRequest(Seed: 9001),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var preview = await response.ReadStrictAsync<WorldSeedPreviewResponse>(Ct);

        Assert.Equal(9001, preview.Seed);
        Assert.Equal(world.Radius, preview.Radius);
        Assert.NotEmpty(preview.Islands);
        Assert.Equal(preview.Islands.Count, preview.IslandCount);
        Assert.True(preview.LandTileCount > 0);
        // A preview is not the live map: it must differ from what is stored,
        // which is the whole point of looking at it before committing.
        Assert.NotEqual(before.Seed, preview.Seed);

        var after = await ReadWorldStateAsync(world.Id);
        Assert.Equal(before.Seed, after.Seed);
        Assert.Equal(before.IslandIds, after.IslandIds);
        Assert.Equal(before.Settlements, after.Settlements);
    }

    [Fact]
    public async Task Previewing_the_same_seed_twice_returns_the_same_map()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        async Task<WorldSeedPreviewResponse> PreviewAsync(int seed)
        {
            var response = await client.PostJsonAsync(
                $"/api/v1/admin/worlds/{world.Id}/preview-seed", new PreviewWorldSeedRequest(Seed: seed), Ct);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            return await response.ReadStrictAsync<WorldSeedPreviewResponse>(Ct);
        }

        var first = await PreviewAsync(31337);
        var second = await PreviewAsync(31337);

        Assert.Equal(
            first.Islands.Select(i => (i.Index, i.Name, i.Q, i.R, i.TileCount)),
            second.Islands.Select(i => (i.Index, i.Name, i.Q, i.R, i.TileCount)));
    }

    [Fact]
    public async Task Reseeding_replaces_the_map_and_deletes_every_settlement_in_the_world()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        var settlement = await FoundSettlementAsync(client, world);
        var before = await ReadWorldStateAsync(world.Id);
        Assert.Equal(1, before.Settlements);

        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/reseed",
            new ReseedWorldRequest(world.Name, Seed: 9001),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var reseeded = await response.ReadStrictAsync<ReseedWorldResponse>(Ct);

        Assert.Equal(9001, reseeded.Seed);
        Assert.Equal(1, reseeded.DeletedSettlements);
        Assert.True(reseeded.IslandCount > 0);
        Assert.Equal(0, reseeded.World.PlayerCount);
        Assert.Equal(world.Name, reseeded.World.Name);

        var after = await ReadWorldStateAsync(world.Id);
        Assert.Equal(9001, after.Seed);
        Assert.Equal(0, after.Settlements);
        Assert.Equal(reseeded.IslandCount, after.IslandIds.Count);
        // Fresh island rows, not the old ones re-pointed: settlements referenced
        // those by id, which is exactly why they cannot survive a reseed.
        Assert.Empty(after.IslandIds.Intersect(before.IslandIds));

        var gone = await client.GetAsync($"/api/v1/settlements/{settlement.Id}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
    }

    [Fact]
    public async Task Reseeding_is_refused_while_another_players_settlement_stands()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        var settlement = await FoundSettlementAsync(client, world);

        // A real, non-admin account owning a settlement in this world — the one
        // thing the guard exists to protect.
        using var player = _fixture.CreateClient();
        var registered = await player.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(UniqueName("player"), "correct-horse-battery"), Ct);
        var playerAuth = await registered.ReadStrictAsync<AuthResponse>(Ct);
        await AssignSettlementOwnerAsync(settlement.Id, playerAuth.User.Id);

        var before = await ReadWorldStateAsync(world.Id);
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/reseed",
            new ReseedWorldRequest(world.Name, Seed: 9001),
            Ct);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);

        var after = await ReadWorldStateAsync(world.Id);
        Assert.Equal(before.Seed, after.Seed);
        Assert.Equal(before.IslandIds, after.IslandIds);
        Assert.Equal(1, after.Settlements);
    }

    [Fact]
    public async Task Reseeding_goes_ahead_over_the_acting_admins_own_settlement()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        var adminSettlement = await FoundSettlementAsync(client, world);
        var admin = await CreateAdminAsync(client);

        // The acting admin's own settlement: their own test play, not a real
        // player's progress, so it does not block the reseed — it is simply
        // deleted along with it. (The abandoned-owner case is the one
        // Reseeding_replaces_the_map... above already covers, since founding
        // always starts a settlement out on SystemUserIds.Abandoned.)
        await AssignSettlementOwnerAsync(adminSettlement.Id, admin.UserId);
        Assert.Equal(1, (await ReadWorldStateAsync(world.Id)).Settlements);

        Authorize(client, admin.AccessToken);
        var response = await client.PostJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/reseed",
            new ReseedWorldRequest(world.Name, Seed: 9001),
            Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var reseeded = await response.ReadStrictAsync<ReseedWorldResponse>(Ct);
        Assert.Equal(1, reseeded.DeletedSettlements);

        var after = await ReadWorldStateAsync(world.Id);
        Assert.Equal(0, after.Settlements);
        Assert.Equal(9001, after.Seed);

        var gone = await client.GetAsync($"/api/v1/settlements/{adminSettlement.Id}", Ct);
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
    }

    [Fact]
    public async Task Reseeding_without_retyping_the_worlds_name_is_rejected()
    {
        using var client = _fixture.CreateClient();
        var world = await CreateWorldAsync(client);
        Authorize(client, await CreateAdminTokenAsync(client));

        var response = await client.PostJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/reseed",
            new ReseedWorldRequest("not-the-world's-name", Seed: 9001),
            Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(world.Seed, (await ReadWorldStateAsync(world.Id)).Seed);
    }

    [Fact]
    public async Task The_preview_and_reseed_endpoints_are_admin_only_and_404_for_an_unknown_world()
    {
        using var anonymous = _fixture.CreateClient();
        var world = await CreateWorldAsync(anonymous);

        var unauthorized = await anonymous.PostJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/preview-seed", new PreviewWorldSeedRequest(Seed: 1), Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, unauthorized.StatusCode);

        using var player = _fixture.CreateClient();
        var registered = await player.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(UniqueName("player"), "correct-horse-battery"), Ct);
        Authorize(player, (await registered.ReadStrictAsync<AuthResponse>(Ct)).AccessToken);
        var forbidden = await player.PostJsonAsync(
            $"/api/v1/admin/worlds/{world.Id}/reseed", new ReseedWorldRequest(world.Name, Seed: 1), Ct);
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        using var client = _fixture.CreateClient();
        Authorize(client, await CreateAdminTokenAsync(client));
        var missing = Guid.CreateVersion7();

        var previewMissing = await client.PostJsonAsync(
            $"/api/v1/admin/worlds/{missing}/preview-seed", new PreviewWorldSeedRequest(Seed: 1), Ct);
        Assert.Equal(HttpStatusCode.NotFound, previewMissing.StatusCode);

        var reseedMissing = await client.PostJsonAsync(
            $"/api/v1/admin/worlds/{missing}/reseed", new ReseedWorldRequest("whatever", Seed: 1), Ct);
        Assert.Equal(HttpStatusCode.NotFound, reseedMissing.StatusCode);
    }

    private async Task<IReadOnlyList<Guid>> TriggerDueEndbossesAsync()
    {
        await using var scope = _fixture.Factory.Services.CreateAsyncScope();
        var worlds = scope.ServiceProvider.GetRequiredService<WorldService>();
        var fired = await worlds.TriggerDueEndbossesAsync(Ct);
        return [.. fired.Select(w => w.Id)];
    }
}
