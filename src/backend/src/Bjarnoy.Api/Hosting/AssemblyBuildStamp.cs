using System.Reflection;

namespace Bjarnoy.Api.Hosting;

/// <summary>
/// What the built assembly can say about itself, with nobody passing anything
/// in — the last resort behind <see cref="BuildInfoOptions"/>'s explicit values.
/// </summary>
/// <param name="Version">
/// From <see cref="AssemblyInformationalVersionAttribute"/>, which
/// <c>Directory.Build.props</c> sets from release-please's manifest.
/// </param>
/// <param name="Commit">
/// The <c>+sha</c> suffix the SDK appends to that attribute when it builds from
/// a git checkout. Absent in the container: the image build has no <c>.git</c>
/// (see <c>.dockerignore</c>), which is why the commit is stamped or supplied
/// by the platform instead.
/// </param>
/// <param name="BuiltAt">
/// The assembly file's timestamp — when it was published, near enough, and free.
/// </param>
public sealed record AssemblyBuildStamp(string? Version, string? Commit, DateTimeOffset? BuiltAt)
{
    /// <summary>Nothing known, for a host that has no assembly to read.</summary>
    public static readonly AssemblyBuildStamp None = new(null, null, null);

    public static AssemblyBuildStamp FromAssembly(Assembly assembly)
    {
        ArgumentNullException.ThrowIfNull(assembly);

        var informational = assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?
            .InformationalVersion;

        string? version = null;
        string? commit = null;
        if (!string.IsNullOrWhiteSpace(informational))
        {
            // "0.1.0+7b3c…" with SourceLink, plain "0.1.0" without.
            var plus = informational.IndexOf('+', StringComparison.Ordinal);
            version = plus < 0 ? informational : informational[..plus];
            commit = plus < 0 || plus == informational.Length - 1 ? null : informational[(plus + 1)..];
        }

        // Empty for a single-file publish, which has no file to stat.
        DateTimeOffset? builtAt = null;
        if (!string.IsNullOrEmpty(assembly.Location) && File.Exists(assembly.Location))
        {
            builtAt = File.GetLastWriteTimeUtc(assembly.Location);
        }

        return new AssemblyBuildStamp(version, commit, builtAt);
    }
}
