using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Bjarnoy.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The same application against the provider it runs on in production.
/// </summary>
/// <remarks>
/// Skipped, not failed, when Docker is unavailable — see
/// <see cref="PostgreSqlFixture.SkipReason"/>. CI has Docker, so these do run
/// there.
/// </remarks>
public sealed class PostgreSqlIntegrationTests(PostgreSqlFixture postgres)
    : IClassFixture<PostgreSqlFixture>
{
    private readonly PostgreSqlFixture _postgres = postgres;

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private BjarnoyApiFactory CreateFactory()
    {
        Assert.SkipWhen(_postgres.SkipReason is not null, _postgres.SkipReason ?? string.Empty);
        return BjarnoyApiFactory.PostgreSql(_postgres.ConnectionString);
    }

    [Fact]
    public async Task The_postgresql_migration_set_applies_to_an_empty_database()
    {
        await using var factory = CreateFactory();

        await factory.MigrateAsync(Ct);
        var status = await factory.GetMigrationStatusAsync(Ct);

        Assert.Equal("Npgsql.EntityFrameworkCore.PostgreSQL", status.ProviderName);
        Assert.True(status.Reachable);
        Assert.NotEmpty(status.Applied);
        Assert.Empty(status.Pending);
    }

    [Fact]
    public async Task A_world_round_trips_through_postgresql()
    {
        await using var factory = CreateFactory();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var name = $"pg-{Guid.CreateVersion7():N}"[..20];
        var created = await factory.CreateWorldAsync(name, seed: 7, radius: 30, cancellationToken: Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{created.Id}/islands", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(islands);
        // The islands endpoint hides wasted islands until the reveal.
        Assert.Equal(created.Islands.Count(i => !i.IsWasted), islands.Count);
        Assert.Contains(islands, i => i.StartPositions.Count > 0);
    }

    [Fact]
    public async Task The_unique_name_index_is_enforced_by_postgresql_too()
    {
        await using var factory = CreateFactory();
        await factory.MigrateAsync(Ct);

        var name = $"dup-{Guid.CreateVersion7():N}"[..20];

        await factory.CreateWorldAsync(name, seed: 1, radius: 30, cancellationToken: Ct);

        await Assert.ThrowsAsync<WorldCreationException>(
            () => factory.CreateWorldAsync(name, seed: 2, radius: 30, cancellationToken: Ct));
    }

    [Fact]
    public async Task The_same_seed_yields_the_same_terrain_on_both_providers()
    {
        await using var pgFactory = CreateFactory();
        await pgFactory.MigrateAsync(Ct);

        await using var sqliteFactory = BjarnoyApiFactory.Sqlite();
        await sqliteFactory.MigrateAsync(Ct);

        const int seed = 31337;
        var tiles = new List<IReadOnlyList<TileResponse>>();

        foreach (var factory in new[] { pgFactory, sqliteFactory })
        {
            using var client = factory.CreateClient();
            var name = $"{factory.Provider}-{Guid.CreateVersion7():N}"[..24];

            var created = await factory.CreateWorldAsync(name, seed, radius: 30, cancellationToken: Ct);

            var chunk = await client.GetFromJsonAsync<TileChunkResponse>(
                $"/api/v1/worlds/{created.Id}/tiles?qMin=-10&qMax=10&rMin=-10&rMax=10",
                SqliteApiFixture.StrictJson,
                Ct);

            tiles.Add(chunk!.Tiles);
        }

        // Terrain is a pure function of the seed, so the database it was stored
        // in must make no difference.
        Assert.Equal(tiles[0], tiles[1]);
    }

    [Fact]
    public async Task An_api_key_and_a_key_request_round_trip_through_postgresql()
    {
        await using var factory = CreateFactory();
        await factory.MigrateAsync(Ct);
        var harness = new ApiKeys.ApiKeyHarness(factory);

        var (admin, _, _) = await harness.CreateAdminAsync();
        var world = await factory.CreateWorldAsync($"pg-{Guid.CreateVersion7():N}"[..20], seed: 7, radius: 30, cancellationToken: Ct);
        var created = await harness.CreateKeyAsync(
            admin,
            ApiKeys.ApiKeyHarness.Features(("worlds", Bjarnoy.Infrastructure.Entities.ApiKeyAccess.Read), ("settlements", Bjarnoy.Infrastructure.Entities.ApiKeyAccess.ReadWrite)),
            allWorlds: false,
            worldIds: [world.Id]);

        // Features and world list survive the text-column converters, and the key authenticates and is scoped.
        Assert.Equal(2, created.ApiKey.Features.Count);
        Assert.Equal([world.Id], created.ApiKey.WorldIds);
        using var keyClient = harness.KeyClient(created.Token);
        Assert.Equal(System.Net.HttpStatusCode.OK, (await keyClient.GetAsync($"/api/v1/worlds/{world.Id}", Ct)).StatusCode);
        Assert.Equal(System.Net.HttpStatusCode.Forbidden, (await keyClient.GetAsync("/api/v1/worlds/", Ct)).StatusCode);

        // The request flow: the status concurrency token, the unique user code and the one-time pickup.
        using var agent = factory.CreateClient();
        var requested = await (await agent.PostJsonAsync(
                "/api/v1/api-key-requests/",
                new CreateApiKeyRequestRequest(
                    "pg agent", null, null, null, null,
                    ApiKeys.ApiKeyHarness.Features(("worlds", Bjarnoy.Infrastructure.Entities.ApiKeyAccess.Read)), true, null, 60, null),
                Ct))
            .ReadStrictAsync<ApiKeyRequestCreatedResponse>(Ct);
        Assert.Equal(System.Net.HttpStatusCode.OK, (await admin.PostAsync($"/api/v1/admin/api-key-requests/{requested.Id}/approve", null, Ct)).StatusCode);

        var poll = new ApiKeyTokenPollRequest(requested.PollSecret);
        Assert.Equal(System.Net.HttpStatusCode.OK, (await agent.PostJsonAsync($"/api/v1/api-key-requests/{requested.Id}/token", poll, Ct)).StatusCode);
        Assert.Equal(System.Net.HttpStatusCode.Gone, (await agent.PostJsonAsync($"/api/v1/api-key-requests/{requested.Id}/token", poll, Ct)).StatusCode);
    }

    /// <summary>
    /// Two reads of one settlement both find a training batch due. The winner settles it (deletes the order, inserts
    /// the unit stack); the loser's batch updates 0 rows on the Version check and then hits the unique
    /// (SettlementId, UnitType) index. PostgreSQL aborts the batch there, so EF never sees the 0-row update and the
    /// request used to fail with a 500 instead of re-reading the settled state.
    /// </summary>
    [Fact]
    public async Task A_plain_read_that_loses_the_race_to_settle_a_due_training_batch_is_retried()
    {
        await using var factory = CreateFactory();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var world = await factory.CreateWorldAsync($"pg-{Guid.CreateVersion7():N}"[..20], seed: 21, radius: 60, cancellationToken: Ct);
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{world.Id}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        const string ownerId = "Ulf-player";
        var founded = await (await client.PostJsonAsync(
            $"/api/v1/worlds/{world.Id}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, "Bjornstad", "Ulf", ownerId), Ct))
            .ReadStrictAsync<SettlementResponse>(Ct);
        client.DefaultRequestHeaders.Add("X-Owner-Id", ownerId);

        // God mode: an admin token, stock for the batch and a Barracks (where a thrall trains).
        var adminName = $"admin-{Guid.CreateVersion7():N}"[..20];
        var registered = await (await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(adminName, "correct-horse-battery"), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == registered.User.Id, Ct);
            user.Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var login = await (await client.PostJsonAsync(
            "/api/v1/auth/login", new LoginRequest(adminName, "correct-horse-battery"), Ct))
            .ReadStrictAsync<AuthResponse>(Ct);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);

        Assert.Equal(HttpStatusCode.OK, (await client.PostJsonAsync(
            $"/api/v1/admin/settlements/{founded.Id}/resources",
            new GrantResourcesRequest(Wood: 100_000, Stone: 100_000, Food: 100_000, Iron: 100_000), Ct)).StatusCode);
        var layout = await client.GetFromJsonAsync<AdminSettlementLayoutResponse>(
            $"/api/v1/admin/settlements/{founded.Id}/layout", SqliteApiFixture.StrictJson, Ct);
        var barracksHex = layout!.Hexes.First(h =>
            !h.IsCentre && h.Building is null && (h.Terrain == "grass" || h.Terrain == "sand"));
        Assert.True((await client.PutJsonAsync(
            $"/api/v1/admin/settlements/{founded.Id}/buildings/{barracksHex.Q}/{barracksHex.R}",
            new PlaceBuildingRequest("barracks", 1), Ct)).IsSuccessStatusCode);

        var queued = await client.PostJsonAsync(
            $"/api/v1/settlements/{founded.Id}/units", new TrainUnitsRequest("thrall", 1, barracksHex.Q, barracksHex.R), Ct);
        Assert.Equal(HttpStatusCode.Accepted, queued.StatusCode);
        factory.Time.Advance(TimeSpan.FromDays(1));

        // The competing read settles the due batch right after the outer read loaded the stale settlement.
        factory.Race.Arm(
            founded.Id,
            async () => Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/v1/settlements/{founded.Id}", Ct)).StatusCode),
            repeat: false,
            afterGroupLoad: true);
        var outer = await client.GetAsync($"/api/v1/settlements/{founded.Id}", Ct);
        factory.Race.Disarm();

        Assert.True(outer.StatusCode == HttpStatusCode.OK, await outer.Content.ReadAsStringAsync(Ct));
        Assert.Equal(1, factory.Race.Fired);

        var after = await client.GetFromJsonAsync<SettlementResponse>(
            $"/api/v1/settlements/{founded.Id}", SqliteApiFixture.StrictJson, Ct);
        Assert.Empty(after!.TrainingQueue);
        Assert.Equal(1, after.Garrison.Single(g => g.Unit == "thrall").Count);
    }
}
