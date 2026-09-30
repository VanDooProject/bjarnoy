using System.Collections.Concurrent;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Generated worlds shared between tests. A default-size world is ~30 islands and
/// ~150k land hexes, a second or several to generate, and many tests only read it,
/// so each distinct set of options is generated once per test run.
/// </summary>
internal static class TestWorlds
{
    private static readonly ConcurrentDictionary<WorldGenerationOptions, Lazy<GeneratedWorld>> Cache = new();

    public static GeneratedWorld Generate(WorldGenerationOptions options) =>
        Cache.GetOrAdd(options, o => new Lazy<GeneratedWorld>(() => new WorldGenerator(o).Generate())).Value;

    /// <summary>The production-size world for <paramref name="seed"/>.</summary>
    public static GeneratedWorld Default(int seed) => Generate(WorldGenerationOptions.ForSeed(seed));

    /// <summary>The scaled-down preset (see <see cref="WorldGenerationOptions.Compact"/>).</summary>
    public static GeneratedWorld Compact(int seed, int radius = 300) => Generate(WorldGenerationOptions.Compact(seed, radius));
}
