using System.Text.RegularExpressions;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// What this build is, as baked in by <c>deploy/Dockerfile</c>'s build args and
/// read back by <c>GET /api/v1/info</c>.
/// </summary>
/// <remarks>
/// Configuration rather than assembly attributes, following the same convention
/// as <c>Database:ConnectionString</c> and <c>Jwt:SigningKey</c>: the image sets
/// <c>Build__Commit</c> and friends in its runtime stage, and a plain
/// <c>dotnet run</c> that sets nothing simply reports <see cref="Unknown"/>
/// instead of failing to start.
/// </remarks>
public sealed partial class BuildInfoOptions
{
    public const string SectionName = "Build";

    /// <summary>What every field reads as when the build did not stamp it.</summary>
    public const string Unknown = "unknown";

    /// <summary>Release version, e.g. the tag release-please cut.</summary>
    public string Version { get; set; } = Unknown;

    /// <summary>Full commit SHA the image was built from.</summary>
    public string Commit { get; set; } = Unknown;

    /// <summary>Branch the image was built from — which deployment this is, when several run in parallel.</summary>
    public string Branch { get; set; } = Unknown;

    /// <summary>When the image was built, ISO-8601, or <see cref="Unknown"/>.</summary>
    public string BuiltAt { get; set; } = Unknown;

    /// <summary>
    /// The commit the *platform* says it deployed, when the image itself was
    /// not stamped with one.
    /// </summary>
    /// <remarks>
    /// Coolify writes <c>SOURCE_COMMIT</c> into every deployment's runtime
    /// environment, but only passes it to the build when "Include SOURCE_COMMIT
    /// in build" is enabled — off by default, because a build arg that changes
    /// with every commit invalidates the Docker cache. Reading it at runtime
    /// gets the SHA with neither the setting nor the cost.
    /// </remarks>
    public string RuntimeCommit { get; set; } = Unknown;

    /// <summary>
    /// The commit to report. The baked one wins where it exists: it describes
    /// the bits actually running, whereas the runtime value describes what the
    /// platform believes it deployed — the same thing for an image the platform
    /// just built, but not for a prebuilt one it merely started.
    /// </summary>
    public string ResolvedCommit =>
        IsStamped(Commit) ? Commit
        : IsStamped(RuntimeCommit) ? RuntimeCommit
        : Unknown;

    /// <summary>Whether a field carries a real value rather than a placeholder.</summary>
    private static bool IsStamped(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && !string.Equals(value, Unknown, StringComparison.OrdinalIgnoreCase);

    /// <summary>The branch a production deployment is cut from.</summary>
    public const string ProductionBranch = "main";

    /// <summary>
    /// Whether this build is one that faces players, which is what decides
    /// whether the diagnostic surfaces (<c>/api/v1/info</c>, the Scalar API
    /// reference) are open — see <see cref="DiagnosticsOptions"/>.
    /// </summary>
    /// <remarks>
    /// Deliberately answered the safe way round: a build is production unless
    /// it can prove it is a branch deployment. An image built without the build
    /// args, or a release cut from a tag rather than a branch, reports
    /// <see cref="Unknown"/> or <c>v1.2.3</c> here — neither is a feature
    /// branch, and guessing "not production" for either would open a debugging
    /// surface on exactly the deployment that must not have one.
    /// </remarks>
    public bool IsProductionBuild => IsProduction(Branch);

    /// <inheritdoc cref="IsProductionBuild"/>
    public static bool IsProduction(string? branch) =>
        string.IsNullOrWhiteSpace(branch)
        || string.Equals(branch, Unknown, StringComparison.OrdinalIgnoreCase)
        || string.Equals(branch, ProductionBranch, StringComparison.OrdinalIgnoreCase)
        || ReleaseTag().IsMatch(branch);

    /// <summary>A tag release-please cut, e.g. <c>v0.2.1</c> — not a branch.</summary>
    [GeneratedRegex(@"^v\d", RegexOptions.CultureInvariant)]
    private static partial Regex ReleaseTag();
}
