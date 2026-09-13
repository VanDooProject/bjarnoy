using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.Endpoints;
using Bjarnoy.Api.Hosting;
using Bjarnoy.Api.IntegrationTests.Infrastructure;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// <c>GET /api/v1/info</c> — how a deployment is identified once several
/// branches of this repository are running side by side.
/// </summary>
public sealed class InfoEndpointsTests
{
    private const string Commit = "69d77a1c0ffee0123456789abcdef0123456789a";

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    /// <summary>
    /// A branch build, which is the case that serves the endpoint openly — the
    /// gate itself is covered further down.
    /// </summary>
    private static BjarnoyApiFactory Stamped() =>
        BjarnoyApiFactory.Sqlite().WithBuild(
            version: "1.4.0",
            commit: Commit,
            branch: "claude/some-branch",
            builtAt: "2026-09-13T22:00:00Z");

    [Fact]
    public async Task It_reports_what_the_build_stamped_into_the_image()
    {
        await using var factory = Stamped();
        using var client = factory.CreateClient();

        var info = await client.GetFromJsonAsync<BuildInfoResponse>("/api/v1/info", Ct);

        Assert.NotNull(info);
        Assert.Equal("1.4.0", info.Version);
        Assert.Equal(Commit, info.Commit);
        Assert.Equal("claude/some-branch", info.Branch);
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
        // wrong commit would be worse than admitting to none. Opened
        // explicitly: an unstamped build is treated as production, and this
        // test is about the payload rather than the gate.
        await using var factory = BjarnoyApiFactory.Sqlite().WithDiagnostics(publicBuildInfo: true);
        using var client = factory.CreateClient();

        var info = await client.GetFromJsonAsync<BuildInfoResponse>("/api/v1/info", Ct);

        Assert.Equal(BuildInfoOptions.Unknown, info!.Version);
        Assert.Equal(BuildInfoOptions.Unknown, info.Commit);
        Assert.Equal(BuildInfoOptions.Unknown, info.Branch);
        // Not sliced into a fake seven-character SHA.
        Assert.Equal(BuildInfoOptions.Unknown, info.ShortCommit);
    }

    [Fact]
    public async Task A_branch_build_answers_without_a_token()
    {
        // Deliberate: a branch deployment has to be identifiable before anyone
        // can log into it — and the thing being debugged may be login itself.
        await using var factory = BjarnoyApiFactory.Sqlite()
            .WithBuild(version: "0.0.0", commit: Commit, branch: "claude/some-branch", builtAt: "now");
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/api/v1/info", UriKind.Relative), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Theory]
    [InlineData("main")]
    [InlineData("v1.2.3")]
    [InlineData(BuildInfoOptions.Unknown)]
    public async Task A_production_build_refuses_an_anonymous_caller(string branch)
    {
        // A release cut from a tag, and a build that cannot say what it is, are
        // treated as production too: the surface opens only for a build that
        // can prove it is a branch deployment.
        await using var factory = BjarnoyApiFactory.Sqlite()
            .WithBuild(version: "1.2.3", commit: Commit, branch: branch, builtAt: "now");
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/api/v1/info", UriKind.Relative), Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task An_admin_still_reads_it_on_a_production_build()
    {
        await using var factory = BjarnoyApiFactory.Sqlite()
            .WithBuild(version: "1.2.3", commit: Commit, branch: "main", builtAt: "now");
        await factory.MigrateAsync(Ct);
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", await CreateAdminTokenAsync(factory, client));

        var info = await client.GetFromJsonAsync<BuildInfoResponse>("/api/v1/info", Ct);

        Assert.Equal("main", info!.Branch);
    }

    [Fact]
    public async Task A_deployment_can_open_it_on_a_production_build()
    {
        // The escape hatch a deployment sets as Diagnostics__PublicBuildInfo.
        await using var factory = BjarnoyApiFactory.Sqlite()
            .WithBuild(version: "1.2.3", commit: Commit, branch: "main", builtAt: "now")
            .WithDiagnostics(publicBuildInfo: true);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync(new Uri("/api/v1/info", UriKind.Relative), Ct);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    /// <summary>Registers a player, promotes it to Admin, and logs in for a token carrying the role.</summary>
    private static async Task<string> CreateAdminTokenAsync(BjarnoyApiFactory factory, HttpClient client)
    {
        var registered = await client.PostAsJsonAsync(
            "/api/v1/auth/register",
            new { userName = "info-admin", password = "correct-horse-battery" },
            Ct);
        registered.EnsureSuccessStatusCode();
        var auth = await registered.Content.ReadFromJsonAsync<AuthEnvelope>(Ct);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
            var user = await db.Users.SingleAsync(u => u.Id == auth!.User.Id, Ct);
            user.Role = UserRole.Admin;
            await db.SaveChangesAsync(Ct);
        }

        var loggedIn = await client.PostAsJsonAsync(
            "/api/v1/auth/login",
            new { userName = "info-admin", password = "correct-horse-battery" },
            Ct);
        loggedIn.EnsureSuccessStatusCode();

        return (await loggedIn.Content.ReadFromJsonAsync<AuthEnvelope>(Ct))!.AccessToken;
    }

    /// <summary>Only the two fields these tests need out of the auth response.</summary>
    private sealed record AuthEnvelope(string AccessToken, AuthUser User);

    private sealed record AuthUser(Guid Id);
}
