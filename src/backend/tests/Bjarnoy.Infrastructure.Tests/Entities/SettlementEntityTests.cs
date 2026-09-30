using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Settlers;
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

    [Fact]
    public void A_running_feast_and_pending_feast_renown_round_trip_through_the_entity()
    {
        var entity = Entity();
        var feast = new Feast(T0, T0.AddHours(12), 4025);
        var domain = entity.ToDomain() with { Feast = feast, PendingFeastRenown = 123.5 };

        entity.ApplyDomain(domain);
        var back = entity.ToDomain();

        Assert.Equal(feast, back.Feast);
        Assert.Equal(123.5, back.PendingFeastRenown);

        entity.ApplyDomain(back with { Feast = null, PendingFeastRenown = 0 });

        Assert.Null(entity.ToDomain().Feast);
        Assert.Null(entity.FeastEndsAt);
        Assert.Equal(0, entity.FeastRenownGain);
    }
}
