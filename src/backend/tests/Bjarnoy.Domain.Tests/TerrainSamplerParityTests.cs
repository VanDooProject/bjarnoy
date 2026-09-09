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
        { 1, "fef2c988adda950e66667e758656782207cbaeb0e863f741de8dff7b188f3759" },
        { 7, "8dda5769fbced3fc0a4c873b33e2a61cd2cf8f75cbb6ffc02e9c86a37b9042d5" },
        { 42, "f18e2d018fb455d29201dc3799944042edfb1a78b770ba8cccf43fb7739aa11a" },
        { 1337, "c4368d871acc5bc45f01747eed5e27b54ba88248e27a1791d02568a0eaf96216" },
        { -5, "e000c4d0227e1ac59e2d19d9b5d49ca5ec43f7e473d018f3cf9f25f1757c06b6" },
        { 2147483, "825c803efec8620d5ca90bf10f5198003ca4c8bacb7dddbb0a99a4fc35e4009f" },
        { 0, "ff645470018eb0e019d660a0a170aeab48f45bf5613bee744a37eef9df8043f7" },
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
