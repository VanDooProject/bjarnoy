using Bjarnoy.Domain.Ai;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Trade;

namespace Bjarnoy.Domain.Tests;

/// <summary>
/// Coverage for <see cref="AiBuildingRoles"/> — see
/// <c>docs/design/ai-players.md</c>'s "Building roles" section. The guard
/// test (<see cref="Every_building_type_has_at_least_one_role"/>) is the
/// point of this class: it fails the moment someone adds a
/// <see cref="BuildingType"/> the AI cannot classify, which is exactly the
/// silent-zero-score bug this whole feature replaces.
/// </summary>
public sealed class AiBuildingRolesTests
{
    [Fact]
    public void Every_building_type_has_at_least_one_role()
    {
        foreach (var type in BuildingCatalogue.AllTypes)
        {
            Assert.True(
                AiBuildingRoles.RolesOf(type) != AiBuildingRole.None,
                $"{type} has no derived AiBuildingRole — a building added to the tech tree with no data AiBuildingRoles can read (no production, no storage, no claim radius, no trainer, no god) needs at least one of those, or a new role.");
        }
    }

    [Theory]
    [InlineData(BuildingType.Lumberjack, TradeResource.Wood)]
    [InlineData(BuildingType.Sawmill, TradeResource.Wood)]
    [InlineData(BuildingType.Quarry, TradeResource.Stone)]
    [InlineData(BuildingType.Farm, TradeResource.Food)]
    [InlineData(BuildingType.PumpkinFarm, TradeResource.Food)]
    [InlineData(BuildingType.FishingHut, TradeResource.Food)]
    [InlineData(BuildingType.FisherHut, TradeResource.Food)]
    [InlineData(BuildingType.MagicTower, TradeResource.Iron)]
    public void Producers_are_classified_as_Producer_of_the_right_resource(BuildingType type, TradeResource resource)
    {
        Assert.True(AiBuildingRoles.RolesOf(type).HasFlag(AiBuildingRole.Producer));
        Assert.Contains(resource, AiBuildingRoles.ProducedResources(type));
    }

    [Theory]
    [InlineData(BuildingType.StorageHouse)]
    [InlineData(BuildingType.GreatStorehouse)]
    public void Storage_buildings_are_classified_as_Storage(BuildingType type)
    {
        Assert.True(AiBuildingRoles.RolesOf(type).HasFlag(AiBuildingRole.Storage));
    }

    [Fact]
    public void Tower_is_Territory_and_Defense()
    {
        var roles = AiBuildingRoles.RolesOf(BuildingType.Tower);

        Assert.True(roles.HasFlag(AiBuildingRole.Territory));
        Assert.True(roles.HasFlag(AiBuildingRole.Defense));
    }

    [Theory]
    [InlineData(BuildingType.Barracks)]
    [InlineData(BuildingType.ArcheryRange)]
    [InlineData(BuildingType.Dockyard)]
    public void Training_buildings_are_classified_as_Military(BuildingType type)
    {
        Assert.True(AiBuildingRoles.RolesOf(type).HasFlag(AiBuildingRole.Military));
    }

    [Theory]
    [InlineData(BuildingType.ShrineOfThor)]
    [InlineData(BuildingType.ShrineOfFreyja)]
    [InlineData(BuildingType.ShrineOfUllr)]
    [InlineData(BuildingType.ShrineOfNjord)]
    public void Shrines_are_classified_as_Faith(BuildingType type)
    {
        Assert.True(AiBuildingRoles.RolesOf(type).HasFlag(AiBuildingRole.Faith));
    }

    [Fact]
    public void Longhouse_is_only_Anchor()
    {
        Assert.Equal(AiBuildingRole.Anchor, AiBuildingRoles.RolesOf(BuildingType.Longhouse));
    }

    [Fact]
    public void Iron_is_the_only_military_feeding_resource_in_the_current_catalogue()
    {
        // Iron is spent only by Tower/Barracks/ArcheryRange/Dockyard (all
        // Military or Defense role) and needed by several units' training
        // cost; Wood/Stone are spent broadly across ordinary economy
        // buildings, and Food is spent by the Longhouse/shrines — so neither
        // qualifies. See AiBuildingRoles.MilitaryFeedingResources' remarks.
        Assert.Single(AiBuildingRoles.MilitaryFeedingResources);
        Assert.Contains(TradeResource.Iron, AiBuildingRoles.MilitaryFeedingResources);
    }
}
