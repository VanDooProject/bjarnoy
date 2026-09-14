using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// What <c>GET /api/v1/info</c> reports, resolved from every source that might
/// know it.
/// </summary>
/// <remarks>
/// Per field, most authoritative first: what the build stamped into the image
/// (<see cref="BuildInfoOptions"/>), what the platform says it deployed
/// (<c>Build:RuntimeCommit</c>, from Coolify's <c>SOURCE_COMMIT</c>), and what
/// the assembly knows about itself. Anything still unanswered reads
/// <see cref="BuildInfoOptions.Unknown"/> rather than a guess: a wrong commit
/// is worse than an absent one when the question is "is this the build I just
/// pushed?".
/// </remarks>
public sealed class BuildInfo
{
    /// <summary>How much of the commit SHA <see cref="ShortCommit"/> carries.</summary>
    public const int ShortCommitLength = 7;

    private readonly BuildInfoOptions _options;
    private readonly AssemblyBuildStamp _assembly;

    public BuildInfo(IOptions<BuildInfoOptions> options, AssemblyBuildStamp assembly)
    {
        ArgumentNullException.ThrowIfNull(options);

        _options = options.Value;
        _assembly = assembly ?? AssemblyBuildStamp.None;
    }

    /// <summary>Release version — the build arg, else what release-please's manifest put in the assembly.</summary>
    public string Version => First(_options.Version, _assembly.Version);

    /// <summary>
    /// Full commit SHA: baked at build time where it exists (it describes the
    /// bits running), else the platform's, else SourceLink's.
    /// </summary>
    public string Commit => First(_options.Commit, _options.RuntimeCommit, _assembly.Commit);

    /// <summary>The prefix of <see cref="Commit"/> a human reads.</summary>
    /// <remarks>
    /// Anything shorter than the prefix — <c>"unknown"</c>, or an already-short
    /// SHA — passes through whole rather than being sliced into something that
    /// looks like a different commit.
    /// </remarks>
    public string ShortCommit =>
        Commit.Length > ShortCommitLength ? Commit[..ShortCommitLength] : Commit;

    /// <summary>Branch the image was built from — which deployment this is.</summary>
    public string Branch => First(_options.Branch);

    /// <summary>When it was built: the build arg, else the assembly file's timestamp.</summary>
    public string BuiltAt =>
        First(_options.BuiltAt, _assembly.BuiltAt?.ToString("O", System.Globalization.CultureInfo.InvariantCulture));

    /// <summary>The first source that actually knows, or <see cref="BuildInfoOptions.Unknown"/>.</summary>
    private static string First(params string?[] candidates)
    {
        foreach (var candidate in candidates)
        {
            if (!string.IsNullOrWhiteSpace(candidate)
                && !string.Equals(candidate, BuildInfoOptions.Unknown, StringComparison.OrdinalIgnoreCase))
            {
                return candidate;
            }
        }

        return BuildInfoOptions.Unknown;
    }
}
