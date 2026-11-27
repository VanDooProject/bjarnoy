using System.Net;
using System.Net.Http.Headers;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The per-player limit on the endpoints that run the route search: 30 requests per sliding minute, then 429 with the
/// <c>RouteRateLimited</c> rejection and a <c>Retry-After</c>; another player has their own allowance.
/// </summary>
public sealed class RoutePlanningRateLimitTests : IAsyncLifetime
{
    private const int Limit = 30;

    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private async Task<HttpClient> PlayerAsync()
    {
        var client = _factory.CreateClient();
        var response = await client.PostJsonAsync(
            "/api/v1/auth/register", new RegisterRequest(Unique("player"), "correct-horse-battery", null), Ct);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var auth = await response.ReadStrictAsync<AuthResponse>(Ct);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.AccessToken);
        return client;
    }

    // The army does not exist: the request is refused by its owner check, but the limiter counts it all the same,
    // which keeps this test free of any world setup.
    private static Task<HttpResponseMessage> OrderAsync(HttpClient client) =>
        client.PostAsync($"/api/v1/armies/{Guid.NewGuid()}/recall", content: null, Ct);

    [Fact]
    public async Task The_request_over_the_limit_is_refused_with_429_and_a_retry_after()
    {
        var player = await PlayerAsync();
        for (var i = 0; i < Limit; i++)
        {
            Assert.NotEqual(HttpStatusCode.TooManyRequests, (await OrderAsync(player)).StatusCode);
        }

        var refused = await OrderAsync(player);

        Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        Assert.Equal("RouteRateLimited", await refused.RejectionAsync(Ct));
        Assert.True(refused.Headers.RetryAfter?.Delta > TimeSpan.Zero);
    }

    [Fact]
    public async Task Another_player_keeps_their_own_allowance()
    {
        var busy = await PlayerAsync();
        var other = await PlayerAsync();
        for (var i = 0; i <= Limit; i++)
        {
            await OrderAsync(busy);
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, (await OrderAsync(busy)).StatusCode);
        Assert.NotEqual(HttpStatusCode.TooManyRequests, (await OrderAsync(other)).StatusCode);
    }
}
