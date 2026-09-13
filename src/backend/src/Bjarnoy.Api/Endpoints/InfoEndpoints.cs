using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.Hosting;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.Endpoints;

/// <summary>
/// What this deployment is running, for the admin UI to display.
/// </summary>
/// <remarks>
/// <para>
/// Unauthenticated on a branch deployment, so it can be identified while it is
/// still being brought up — before there is an admin account to log in with,
/// and while the thing being debugged may be login itself. Admin-only on main
/// and on releases, where naming a version and a commit to anyone who asks is a
/// small thing to hand an attacker for free. <c>DiagnosticsOptions</c> decides,
/// and can be overridden per deployment.
/// </para>
/// <para>
/// It answers only with what the build stamped into the image, never with
/// configuration, connection strings, or anything a request could influence —
/// so the open case leaks nothing beyond the identity of the build.
/// </para>
/// </remarks>
public static class InfoEndpoints
{
    /// <summary>How much of the commit SHA <c>ShortCommit</c> carries.</summary>
    public const int ShortCommitLength = 7;

    /// <param name="publicAccess">
    /// Whether anyone may read it. False puts it behind the Admin policy, which
    /// is what a production build does — see <c>DiagnosticsOptions</c>.
    /// </param>
    public static IEndpointRouteBuilder MapInfoEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet,
        bool publicAccess)
    {
        ArgumentNullException.ThrowIfNull(app);

        var info = app.MapGet("/api/v1/info", GetBuildInfo)
            .WithApiVersionSet(versionSet)
            .WithTags("Info")
            .WithName("GetBuildInfo")
            .WithSummary("The version, commit and branch this deployment was built from.");

        if (!publicAccess)
        {
            info.RequireAuthorization("Admin");
        }

        return app;
    }

    private static Ok<BuildInfoResponse> GetBuildInfo(
        IOptions<BuildInfoOptions> options,
        IHostEnvironment environment)
    {
        var build = options.Value;

        return TypedResults.Ok(new BuildInfoResponse(
            Version: build.Version,
            Commit: build.Commit,
            ShortCommit: Shorten(build.Commit),
            Branch: build.Branch,
            BuiltAt: build.BuiltAt,
            Environment: environment.EnvironmentName));
    }

    /// <summary>
    /// The first few characters of a real SHA. Anything shorter than that —
    /// <c>"unknown"</c>, or an already-short SHA — is passed through whole
    /// rather than sliced into something that looks like a different commit.
    /// </summary>
    private static string Shorten(string commit) =>
        commit.Length > ShortCommitLength ? commit[..ShortCommitLength] : commit;
}
