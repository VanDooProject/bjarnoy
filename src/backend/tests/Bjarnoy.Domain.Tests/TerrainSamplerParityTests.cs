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
/// The digests live in <c>src/shared/terrain-checksum-golden.json</c> (see
/// <see cref="TerrainChecksumFixture"/>): produced by the frontend's own <c>terrainAt</c>
/// over a lattice covering the whole default world, and asserted by the frontend's
/// <c>terrainChecksum.golden.test.ts</c> too. Regenerate them from the TypeScript —
/// never from this code — with <c>scripts/regen-goldens/terrain-checksum-golden.ts</c>
/// if the generator is intentionally changed.
/// </para>
/// </remarks>
public class TerrainSamplerParityTests
{
    public static TheoryData<int> Seeds => TerrainChecksumFixture.Seeds();

    [Theory]
    [MemberData(nameof(Seeds))]
    public void Terrain_matches_the_frontend_generator_hex_for_hex(int seed)
    {
        var (terrain, _, _) = TerrainChecksumFixture.Compute(seed);

        Assert.Equal(TerrainChecksumFixture.Expected(seed, "terrain"), terrain);
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

    /// <summary>A window of hexes across the coast of the compact preset's first island.</summary>
    private static List<HexCoord> CoastalWindow(WorldGenerationOptions options, int radius)
    {
        var shape = new TerrainSampler(options).EnumerateIslandShapes().First();
        var centre = HexCoord.FromOddQ(new OffsetCoord((int)Math.Floor(shape.CentreX + 0.5), (int)Math.Floor(shape.CentreY + 0.5)));
        return [.. centre.WithinRadius(radius)];
    }

    [Fact]
    public void Sampling_is_pure_so_two_samplers_never_interfere()
    {
        // The legacy generator set a static Noise.Seed, so generating two worlds
        // concurrently corrupted both. Interleave two samplers to prove this one
        // holds no shared state.
        var optionsA = WorldGenerationOptions.Compact(1, 400);
        var a = new TerrainSampler(optionsA);
        var b = new TerrainSampler(WorldGenerationOptions.Compact(2, 400));
        var window = CoastalWindow(optionsA, 40);

        var expectedA = window.Select(a.TerrainAt).ToList();
        Assert.Contains(Terrain.Sea, expectedA);
        Assert.Contains(expectedA, t => t.IsLand());

        // A fresh sampler on the same options (cold shape cache) agrees with the warm one.
        var interleaved = new List<Terrain>();
        var cold = new TerrainSampler(optionsA);
        foreach (var coord in window)
        {
            b.TerrainAt(coord);
            interleaved.Add(cold.TerrainAt(coord));
            b.TerrainAt(coord);
        }

        Assert.Equal(expectedA, interleaved);
    }

    [Fact]
    public void Sampling_the_same_world_in_parallel_gives_the_same_map()
    {
        var options = WorldGenerationOptions.Compact(99, 400);
        var sampler = new TerrainSampler(options);
        var coords = CoastalWindow(options, 40);
        var sequential = coords.Select(new TerrainSampler(options).TerrainAt).ToList();

        var parallel = new Terrain[coords.Count];
        Parallel.For(0, coords.Count, i => parallel[i] = sampler.TerrainAt(coords[i]));

        Assert.Equal(sequential, parallel);
    }
}
