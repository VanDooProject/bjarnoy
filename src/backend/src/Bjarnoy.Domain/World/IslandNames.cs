namespace Bjarnoy.Domain.World;

/// <summary>
/// Deterministic Norse-flavoured island names, built from the world seed and the
/// island's index so a world always names its islands the same way.
/// </summary>
/// <remarks>
/// The legacy generator returned the constant string "Refugium" for every island
/// (<c>IslandFactoryOrganic.GenerateRandomName</c>), which is why the old world
/// map had nothing to label.
/// </remarks>
public static class IslandNames
{
    private static readonly string[] Stems =
    [
        "Bjorn", "Fjord", "Grim", "Hav", "Isa", "Jarl", "Kettil", "Lyng",
        "Mork", "Nord", "Orm", "Rav", "Sig", "Thor", "Ulf", "Vald",
        "Ymir", "Aske", "Brand", "Dyr", "Eik", "Frost", "Gard", "Hjalm",
    ];

    private static readonly string[] Endings =
    [
        "ey", "holm", "vik", "nes", "fjell", "sund", "strand", "berg",
        "havn", "skar", "oy", "dal",
    ];

    /// <summary>The number of distinct stem/ending combinations available for one <paramref name="index"/>.</summary>
    public static int CombinationsPerIsland => Stems.Length * Endings.Length;

    /// <summary>
    /// Names the island at <paramref name="index"/> in the world seeded with
    /// <paramref name="seed"/>. Deterministic for a given seed/index/attempt, so
    /// a world always names its islands the same way.
    /// </summary>
    /// <param name="attempt">
    /// Which candidate to try for this island. <see cref="WorldGenerator"/> tries
    /// 0, 1, 2, ... until it finds a name no earlier island in the same world has
    /// already taken, so two islands never share a display name.
    /// </param>
    public static string For(int seed, int index, int attempt = 0)
    {
        var salt = seed + (attempt * 92_821);
        var stem = Stems[(int)(ValueNoise.Hash2(index, 0, salt + 101) * Stems.Length) % Stems.Length];
        var ending = Endings[(int)(ValueNoise.Hash2(index, 1, salt + 103) * Endings.Length) % Endings.Length];
        return stem + ending;
    }
}
