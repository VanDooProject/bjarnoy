using Bjarnoy.Domain.Buildings;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Infrastructure.Tests.Entities;

/// <summary>
/// <see cref="SettlementEntity.ToDomain"/>'s defensive reads of stored rows.
/// </summary>
public class SettlementEntityTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    private static SettlementEntity Entity() => new()
    {
        Name = "Bjornstad",
        OwnerName = "Tester",
        OwnerId = "p1",
        CentreQ = 0,
        CentreR = 0,
        SettledAt = T0,
        FoundedAt = T0,
    };

    [Fact]
    public void A_stored_magic_tower_is_dropped_when_the_settlement_is_loaded()
    {
        var entity = Entity();
        entity.Buildings =
        [
            new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 2 },
            new PlacedBuildingEntity { Q = 1, R = 0, Type = BuildingType.MagicTower, Level = 3 },
            new PlacedBuildingEntity { Q = 2, R = 0, Type = BuildingType.Lumberjack, Level = 1 },
        ];

        var domain = entity.ToDomain();

        Assert.DoesNotContain(domain.Buildings, b => b.Type == BuildingType.MagicTower);
        Assert.Equal(2, domain.Buildings.Count);
    }

    [Fact]
    public void A_queued_magic_tower_order_is_dropped_with_it_and_the_settlement_still_settles()
    {
        var entity = Entity();
        entity.Buildings =
        [
            new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 1 },
            new PlacedBuildingEntity { Q = 1, R = 0, Type = BuildingType.MagicTower, Level = 0 },
        ];
        entity.Queue =
        [
            new BuildOrderEntity
            {
                Q = 1, R = 0, Type = BuildingType.MagicTower, TargetLevel = 1,
                QueuedAt = T0, BaseDuration = TimeSpan.FromMinutes(4),
                StartedAt = T0, CompletesAt = T0.AddMinutes(4),
            },
        ];

        var domain = entity.ToDomain();

        Assert.Empty(domain.Queue);
        // Nothing may throw on the missing definition when the aggregate settles.
        var settled = domain.SettleTo(T0.AddHours(1)).Settlement;
        Assert.DoesNotContain(settled.Buildings, b => b.Type == BuildingType.MagicTower);
    }

    [Fact]
    public void A_stored_fisher_hut_becomes_a_fishing_hut_at_the_same_hex_and_level()
    {
        var entity = Entity();
        entity.Buildings =
        [
            new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 2 },
            new PlacedBuildingEntity { Q = 1, R = 0, Type = BuildingType.FisherHut, Level = 7 },
        ];

        var domain = entity.ToDomain();

        Assert.DoesNotContain(domain.Buildings, b => b.Type == BuildingType.FisherHut);
        var hut = Assert.Single(domain.Buildings, b => b.Type == BuildingType.FishingHut);
        Assert.Equal(new Bjarnoy.Domain.World.HexCoord(1, 0), hut.Coord);
        Assert.Equal(7, hut.Level);
    }

    [Fact]
    public void A_queued_fisher_hut_order_becomes_a_fishing_hut_order_with_the_same_target_level()
    {
        var entity = Entity();
        entity.Buildings =
        [
            new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 1 },
            new PlacedBuildingEntity { Q = 1, R = 0, Type = BuildingType.FisherHut, Level = 3 },
        ];
        entity.Queue =
        [
            new BuildOrderEntity
            {
                Q = 1, R = 0, Type = BuildingType.FisherHut, TargetLevel = 4,
                QueuedAt = T0, BaseDuration = TimeSpan.FromMinutes(4),
                StartedAt = T0, CompletesAt = T0.AddMinutes(4),
            },
        ];

        var domain = entity.ToDomain();

        var order = Assert.Single(domain.Queue);
        Assert.Equal(BuildingType.FishingHut, order.Type);
        Assert.Equal(4, order.TargetLevel);
        var settled = domain.SettleTo(T0.AddHours(1)).Settlement;
        Assert.Contains(settled.Buildings, b => b.Type == BuildingType.FishingHut && b.Level == 4);
    }

    [Fact]
    public void A_stored_level_above_the_types_own_maximum_is_clamped()
    {
        var entity = Entity();
        entity.Buildings =
        [
            new PlacedBuildingEntity { Q = 0, R = 0, Type = BuildingType.Longhouse, Level = 99 },
            new PlacedBuildingEntity { Q = 1, R = 0, Type = BuildingType.ShrineOfThor, Level = 9 },
        ];

        var domain = entity.ToDomain();

        Assert.Equal(30, domain.Buildings.Single(b => b.Type == BuildingType.Longhouse).Level);
        Assert.Equal(5, domain.Buildings.Single(b => b.Type == BuildingType.ShrineOfThor).Level);
    }
}
