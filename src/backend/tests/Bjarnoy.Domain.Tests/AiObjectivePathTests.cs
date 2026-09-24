using Bjarnoy.Domain.Ai;
using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

/// <summary>Coverage for <see cref="AiObjectivePath"/> — see <c>docs/design/ai-players.md</c>'s "Building roles" section.</summary>
public sealed class AiObjectivePathTests
{
    private static readonly HexCoord Centre = new(0, 0);

    private static Settlement Found(int longhouseLevel, params PlacedBuilding[] extraBuildings)
    {
        var buildings = new List<PlacedBuilding> { new(Centre, BuildingType.Longhouse, longhouseLevel) };
        buildings.AddRange(extraBuildings);
        var (production, capacity) = BuildingCatalogue.Totals(buildings.Select(b => (b.Type, b.Level)));

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = buildings,
            Resources = ResourcePool.Create(ResourceAmounts.Zero, production, capacity, DateTimeOffset.UtcNow),
        };
    }

    [Fact]
    public void A_directly_buildable_target_boosts_only_itself()
    {
        var settlement = Found(1);

        var boosted = AiObjectivePath.BoostedTypes(settlement, BuildingType.StorageHouse);

        Assert.Equal(new HashSet<BuildingType> { BuildingType.StorageHouse }, boosted);
    }

    [Fact]
    public void A_longhouse_gated_target_boosts_the_longhouse_instead()
    {
        // Tower's first level needs RequiredLonghouseLevel 3 (see
        // BuildingCatalogue.Tower); at longhouse 1, Tower's own next level is
        // blocked purely on the longhouse.
        var settlement = Found(1);

        var boosted = AiObjectivePath.BoostedTypes(settlement, BuildingType.Tower);

        Assert.Equal(new HashSet<BuildingType> { BuildingType.Longhouse }, boosted);
    }

    [Fact]
    public void GreatStorehouse_chains_through_StorageHouse_when_only_the_longhouse_is_high_enough()
    {
        // Longhouse 10 (GreatStorehouse's own RequiredLonghouseLevel is met),
        // but no StorageHouse standing at all — GreatStorehouse also needs
        // StorageHouse 10 (BuildingCatalogue.PrerequisiteTable).
        var settlement = Found(10);

        var boosted = AiObjectivePath.BoostedTypes(settlement, BuildingType.GreatStorehouse);

        Assert.Equal(new HashSet<BuildingType> { BuildingType.StorageHouse }, boosted);
        Assert.DoesNotContain(BuildingType.GreatStorehouse, boosted);
    }

    [Fact]
    public void GreatStorehouse_chains_through_both_Longhouse_and_StorageHouse_when_neither_is_ready()
    {
        var settlement = Found(1);

        var boosted = AiObjectivePath.BoostedTypes(settlement, BuildingType.GreatStorehouse);

        Assert.Equal(new HashSet<BuildingType> { BuildingType.Longhouse, BuildingType.StorageHouse }, boosted);
    }

    [Fact]
    public void GreatStorehouse_boosts_only_itself_once_every_prerequisite_is_met()
    {
        var settlement = Found(10, new PlacedBuilding(new HexCoord(1, 0), BuildingType.StorageHouse, 10));

        var boosted = AiObjectivePath.BoostedTypes(settlement, BuildingType.GreatStorehouse);

        Assert.Equal(new HashSet<BuildingType> { BuildingType.GreatStorehouse }, boosted);
    }

    [Fact]
    public void A_maxed_out_target_boosts_nothing()
    {
        var settlement = Found(10, new PlacedBuilding(new HexCoord(1, 0), BuildingType.StorageHouse, 10));

        var boosted = AiObjectivePath.BoostedTypes(settlement, BuildingType.StorageHouse);

        Assert.Empty(boosted);
    }

    [Fact]
    public void ArcheryRange_chains_two_levels_deep_through_Barracks_and_Tower()
    {
        // ArcheryRange needs Barracks 3, which itself needs Tower 5 — at
        // longhouse 1 with nothing standing, the only immediately-buildable
        // rung is Tower (RequiredLonghouseLevel 3 blocks it too, so the
        // actual first boosted type is the Longhouse).
        var settlement = Found(1);

        var boosted = AiObjectivePath.BoostedTypes(settlement, BuildingType.ArcheryRange);

        Assert.Contains(BuildingType.Longhouse, boosted);
        Assert.DoesNotContain(BuildingType.ArcheryRange, boosted);
        Assert.DoesNotContain(BuildingType.Barracks, boosted);
    }

    [Fact]
    public void ArcheryRange_boosts_Barracks_once_Tower_and_longhouse_are_ready()
    {
        var settlement = Found(5, new PlacedBuilding(new HexCoord(1, 0), BuildingType.Tower, 5));

        var boosted = AiObjectivePath.BoostedTypes(settlement, BuildingType.ArcheryRange);

        Assert.Equal(new HashSet<BuildingType> { BuildingType.Barracks }, boosted);
    }
}
