using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests.ApiKeys;

/// <summary>
/// Shared setup for the API key suites: accounts, keys and settlements over a <see cref="BjarnoyApiFactory"/>, so each
/// test class reads as the scenario it checks rather than as plumbing. Works on either provider.
/// </summary>
internal sealed class ApiKeyHarness(BjarnoyApiFactory factory)
{
    public const string Password = "correct-horse-battery";

    public BjarnoyApiFactory Factory { get; } = factory;

    public static CancellationToken Ct => TestContext.Current.CancellationToken;

    public static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..24];

    public async Task<T> WithDbAsync<T>(Func<GameDbContext, Task<T>> action)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        return await action(scope.ServiceProvider.GetRequiredService<GameDbContext>());
    }

    /// <summary>Registers a player, promotes it to Admin and logs in to get a JWT carrying the role.</summary>
    public async Task<(HttpClient Client, Guid UserId, string UserName)> CreateAdminAsync()
    {
        var client = Factory.CreateClient();
        var userName = Unique("admin");
        var registered = await client.PostJsonAsync("/api/v1/auth/register", new RegisterRequest(userName, Password), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);

        await WithDbAsync(async db =>
        {
            var user = await db.Users.SingleAsync(u => u.Id == auth.User.Id, Ct);
            user.Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
            return 0;
        });

        var loggedIn = await client.PostJsonAsync("/api/v1/auth/login", new LoginRequest(userName, Password), Ct);
        var token = (await loggedIn.ReadStrictAsync<AuthResponse>(Ct)).AccessToken;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return (client, auth.User.Id, userName);
    }

    public async Task<(HttpClient Client, Guid UserId, string UserName)> CreatePlayerAsync()
    {
        var client = Factory.CreateClient();
        var userName = Unique("player");
        var registered = await client.PostJsonAsync("/api/v1/auth/register", new RegisterRequest(userName, Password), Ct);
        Assert.Equal(HttpStatusCode.OK, registered.StatusCode);
        var auth = await registered.ReadStrictAsync<AuthResponse>(Ct);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return (client, auth.User.Id, userName);
    }

    /// <summary>A client that authenticates with <paramref name="token"/> as <c>Authorization: Bearer</c>, or as <c>X-Api-Key</c>.</summary>
    public HttpClient KeyClient(string token, bool useApiKeyHeader = false)
    {
        var client = Factory.CreateClient();
        if (useApiKeyHeader)
        {
            client.DefaultRequestHeaders.Add("X-Api-Key", token);
        }
        else
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        return client;
    }

    public static Dictionary<string, ApiKeyAccess> Features(params (string Feature, ApiKeyAccess Level)[] grants) =>
        grants.ToDictionary(g => g.Feature, g => g.Level);

    /// <summary>Creates a key through the admin endpoint (the caller's client must be an admin's).</summary>
    public async Task<ApiKeyTokenResponse> CreateKeyAsync(
        HttpClient admin,
        Dictionary<string, ApiKeyAccess> features,
        Guid? ownerUserId = null,
        bool allWorlds = true,
        IReadOnlyList<Guid>? worldIds = null,
        TimeSpan? lifetime = null,
        int? requestsPerMinute = null,
        DateTimeOffset? autoRenewUntil = null,
        string? name = null)
    {
        var response = await admin.PostJsonAsync(
            "/api/v1/admin/api-keys",
            new ApiKeySettingsRequest(
                name ?? Unique("key"),
                "test",
                ownerUserId,
                features,
                allWorlds,
                worldIds,
                Factory.Time.GetUtcNow() + (lifetime ?? TimeSpan.FromHours(1)),
                requestsPerMinute,
                autoRenewUntil),
            Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await response.ReadStrictAsync<ApiKeyTokenResponse>(Ct);
    }

    /// <summary>
    /// Founds a settlement in <paramref name="worldId"/> (anonymously, on the first start position) and then hands it
    /// to <paramref name="ownerUserId"/> directly in the database, so the owner's JWT or API key is what passes the
    /// ownership filter and no activity row exists yet.
    /// </summary>
    public async Task<SettlementResponse> FoundSettlementAsync(Guid worldId, Guid ownerUserId)
    {
        using var client = Factory.CreateClient();
        var islands = await client.GetFromJsonAsync<List<IslandResponse>>(
            $"/api/v1/worlds/{worldId}/islands", SqliteApiFixture.StrictJson, Ct);
        var island = islands!.First(i => i.StartPositions.Count > 0);
        var plot = island.StartPositions[0];

        var response = await client.PostJsonAsync(
            $"/api/v1/worlds/{worldId}/settlements",
            new FoundSettlementRequest(island.Id, plot.Q, plot.R, Unique("v"), "Ulf", Unique("owner")),
            Ct);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var settlement = await response.ReadStrictAsync<SettlementResponse>(Ct);

        await WithDbAsync(async db =>
        {
            var entity = await db.Settlements.SingleAsync(s => s.Id == settlement.Id, Ct);
            entity.UserId = ownerUserId;
            await db.SaveChangesAsync(Ct);
            return 0;
        });
        return settlement;
    }

    public async Task SetStatusAsync(Guid userId, UserStatus status) => await WithDbAsync(async db =>
    {
        var user = await db.Users.SingleAsync(u => u.Id == userId, Ct);
        user.Status = status;
        await db.SaveChangesAsync(Ct);
        return 0;
    });
}

/// <summary>Base for the SQLite API key suites: one fresh application (and clock) per test.</summary>
public abstract class ApiKeyTestBase : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    internal ApiKeyHarness Harness { get; }

    protected ApiKeyTestBase() => Harness = new ApiKeyHarness(_factory);

    protected BjarnoyApiFactory Factory => _factory;

    protected static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }
}
