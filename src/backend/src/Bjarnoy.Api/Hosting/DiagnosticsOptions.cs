namespace Bjarnoy.Api.Hosting;

/// <summary>
/// Which debugging surfaces this deployment exposes.
/// </summary>
/// <remarks>
/// <para>
/// Both default to the answer <see cref="BuildInfoOptions.IsProductionBuild"/>
/// gives, so a branch deployment is debuggable the moment it comes up and the
/// production one is not, with nothing to configure either way — the branch is
/// already stamped into the image, and Coolify rebuilds per branch.
/// </para>
/// <para>
/// They are runtime configuration rather than a build-time switch on purpose:
/// baking them in would mean two images that differ only in a boolean, and no
/// way to close a surface on a running deployment (or open one) without waiting
/// for a rebuild. Set <c>Diagnostics__PublicBuildInfo</c> or
/// <c>Diagnostics__ExposeApiReference</c> to override.
/// </para>
/// </remarks>
public sealed class DiagnosticsOptions
{
    public const string SectionName = "Diagnostics";

    /// <summary>
    /// Serve <c>GET /api/v1/info</c> to anyone. Null follows the build: open on
    /// a branch deployment, Admin-only on main and on releases.
    /// </summary>
    public bool? PublicBuildInfo { get; set; }

    /// <summary>
    /// Map the OpenAPI document and the Scalar reference outside development.
    /// Null follows the build, same as <see cref="PublicBuildInfo"/>.
    /// </summary>
    public bool? ExposeApiReference { get; set; }
}
