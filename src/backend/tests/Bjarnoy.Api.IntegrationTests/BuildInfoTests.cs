using Bjarnoy.Api.Hosting;
using Microsoft.Extensions.Options;

namespace Bjarnoy.Api.IntegrationTests;

/// <summary>
/// Which source wins for each field of <c>GET /api/v1/info</c>. Four of them
/// can answer, and they disagree in exactly the situations that matter — a
/// prebuilt image started by a platform that deployed a different commit, an
/// image built without build args, a plain <c>dotnet run</c>.
/// </summary>
public sealed class BuildInfoTests
{
    private const string Baked = "1111111111111111111111111111111111111111";
    private const string FromPlatform = "2222222222222222222222222222222222222222";
    private const string FromSourceLink = "3333333333333333333333333333333333333333";

    private static BuildInfo Resolve(BuildInfoOptions options, AssemblyBuildStamp? assembly = null) =>
        new(Options.Create(options), assembly ?? AssemblyBuildStamp.None);

    [Fact]
    public void A_baked_commit_beats_the_platform_and_the_assembly()
    {
        // It describes the bits actually running; the others describe what
        // something else believes it started.
        var build = Resolve(
            new BuildInfoOptions { Commit = Baked, RuntimeCommit = FromPlatform },
            new AssemblyBuildStamp(null, FromSourceLink, null));

        Assert.Equal(Baked, build.Commit);
    }

    [Fact]
    public void The_platform_commit_fills_in_for_an_unstamped_image()
    {
        // The Coolify case: SOURCE_COMMIT reaches the container but not the
        // build, so nothing was baked in.
        var build = Resolve(
            new BuildInfoOptions { RuntimeCommit = FromPlatform },
            new AssemblyBuildStamp(null, FromSourceLink, null));

        Assert.Equal(FromPlatform, build.Commit);
    }

    [Fact]
    public void The_assembly_answers_when_nothing_else_does()
    {
        // `dotnet run` from a checkout: the SDK appends the SHA to the
        // informational version. The container never has this — no .git in the
        // build context.
        var build = Resolve(new BuildInfoOptions(), new AssemblyBuildStamp(null, FromSourceLink, null));

        Assert.Equal(FromSourceLink, build.Commit);
    }

    [Fact]
    public void Nothing_known_is_reported_as_unknown_rather_than_guessed()
    {
        var build = Resolve(new BuildInfoOptions());

        Assert.Equal(BuildInfoOptions.Unknown, build.Commit);
        Assert.Equal(BuildInfoOptions.Unknown, build.Version);
        Assert.Equal(BuildInfoOptions.Unknown, build.Branch);
        Assert.Equal(BuildInfoOptions.Unknown, build.BuiltAt);
        // Not sliced into a fake seven-character SHA.
        Assert.Equal(BuildInfoOptions.Unknown, build.ShortCommit);
    }

    [Fact]
    public void The_version_falls_back_to_the_one_release_please_put_in_the_assembly()
    {
        var build = Resolve(new BuildInfoOptions(), new AssemblyBuildStamp("0.4.2", null, null));

        Assert.Equal("0.4.2", build.Version);
    }

    [Fact]
    public void The_build_time_falls_back_to_the_assembly_file()
    {
        // Nothing supplies BUILT_AT in the compose stack — compose cannot
        // produce a timestamp — and the published file's own is the same thing.
        var built = new DateTimeOffset(2026, 9, 14, 1, 2, 3, TimeSpan.Zero);

        var build = Resolve(new BuildInfoOptions(), new AssemblyBuildStamp(null, null, built));

        Assert.Equal("2026-09-14T01:02:03.0000000+00:00", build.BuiltAt);
    }

    [Fact]
    public void A_short_sha_is_not_padded_or_cut()
    {
        var build = Resolve(new BuildInfoOptions { Commit = "abc" });

        Assert.Equal("abc", build.ShortCommit);
    }

    [Fact]
    public void This_assembly_carries_the_version_and_a_timestamp()
    {
        // Guards the MSBuild side: Directory.Build.props reads
        // .release-please-manifest.json, and losing that would silently drop
        // the only version a Coolify build has.
        var stamp = AssemblyBuildStamp.FromAssembly(typeof(BuildInfo).Assembly);

        Assert.False(string.IsNullOrWhiteSpace(stamp.Version));
        Assert.NotEqual("1.0.0", stamp.Version);
        Assert.NotNull(stamp.BuiltAt);
    }
}
