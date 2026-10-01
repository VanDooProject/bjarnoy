using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Camps;

/// <summary>
/// The build rule against camp state: only a camp that still has beasts (and Fenrir's brood) blocks building;
/// <see cref="CampIndex.Blocking"/> decides, <see cref="Settlement.PlanBuild"/> refuses what is in the index.
/// </summary>
public class CampBuildRuleTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord CampHex = new(1, 0);

    private static Camp CampOf(string family) => new(CampHex, family, 2, TileOrientation.E);

    private static CampState Cleared(Camp camp, DateTimeOffset at) =>
        CampState.Pristine(camp, at).AfterFight(camp, at, CampGarrison.Empty);

    private static Settlement Found()
    {
        var (production, capacity) = BuildingCatalogue.Totals([(BuildingType.Longhouse, 1)]);
        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings = [new PlacedBuilding(Centre, BuildingType.Longhouse, 1)],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(400), production, capacity, T0),
        };
    }

    private static BuildRejection HerderOnCampHex(ICampIndex camps) =>
        Found().PlanBuild(BuildingType.ReindeerHerder, CampHex, Terrain.Grass, T0, Guid.CreateVersion7(), camps: camps).Rejection;

    [Fact]
    public void A_pristine_camp_blocks_building_on_its_hex()
    {
        var camp = CampOf(CampFamilies.Wolfden);
        var blocking = CampIndex.Blocking([(camp, CampState.Pristine(camp, T0))], T0, _ => true);

        Assert.Equal(BuildRejection.HexOccupiedByCamp, HerderOnCampHex(blocking));
    }

    [Fact]
    public void A_cleared_camp_inside_a_realm_does_not_block_so_its_hex_can_be_built_on()
    {
        var camp = CampOf(CampFamilies.Wolfden);
        var blocking = CampIndex.Blocking([(camp, Cleared(camp, T0))], T0.AddDays(30), _ => true);

        Assert.False(blocking.TryGetCamp(CampHex, out _));
        Assert.Equal(BuildRejection.None, HerderOnCampHex(blocking));
    }

    [Fact]
    public void A_cleared_camp_outside_every_realm_blocks_again_once_it_has_regrown()
    {
        var camp = CampOf(CampFamilies.Wolfden);
        var state = Cleared(camp, T0);

        var justCleared = CampIndex.Blocking([(camp, state)], T0, _ => false);
        var regrown = CampIndex.Blocking([(camp, state)], T0.AddHours(9), _ => false);

        Assert.False(justCleared.TryGetCamp(CampHex, out _));
        Assert.True(regrown.TryGetCamp(CampHex, out _));
    }

    [Fact]
    public void Fenrirs_brood_blocks_even_while_cleared()
    {
        var camp = CampOf(CampFamilies.Fenrirbrood);
        var blocking = CampIndex.Blocking([(camp, Cleared(camp, T0))], T0, _ => true);

        Assert.Equal(BuildRejection.HexOccupiedByCamp, HerderOnCampHex(blocking));
    }

    [Fact]
    public void Only_the_blocking_camps_land_in_the_index()
    {
        var guarded = new Camp(new HexCoord(5, 5), CampFamilies.Harewarren, 1, TileOrientation.E);
        var cleared = CampOf(CampFamilies.Harewarren);
        var blocking = CampIndex.Blocking(
            [(guarded, CampState.Pristine(guarded, T0)), (cleared, Cleared(cleared, T0))], T0, _ => true);

        Assert.True(blocking.TryGetCamp(guarded.Coord, out _));
        Assert.False(blocking.TryGetCamp(cleared.Coord, out _));
    }
}
