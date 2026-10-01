using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

internal static class GeneratedIslandExtensions
{
    /// <summary>The island's land camps: the water camps (whale roads) come from their own sea pass.</summary>
    public static IReadOnlyList<Camp> LandCamps(this GeneratedIsland island) => [.. island.Camps.Where(c => !c.IsWater)];
}
