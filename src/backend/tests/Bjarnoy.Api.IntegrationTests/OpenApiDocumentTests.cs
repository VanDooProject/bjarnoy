using System.Net;
using System.Text.Json;
using Bjarnoy.Api.IntegrationTests.Infrastructure;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// The OpenAPI document has to actually build — the frontend generates its
/// typed client from it, and the Scalar reference a branch deployment serves is
/// empty without it.
/// </summary>
/// <remarks>
/// It is one document over every endpoint, so a single unrepresentable type
/// takes all of it down with a 500 rather than degrading: that is what
/// <c>UpdateWorldSettingsRequest</c>'s <c>Optional&lt;DateTimeOffset?&gt;</c>
/// parameter defaults did, silently, for as long as nobody asked for the
/// document. Hence a test that asks for it.
/// </remarks>
public sealed class OpenApiDocumentTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static BjarnoyApiFactory WithReference() =>
        BjarnoyApiFactory.Sqlite().WithDiagnostics(exposeApiReference: true);

    [Fact]
    public async Task The_document_generates()
    {
        await using var factory = WithReference();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/openapi/v1.json", UriKind.Relative), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task It_describes_every_endpoint_group_the_client_is_generated_from()
    {
        await using var factory = WithReference();
        using var client = factory.CreateClient();

        using var document = JsonDocument.Parse(
            await client.GetStringAsync(new Uri("/openapi/v1.json", UriKind.Relative), Ct));
        var paths = document.RootElement.GetProperty("paths");

        // A spot check rather than a count, which would just churn: the literal
        // /api/v1/... segments are what make the generated client's paths
        // concrete (see docs/tech/backend.md).
        Assert.True(paths.TryGetProperty("/api/v1/worlds", out _));
        Assert.True(paths.TryGetProperty("/api/v1/info", out _));
    }

    [Fact]
    public async Task A_patch_body_that_tells_omitted_from_null_still_has_a_schema()
    {
        // The regression: Optional<T> as a record *parameter* with a default
        // made the exporter serialise null as a struct and throw.
        await using var factory = WithReference();
        using var client = factory.CreateClient();

        using var document = JsonDocument.Parse(
            await client.GetStringAsync(new Uri("/openapi/v1.json", UriKind.Relative), Ct));

        var properties = document.RootElement
            .GetProperty("components").GetProperty("schemas")
            .GetProperty("UpdateWorldSettingsRequest").GetProperty("properties");

        foreach (var name in new[] { "speedFactor", "startsAt", "joinsClosed", "endbossAt" })
        {
            Assert.True(properties.TryGetProperty(name, out _), name);
        }
    }
}
