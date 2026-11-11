using Bjarnoy.Domain.Armies;
using Bjarnoy.Domain.Movement;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;
using Bjarnoy.Infrastructure.Entities;

namespace Bjarnoy.Infrastructure.Tests.Entities;

public class ArmyEntityTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public void A_stranded_army_survives_a_round_trip_through_the_entity_and_stays_stranded()
    {
        var army = new Army
        {
            Id = Guid.CreateVersion7(),
            SettlementId = Guid.CreateVersion7(),
            HomeSpot = new HexCoord(0, 0),
            Stacks = [new UnitStack(UnitType.Spearman, 10)],
            Location = new ArmyLocation.AtHome(),
            Provisions = 100,
        }.Strand(T0, new HexCoord(3, 1));
        var entity = new ArmyEntity { Id = army.Id };

        entity.ApplyDomain(army);
        var back = entity.ToDomain();

        Assert.True(entity.IsStranded);
        Assert.True(back.CannotGetHome);
        Assert.Equal(army.StarvesAt, back.StarvesAt);
        Assert.Equal(new HexCoord(3, 1), back.PositionAt(back.HomeSpot, T0));

        entity.ApplyDomain(back with { Location = new ArmyLocation.AtHome() });
        Assert.False(entity.IsStranded);
    }
}
