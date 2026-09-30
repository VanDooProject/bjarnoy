using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// <c>src/shared/terrain-checksum-golden.json</c>: SHA-256 digests of the terrain,
/// orientation and variant of every hex on a coarse lattice over the default world,
/// generated from the frontend's <c>worldGenerator.ts</c> by
/// <c>scripts/regen-goldens/terrain-checksum-golden.ts</c>. The scan below is the C#
/// twin of <c>src/frontend/src/lib/map/testing/terrainChecksums.ts</c> and must walk the
/// same hexes in the same order.
/// </summary>
internal static class TerrainChecksumFixture
{
    private static readonly Lazy<JsonElement> Root = new(Load);

    public static TheoryData<int> Seeds()
    {
        var data = new TheoryData<int>();
        foreach (var entry in Root.Value.GetProperty("seeds").EnumerateArray())
        {
            data.Add(entry.GetProperty("seed").GetInt32());
        }

        return data;
    }

    public static string Expected(int seed, string kind) =>
        Root.Value.GetProperty("seeds").EnumerateArray()
            .Single(e => e.GetProperty("seed").GetInt32() == seed)
            .GetProperty(kind).GetString()!;

    private static readonly System.Collections.Concurrent.ConcurrentDictionary<int, (string, string, string)> Computed = new();

    /// <summary>
    /// Digests of (terrain letters, orientation indices, variant digits) for <paramref name="seed"/>;
    /// computed once per seed, since several tests read different parts of it.
    /// </summary>
    public static (string Terrain, string Orientation, string Variant) Compute(int seed) =>
        Computed.GetOrAdd(seed, ComputeCore);

    private static (string, string, string) ComputeCore(int seed)
    {
        var options = WorldGenerationOptions.ForSeed(seed);
        var sampler = new TerrainSampler(options);
        var scan = Root.Value.GetProperty("scan");
        var extent = scan.GetProperty("extent").GetInt32();
        var stride = scan.GetProperty("stride").GetInt32();
        var terrain = new StringBuilder();
        var orientation = new StringBuilder();
        var variant = new StringBuilder();

        for (var q = -extent; q <= extent; q += stride)
        {
            for (var r = -extent; r <= extent; r += stride)
            {
                var coord = new HexCoord(q, r);
                if (coord.DistanceTo(HexCoord.Origin) > options.Radius)
                {
                    continue;
                }

                terrain.Append(sampler.TerrainAt(coord).ToWireName()[0]);
                orientation.Append((int)sampler.OrientationAt(coord));
                variant.Append(sampler.VariantAt(coord));
            }
        }

        return (Digest(terrain), Digest(orientation), Digest(variant));
    }

    private static string Digest(StringBuilder text) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text.ToString())));

    private static JsonElement Load()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Bjarnoy.slnx")))
        {
            dir = dir.Parent;
        }

        if (dir?.Parent is null)
        {
            throw new InvalidOperationException("Could not locate Bjarnoy.slnx while searching for the repo root.");
        }

        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(dir.Parent.FullName, "shared", "terrain-checksum-golden.json")));
        return doc.RootElement.Clone();
    }
}
