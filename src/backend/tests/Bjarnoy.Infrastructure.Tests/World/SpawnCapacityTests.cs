using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Settlers;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;
using Bjarnoy.Infrastructure.Services;

namespace Bjarnoy.Infrastructure.Tests.World;

/// <summary>
/// <see cref="WorldService.CountFreeSpawns"/>: how many new players an island
/// still has room for. Start positions closer together than the founding
/// spacing (<see cref="SettlementService.MinimumSpacing"/>) cannot both be
/// taken, so free spawns are fewer than the unblocked start positions.
/// </summary>
public class SpawnCapacityTests
{
    private static readonly int Spacing = SettlementService.MinimumSpacing;

    private static Founding.NeighbourSnapshot Settlement(int q, int r) =>
        new(new HexCoord(q, r), [new PlacedBuilding(new HexCoord(q, r), BuildingType.Longhouse, 1)]);

    [Fact]
    public void Start_positions_too_close_to_each_other_count_as_one_spawn()
    {
        // Two positions closer than the spacing, a third far enough from both.
        HexPoint[] positions = [new(0, 0), new(1, 0), new(Spacing * 3, 0)];

        Assert.Equal(2, WorldService.CountFreeSpawns(positions, []));
    }

    [Fact]
    public void An_existing_settlement_takes_the_spawns_around_it()
    {
        HexPoint[] positions = [new(0, 0), new(1, 0), new(Spacing * 3, 0)];

        // Any settlement — a player's first or an expansion — blocks its neighbourhood.
        Assert.Equal(1, WorldService.CountFreeSpawns(positions, [Settlement(Spacing * 3, 0)]));
        Assert.Equal(0, WorldService.CountFreeSpawns(
            positions, [Settlement(0, 0), Settlement(Spacing * 3, 0)]));
    }

    [Fact]
    public void Counts_the_same_as_checking_every_pick_on_real_islands()
    {
        // The grid in CountFreeSpawns only skips settlements that cannot
        // reach a candidate; checked against the plain all-pairs version on
        // real islands, with existing settlements (towers included) on them.
        var world = new WorldGenerator(WorldGenerationOptions.ForSeed(7) with { Radius = 1000 })
            .Generate(TestContext.Current.CancellationToken);
        var checkedIslands = 0;
        foreach (var island in world.Islands.Where(i => i.StartPositions.Count > 20).Take(25))
        {
            var positions = island.StartPositions.Select(p => new HexPoint(p.Q, p.R)).ToList();
            var first = island.StartPositions[^1];
            var tower = new HexCoord(first.Q + 6, first.R);
            Founding.NeighbourSnapshot[] existing =
            [
                new(first, [
                    new PlacedBuilding(first, BuildingType.Longhouse, 5),
                    new PlacedBuilding(tower, BuildingType.Tower, 3),
                ]),
            ];

            Assert.Equal(CountNaively(positions, existing), WorldService.CountFreeSpawns(positions, existing));
            Assert.Equal(CountNaively(positions, []), WorldService.CountFreeSpawns(positions, []));
            checkedIslands++;
        }

        Assert.True(checkedIslands > 5, "the seed needs islands with start positions");
    }

    private static int CountNaively(IEnumerable<HexPoint> positions, IEnumerable<Founding.NeighbourSnapshot> existing)
    {
        var neighbours = existing.ToList();
        var free = 0;
        foreach (var position in positions)
        {
            var candidate = new HexCoord(position.Q, position.R);
            if (Founding.CheckSpacing(candidate, neighbours, Spacing, SettlementService.FoundingSafetyMargin)
                != Founding.SpacingVerdict.Ok)
            {
                continue;
            }

            neighbours.Add(Settlement(candidate.Q, candidate.R));
            free++;
        }

        return free;
    }
}
