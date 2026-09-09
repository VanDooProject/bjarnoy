using System.Security.Cryptography;
using System.Text;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Locks the server's terrain function to the frontend's.
/// </summary>
/// <remarks>
/// <para>
/// A world is persisted as a seed, not as tiles, and the renderer derives
/// terrain locally from that seed (<c>src/frontend/src/lib/map/worldGenerator.ts</c>).
/// If the two implementations drift, the client draws a coastline the server
/// does not believe in — so the agreement is a contract, not a coincidence, and
/// these are its tests.
/// </para>
/// <para>
/// The checksums below were produced by running the frontend's own
/// <c>terrainAt</c> under Node over every hex in <c>[-60, 60]^2</c> for each
/// seed, taking the first letter of each terrain name in q-major order, and
/// hashing the resulting string. Regenerate them from the TypeScript — never
/// from this code — if the generator is intentionally changed.
/// </para>
/// </remarks>
public class TerrainSamplerParityTests
{
    private const int Extent = 60;

    public static TheoryData<int, string> FrontendChecksums => new()
    {
        { 1, "23a753dc49798e582a1f39f3ba73cec2cf64c57b918e9fda38173e92742cf929" },
        { 7, "7e161aa15c2936a2135e583017b0380df0d30ebc401b3c1431e22543131ab514" },
        { 42, "1d0320c024bcfdb2f9b6e9fd7c2f405759d922b0a7f3b9598eb11c03f3462f3f" },
        { 1337, "2f151a60aff022abb5ad124be2c23c323297a28fa33cb133399445664ca5d25d" },
        { -5, "dd48716fd99606b7caa34bdeb1b6817264b97b1abe238d4d85c6ff6ad5c19a7b" },
        { 2147483, "a0e78b92e5414de6faecc2e484a9683824ae3d8a67ca6688e0e64fa087d266d9" },
        { 0, "b609582d6dc3e0410527608f67ed9886c86b2a749c8e1995da2062240d749389" },
    };

    [Theory]
    [MemberData(nameof(FrontendChecksums))]
    public void Terrain_matches_the_frontend_generator_hex_for_hex(int seed, string expected)
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(seed));
        var letters = new StringBuilder((((2 * Extent) + 1) * ((2 * Extent) + 1)));

        for (var q = -Extent; q <= Extent; q++)
        {
            for (var r = -Extent; r <= Extent; r++)
            {
                letters.Append(sampler.TerrainAt(new HexCoord(q, r)).ToWireName()[0]);
            }
        }

        var actual = Convert.ToHexStringLower(
            SHA256.HashData(Encoding.UTF8.GetBytes(letters.ToString())));

        Assert.Equal(expected, actual);
    }

    [Theory]
    [InlineData(0, 0, 0.81532)]
    [InlineData(1, 0, 0.97890)]
    [InlineData(-1, 2, 0.54521)]
    [InlineData(12345, -6789, 0.71646)]
    public void Hash2_reproduces_the_frontends_hash(int x, int y, double expected)
    {
        // Values read off the TypeScript hash2 under Node; five decimal places is
        // exact, since the function's range is k/100000.
        Assert.Equal(expected, ValueNoise.Hash2(x, y, 1), 5);
    }

    [Fact]
    public void Hash2_stays_in_the_unit_interval_for_extreme_inputs()
    {
        int[] coords = [int.MinValue, -1_000_000, -1, 0, 1, 1_000_000, int.MaxValue];

        foreach (var x in coords)
        {
            foreach (var y in coords)
            {
                var value = ValueNoise.Hash2(x, y, 12345);
                Assert.InRange(value, 0.0, 0.99999);
            }
        }
    }

    [Fact]
    public void Sampling_is_pure_so_two_samplers_never_interfere()
    {
        // The legacy generator set a static Noise.Seed, so generating two worlds
        // concurrently corrupted both. Interleave two samplers to prove this one
        // holds no shared state.
        var a = new TerrainSampler(WorldGenerationOptions.ForSeed(1));
        var b = new TerrainSampler(WorldGenerationOptions.ForSeed(2));

        var expectedA = HexCoord.Origin.WithinRadius(15).Select(a.TerrainAt).ToList();

        var interleaved = new List<Terrain>();
        foreach (var coord in HexCoord.Origin.WithinRadius(15))
        {
            b.TerrainAt(coord);
            interleaved.Add(a.TerrainAt(coord));
            b.TerrainAt(coord);
        }

        Assert.Equal(expectedA, interleaved);
    }

    [Fact]
    public void Sampling_the_same_world_in_parallel_gives_the_same_map()
    {
        var sampler = new TerrainSampler(WorldGenerationOptions.ForSeed(99));
        var coords = HexCoord.Origin.WithinRadius(25).ToList();
        var sequential = coords.Select(sampler.TerrainAt).ToList();

        var parallel = new Terrain[coords.Count];
        Parallel.For(0, coords.Count, i => parallel[i] = sampler.TerrainAt(coords[i]));

        Assert.Equal(sequential, parallel);
    }
}
