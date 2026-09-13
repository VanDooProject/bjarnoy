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
public sealed class BuildInfoOptions
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
}
