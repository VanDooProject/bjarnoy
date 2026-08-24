using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Persistence;

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
        var response = await client.PostJsonAsync(
            "/api/v1/worlds", new CreateWorldRequest(name, Seed: 7, Radius: 30), Ct);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.ReadStrictAsync<WorldResponse>(Ct);

        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{created.Id}/islands", SqliteApiFixture.StrictJson, Ct);

        Assert.NotNull(islands);
        Assert.Equal(created.IslandCount, islands.Count);
        Assert.Contains(islands, i => i.StartPositions.Count > 0);
    }

    [Fact]
    public async Task The_unique_name_index_is_enforced_by_postgresql_too()
    {
        await using var factory = CreateFactory();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();

        var name = $"dup-{Guid.CreateVersion7():N}"[..20];

        Assert.Equal(
            HttpStatusCode.Created,
            (await client.PostJsonAsync("/api/v1/worlds", new CreateWorldRequest(name, 1, 30), Ct))
                .StatusCode);
        Assert.Equal(
            HttpStatusCode.Conflict,
            (await client.PostJsonAsync("/api/v1/worlds", new CreateWorldRequest(name, 2, 30), Ct))
                .StatusCode);
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

            var created = await (await client.PostJsonAsync(
                "/api/v1/worlds", new CreateWorldRequest(name, seed, Radius: 30), Ct))
                .ReadStrictAsync<WorldResponse>(Ct);

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
}
