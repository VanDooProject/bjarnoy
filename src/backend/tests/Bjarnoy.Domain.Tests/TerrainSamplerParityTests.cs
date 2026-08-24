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
        { 1, "9a29edc4b0cf92da9998cd77aa39fe5ca5116091f49122ed8373f4c440e20bf1" },
        { 7, "18bd29a41f98fc999be8d0ae09673b02042b96b146da0328cf36bd32cb00558d" },
        { 42, "7a1ee11195876ef6f80d8aa0dd27410549a4dd377c172c44dbd99ad6d6f461d7" },
        { 1337, "bde5374b1963b75bf9bbe8f80f67075fac90e8c36f0e1fe9c616ce040191bc24" },
        { -5, "7ed4a0d48df5dafbaeb12fa70522566227738e91f84d25963d1c5b77f9b5f373" },
        { 2147483, "871d17acfe0d129ccd75d6727fa47ef7974958b8b9cf21b7db0894aad6d9fb6f" },
        { 0, "2a7e13706982c4ace524540aebeb3b35f1750e3a870a7355446aaac3d2a14631" },
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
