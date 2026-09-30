using Bjarnoy.Api.Contracts;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Api.IntegrationTests.Infrastructure;

/// <summary>
/// How integration tests get a world with islands in it. A production-size world is 260-hex
/// cells with 150-hex islands and takes seconds to generate, and an island that could cross
/// the world radius is not generated at all — so the old habit of asking for "radius 30" or
/// "radius 60" now yields an empty sea. Tests use the compact preset (see
/// <see cref="WorldGenerationOptions.Compact"/>) at no less than <see cref="MinimumRadius"/>.
/// </summary>
internal static class TestWorlds
{
    /// <summary>The smallest radius that reliably leaves room for several compact islands.</summary>
    public const int MinimumRadius = 300;

    /// <summary>The compact options for <paramref name="seed"/>; a smaller <paramref name="radius"/> than the minimum is raised to it.</summary>
    public static WorldGenerationOptions For(int seed, int radius = MinimumRadius) =>
        WorldGenerationOptions.Compact(seed, Math.Max(radius, MinimumRadius));

    /// <summary>The compact preset as generation overrides, for the admin create/preview/reseed requests.</summary>
    public static WorldGenerationSettingsOverrides CompactOverrides { get; } = Overrides(WorldGenerationOptions.Compact(0));

    /// <summary>An admin "create world" request for a compact world.</summary>
    public static CreateWorldRequest CreateRequest(string name, int? seed, int radius = MinimumRadius, int maxPlayers = 500) =>
        new(name, seed, Math.Max(radius, MinimumRadius), maxPlayers, CompactOverrides);

    private static WorldGenerationSettingsOverrides Overrides(WorldGenerationOptions o) => new(
        IslandCellSize: o.IslandCellSize,
        IslandChance: o.IslandChance,
        IslandMinWidth: o.IslandMinWidth,
        IslandMaxWidth: o.IslandMaxWidth,
        IslandMinSegments: o.IslandMinSegments,
        IslandMaxSegments: o.IslandMaxSegments,
        IslandMinElongation: o.IslandMinElongation,
        IslandMaxElongation: o.IslandMaxElongation,
        IslandMinBend: o.IslandMinBend,
        IslandMaxBend: o.IslandMaxBend,
        IslandCoastWarp: o.IslandCoastWarp,
        IslandCoastWarpScale: o.IslandCoastWarpScale,
        IslandCoastNoise: o.IslandCoastNoise,
        IslandCoastNoiseScale: o.IslandCoastNoiseScale,
        IslandSmallShare: o.IslandSmallShare,
        IslandLargeShare: o.IslandLargeShare);
}
