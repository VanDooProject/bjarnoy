using System.Net;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Domain.World;
using SkiaSharp;
using Bjarnoy.TestSupport;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>The wire contract of <c>GET /worlds/{id}/fog-overview</c> (map-fog-v2.md §3, "Overview").</summary>
public sealed class FogOverviewEndpointsTests : IAsyncLifetime
{
    private readonly BjarnoyApiFactory _factory = BjarnoyApiFactory.Sqlite();

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public async ValueTask InitializeAsync() => await _factory.MigrateAsync(Ct);

    public async ValueTask DisposeAsync()
    {
        await _factory.DisposeAsync();
        GC.SuppressFinalize(this);
    }

    private static string Unique(string prefix) => $"{prefix}-{Guid.CreateVersion7():N}"[..20];

    private static string Url(Guid worldId) => $"/api/v1/worlds/{worldId}/fog-overview";

    private static HttpRequestMessage Get(string url, string owner, string? ifNoneMatch = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Add("X-Owner-Id", owner);
        if (ifNoneMatch is not null)
        {
            request.Headers.TryAddWithoutValidation("If-None-Match", ifNoneMatch);
        }

        return request;
    }

    [Fact]
    public async Task Answers_with_the_grid_geometry_an_etag_and_a_png_of_that_size()
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 80, cancellationToken: Ct);
        using var client = _factory.CreateClient();

        var response = await client.SendAsync(Get(Url(world.Id), Unique("owner")), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.ReadStrictAsync<FogOverviewResponse>(Ct);
        Assert.Equal($"\"{body.Version}\"", response.Headers.ETag?.ToString());
        Assert.True(body.Factor >= 1);
        using var bitmap = SKBitmap.Decode(Convert.FromBase64String(body.Png));
        Assert.Equal(body.Width, bitmap.Width);
        Assert.Equal(body.Height, bitmap.Height);
        var bounds = FogOverviewGenerator.OverviewBounds(world.Radius, body.Factor);
        Assert.Equal((bounds.MinU, bounds.MinV, bounds.Width / body.Factor, bounds.Height / body.Factor), (body.MinU, body.MinV, body.Width, body.Height));
    }

    [Fact]
    public async Task Repeating_the_request_with_its_etag_is_a_304()
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 80, cancellationToken: Ct);
        var owner = Unique("owner");
        using var client = _factory.CreateClient();

        var first = await client.SendAsync(Get(Url(world.Id), owner), Ct);
        var eTag = first.Headers.ETag?.ToString();
        Assert.False(string.IsNullOrEmpty(eTag));

        Assert.Equal(HttpStatusCode.NotModified, (await client.SendAsync(Get(Url(world.Id), owner, eTag), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(Get(Url(world.Id), owner, "\"stale\""), Ct)).StatusCode);
    }

    [Fact]
    public async Task An_unknown_world_is_a_404()
    {
        using var client = _factory.CreateClient();

        var response = await client.SendAsync(Get(Url(Guid.NewGuid()), Unique("owner")), Ct);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Requires_an_owner_id()
    {
        var world = await _factory.CreateWorldAsync(Unique("w"), 21, 80, cancellationToken: Ct);
        using var client = _factory.CreateClient();

        var response = await client.GetAsync(Url(world.Id), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
