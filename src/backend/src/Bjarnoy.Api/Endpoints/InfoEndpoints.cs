using Asp.Versioning.Builder;
using Bjarnoy.Api.Contracts;
using Bjarnoy.Api.Hosting;
using Microsoft.AspNetCore.Http.HttpResults;

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
/// For now main and releases are public too, until <see cref="TemporarilyPublicUntilYear"/>
/// is over: then it answers with an error instead, so whether it stays public
/// is decided again rather than forgotten.
/// </para>
/// <para>
/// It answers only with what the build stamped into the image, never with
/// configuration, connection strings, or anything a request could influence —
/// so the open case leaks nothing beyond the identity of the build.
/// </para>
/// </remarks>
public static class InfoEndpoints
{
    /// <summary>The last year a production build serves it to anyone without an explicit override.</summary>
    public const int TemporarilyPublicUntilYear = 2026;

    /// <param name="publicAccess">
    /// Whether anyone may read it. False puts it behind the Admin policy — see
    /// <c>DiagnosticsOptions</c>.
    /// </param>
    /// <param name="temporarilyPublic">
    /// Whether it is public only because of the temporary production default,
    /// which stops answering after <see cref="TemporarilyPublicUntilYear"/>.
    /// </param>
    public static IEndpointRouteBuilder MapInfoEndpoints(
        this IEndpointRouteBuilder app,
        ApiVersionSet versionSet,
        bool publicAccess,
        bool temporarilyPublic = false)
    {
        ArgumentNullException.ThrowIfNull(app);

        var info = app.MapGet(
                "/api/v1/info",
                (BuildInfo build, IHostEnvironment environment, TimeProvider time) =>
                    GetBuildInfo(build, environment, time, temporarilyPublic))
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

    private static Results<Ok<BuildInfoResponse>, ProblemHttpResult> GetBuildInfo(
        BuildInfo build, IHostEnvironment environment, TimeProvider time, bool temporarilyPublic)
    {
        if (temporarilyPublic && time.GetUtcNow().Year != TemporarilyPublicUntilYear)
        {
            return TypedResults.Problem(
                title: "The temporary public /api/v1/info has expired.",
                detail: $"Production builds serve /api/v1/info to anyone only until the end of {TemporarilyPublicUntilYear}. "
                    + "Decide whether it stays public: set Diagnostics__PublicBuildInfo, "
                    + "or change the default in Program.cs and remove this check in InfoEndpoints.",
                statusCode: StatusCodes.Status500InternalServerError);
        }

        return TypedResults.Ok(new BuildInfoResponse(
            Version: build.Version,
            Commit: build.Commit,
            ShortCommit: build.ShortCommit,
            Branch: build.Branch,
            BuiltAt: build.BuiltAt,
            Environment: environment.EnvironmentName));
    }
}
