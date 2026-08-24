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

    /// <summary>
    /// Names the island at <paramref name="index"/> in the world seeded with
    /// <paramref name="seed"/>. Names may repeat in a large world; the index is
    /// the identity, the name is decoration.
    /// </summary>
    public static string For(int seed, int index)
    {
        var stem = Stems[(int)(ValueNoise.Hash2(index, 0, seed + 101) * Stems.Length) % Stems.Length];
        var ending = Endings[(int)(ValueNoise.Hash2(index, 1, seed + 103) * Endings.Length) % Endings.Length];
        return stem + ending;
    }
}
