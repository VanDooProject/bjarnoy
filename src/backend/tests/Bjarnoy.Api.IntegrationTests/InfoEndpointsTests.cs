using System.Net;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.Endpoints;
using Bjarnoy.Api.Hosting;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Microsoft.AspNetCore.Hosting;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <c>GET /api/v1/info</c> — how a deployment is identified once several
/// branches of this repository are running side by side.
/// </summary>
public sealed class InfoEndpointsTests
{
    private const string Commit = "69d77a1c0ffee0123456789abcdef0123456789a";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private static BjarnoyApiFactory Stamped() =>
        BjarnoyApiFactory.Sqlite().WithBuild(
            version: "1.4.0", commit: Commit, branch: "main", builtAt: "2026-09-13T22:00:00Z");

    [Fact]
    public async Task It_reports_what_the_build_stamped_into_the_image()
    {
        await using var factory = Stamped();
        using var client = factory.CreateClient();

        var info = await client.GetFromJsonAsync<BuildInfoResponse>("/api/v1/info", Ct);

        Assert.NotNull(info);
        Assert.Equal("1.4.0", info.Version);
        Assert.Equal(Commit, info.Commit);
        Assert.Equal("main", info.Branch);
        Assert.Equal("2026-09-13T22:00:00Z", info.BuiltAt);
        Assert.Equal("Production", info.Environment);
    }

    [Fact]
    public async Task The_short_commit_is_the_sha_prefix_a_human_reads()
    {
        await using var factory = Stamped();
        using var client = factory.CreateClient();

        var info = await client.GetFromJsonAsync<BuildInfoResponse>("/api/v1/info", Ct);

        Assert.Equal(Commit[..InfoEndpoints.ShortCommitLength], info!.ShortCommit);
        Assert.StartsWith(info.ShortCommit, info.Commit, StringComparison.Ordinal);
    }

    [Fact]
    public async Task An_unstamped_build_says_so_rather_than_inventing_a_version()
    {
        // `dotnet run`, or an image built without the build args. Reporting a
        // wrong commit would be worse than admitting to none.
        await using var factory = BjarnoyApiFactory.Sqlite();
        using var client = factory.CreateClient();

        var info = await client.GetFromJsonAsync<BuildInfoResponse>("/api/v1/info", Ct);

        Assert.Equal(BuildInfoOptions.Unknown, info!.Version);
        Assert.Equal(BuildInfoOptions.Unknown, info.Commit);
        Assert.Equal(BuildInfoOptions.Unknown, info.Branch);
        // Not sliced into a fake seven-character SHA.
        Assert.Equal(BuildInfoOptions.Unknown, info.ShortCommit);
    }

    [Fact]
    public async Task It_answers_without_a_token()
    {
        // Deliberate, for now: a deployment has to be identifiable before
        // anyone can log into it. See InfoEndpoints' remarks.
        await using var factory = Stamped();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/api/v1/info", UriKind.Relative), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
