using System.Net.Http.Json;
using System.Text.Json;
using Bjarnoy.Api.IntegrationTests.Infrastructure;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// What the app believes about a request that reached it through a proxy.
/// Both deployments put one in front (Coolify's Traefik, and Cloudflare in
/// front of that), and neither fact survives the hop on its own.
/// </summary>
public sealed class ForwardedHeadersTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task The_scheme_follows_X_Forwarded_Proto()
    {
        // The proxy terminates TLS and speaks http to the container. Anything
        // that builds an absolute URL from the request — the OpenAPI document's
        // `servers` entry, which Scalar then fetches — would otherwise emit
        // http:// and be blocked as mixed content on an https:// page.
        await using var factory = BjarnoyApiFactory.Sqlite().WithDiagnostics(exposeApiReference: true);
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https");
        client.DefaultRequestHeaders.Add("X-Forwarded-Host", "bjarnoy.example");

        using var document = JsonDocument.Parse(
            await client.GetStringAsync(new Uri("/openapi/v1.json", UriKind.Relative), Ct));

        var server = document.RootElement.GetProperty("servers")[0].GetProperty("url").GetString();
        Assert.StartsWith("https://", server, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Without_the_header_the_scheme_is_what_the_connection_says()
    {
        // No proxy, no pretending: a plain HTTP request stays http.
        await using var factory = BjarnoyApiFactory.Sqlite().WithDiagnostics(exposeApiReference: true);
        using var client = factory.CreateClient();

        using var document = JsonDocument.Parse(
            await client.GetStringAsync(new Uri("/openapi/v1.json", UriKind.Relative), Ct));

        var server = document.RootElement.GetProperty("servers")[0].GetProperty("url").GetString();
        Assert.StartsWith("http://", server, StringComparison.Ordinal);
    }

    [Fact]
    public async Task The_client_ip_follows_X_Forwarded_For()
    {
        // PlotReservationService caps concurrent reservations per IP. Behind a
        // proxy every visitor would otherwise present the proxy's address, so
        // the cap would be one shared budget for everyone rather than per
        // visitor. The plot-suggestion endpoint is the only reader of it, and
        // it answers here without any world existing — a 400/404 still proves
        // the pipeline ran with the forwarded address rather than throwing.
        await using var factory = BjarnoyApiFactory.Sqlite();
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Forwarded-For", "203.0.113.7");
        client.DefaultRequestHeaders.Add("X-Owner-Id", "player_forwarded-headers-test");

        using var response = await client.GetAsync(
            new Uri($"/api/v1/worlds/{Guid.CreateVersion7()}/plot-suggestion", UriKind.Relative), Ct);

        Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
    }
}
