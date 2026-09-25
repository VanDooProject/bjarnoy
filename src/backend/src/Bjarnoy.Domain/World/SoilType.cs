namespace Bjarnoy.Domain.World;

/// <summary>
/// Which crop an island's soil favours — decided once per island (see
/// <see cref="TerrainSampler.SoilAt"/>), not per hex, so every Grass tile on
/// the same island grows the same thing. Farm and PumpkinFarm are otherwise
/// identical buildings (same terrain, same cost shape); this is what makes
/// them mutually exclusive per island rather than a free player choice.
/// </summary>
public enum SoilType
{
    /// <summary>Grows <see cref="Buildings.BuildingType.Farm"/>.</summary>
    Wheat = 0,

    /// <summary>Grows <see cref="Buildings.BuildingType.PumpkinFarm"/> — the higher-yield crop, so a pumpkin-soil island is the "more fertile" one.</summary>
    Pumpkin = 1,
}
