using Bjarnoy.Api.Hosting;
using Bjarnoy.Api.IntegrationTests.Infrastructure;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Who gets the Scalar API reference. A branch deployment on Coolify is
/// something to poke at, so it is served there; a production build is not.
/// </summary>
/// <remarks>
/// The assertions read the body rather than the status code on purpose: an
/// unmapped <c>/scalar/v1</c> is not a 404 in this app — it falls through to
/// the SPA shell (<c>MapFallbackToFile</c>), so both cases answer 200 and only
/// the content says which one happened.
/// </remarks>
public sealed class ApiReferenceExposureTests
{
    private const string ScalarTitle = "Scalar API Reference";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task A_branch_build_serves_the_api_reference()
    {
        await using var factory = BjarnoyApiFactory.Sqlite()
            .WithBuild(version: "0.0.0", commit: "abc", branch: "claude/some-branch", builtAt: "now");
        using var client = factory.CreateClient();

        var body = await client.GetStringAsync(new Uri("/scalar/v1", UriKind.Relative), Ct);

        Assert.Contains(ScalarTitle, body, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("main")]
    [InlineData("v2.0.0")]
    [InlineData(BuildInfoOptions.Unknown)]
    public async Task A_production_build_does_not(string branch)
    {
        await using var factory = BjarnoyApiFactory.Sqlite()
            .WithBuild(version: "1.0.0", commit: "abc", branch: branch, builtAt: "now");
        using var client = factory.CreateClient();

        var body = await client.GetStringAsync(new Uri("/scalar/v1", UriKind.Relative), Ct);

        Assert.DoesNotContain(ScalarTitle, body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_deployment_can_ask_for_it_on_a_production_build()
    {
        await using var factory = BjarnoyApiFactory.Sqlite()
            .WithBuild(version: "1.0.0", commit: "abc", branch: "main", builtAt: "now")
            .WithDiagnostics(exposeApiReference: true);
        using var client = factory.CreateClient();

        var body = await client.GetStringAsync(new Uri("/scalar/v1", UriKind.Relative), Ct);

        Assert.Contains(ScalarTitle, body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task And_can_close_it_on_a_branch_build()
    {
        await using var factory = BjarnoyApiFactory.Sqlite()
            .WithBuild(version: "0.0.0", commit: "abc", branch: "claude/some-branch", builtAt: "now")
            .WithDiagnostics(exposeApiReference: false);
        using var client = factory.CreateClient();

        var body = await client.GetStringAsync(new Uri("/scalar/v1", UriKind.Relative), Ct);

        Assert.DoesNotContain(ScalarTitle, body, StringComparison.Ordinal);
    }
}
