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
}
