using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class FogVisionRadiiTests
{
    // Golden values against the frontend formulas this ports
    // (WorldModel.ts:80,87,361-380): borderRadius = 2 + floor(level/2),
    // visibleRadius = borderRadius + 1, exploredRadius = borderRadius + 3.
    [Theory]
    [InlineData(0, 2, 3, 5)]
    [InlineData(1, 2, 3, 5)]
    [InlineData(2, 3, 4, 6)]
    [InlineData(3, 3, 4, 6)]
    [InlineData(10, 7, 8, 10)]
    public void Radii_match_the_frontends_formulas(
        int longhouseLevel, int expectedBorder, int expectedVisible, int expectedExplored)
    {
        Assert.Equal(expectedBorder, FogVisionRadii.BorderRadius(longhouseLevel));
        Assert.Equal(expectedVisible, FogVisionRadii.VisibleRadius(longhouseLevel));
        Assert.Equal(expectedExplored, FogVisionRadii.ExploredRadius(longhouseLevel));
    }

    [Fact]
    public void Explored_radius_is_always_wider_than_visible_radius()
    {
        for (var level = 0; level <= 30; level++)
        {
            Assert.True(FogVisionRadii.ExploredRadius(level) > FogVisionRadii.VisibleRadius(level));
        }
    }

    [Fact]
    public void Radii_never_shrink_as_level_increases()
    {
        var previousBorder = FogVisionRadii.BorderRadius(0);
        for (var level = 1; level <= 30; level++)
        {
            var border = FogVisionRadii.BorderRadius(level);
            Assert.True(border >= previousBorder);
            previousBorder = border;
        }
    }

    [Fact]
    public void Rejects_a_negative_level()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => FogVisionRadii.BorderRadius(-1));
    }

    [Fact]
    public void ToVisionSource_carries_the_coord_and_computed_radii()
    {
        var coord = new HexCoord(4, -1);

        var source = FogVisionRadii.ToVisionSource(coord, longhouseLevel: 3)!.Value;

        Assert.Equal(coord, source.Coord);
        Assert.Equal(FogVisionRadii.ExploredRadius(3), source.ExploredRadius);
        Assert.Equal(FogVisionRadii.VisibleRadius(3), source.VisibleRadius);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(5)]
    public void A_beach_camp_sees_like_a_level_1_longhouse_whatever_its_own_level(int longhouseLevel)
    {
        var camp = FogVisionRadii.ToVisionSource(HexCoord.Origin, longhouseLevel, isBeachCamp: true)!.Value;
        var ravens = FogVisionRadii.ToVisionSource(HexCoord.Origin, longhouseLevel, bonusRings: 4, isBeachCamp: true)!.Value;

        Assert.Equal(FogVisionRadii.ExploredRadius(1), camp.ExploredRadius);
        Assert.Equal(FogVisionRadii.VisibleRadius(1), camp.VisibleRadius);
        Assert.Equal(camp.ExploredRadius + 4, ravens.ExploredRadius);
        Assert.Equal(camp.VisibleRadius + 4, ravens.VisibleRadius);
    }

    [Fact]
    public void Odins_ravens_add_rings_to_the_settlements_and_a_towers_explored_and_visible_radii()
    {
        var plain = FogVisionRadii.ToVisionSource(HexCoord.Origin, longhouseLevel: 3)!.Value;
        var ravens = FogVisionRadii.ToVisionSource(HexCoord.Origin, longhouseLevel: 3, bonusRings: 10)!.Value;
        var plainTower = FogVisionRadii.ToTowerVisionSource(new HexCoord(2, 0), towerLevel: 2);
        var ravensTower = FogVisionRadii.ToTowerVisionSource(new HexCoord(2, 0), towerLevel: 2, bonusRings: 10);

        Assert.Equal(plain.ExploredRadius + 10, ravens.ExploredRadius);
        Assert.Equal(plain.VisibleRadius + 10, ravens.VisibleRadius);
        Assert.Equal(plainTower.ExploredRadius + 10, ravensTower.ExploredRadius);
        Assert.Equal(plainTower.VisibleRadius + 10, ravensTower.VisibleRadius);
    }

    [Theory]
    [InlineData(UnitType.Thrall, 3)]
    [InlineData(UnitType.Spearman, 2)]
    [InlineData(UnitType.Axeman, 2)]
    [InlineData(UnitType.Bowman, 2)]
    [InlineData(UnitType.Berserker, 2)]
    [InlineData(UnitType.Provisioner, 2)]
    [InlineData(UnitType.Settler, 2)]
    [InlineData(UnitType.Catapult, 1)]
    [InlineData(UnitType.Ram, 1)]
    [InlineData(UnitType.Karve, 6)]
    [InlineData(UnitType.Snekkja, 4)]
    public void Every_unit_type_has_its_decided_vision_radius(UnitType type, int expected)
    {
        Assert.Equal(expected, UnitCatalogue.Get(type).VisionRadius);
        Assert.Equal(expected, FogVisionRadii.ArmyVisionRadius([new UnitStack(type, 1)]));
    }

    [Fact]
    public void An_armys_vision_radius_is_the_highest_among_the_unit_types_in_it()
    {
        var mixed = new[] { new UnitStack(UnitType.Catapult, 4), new UnitStack(UnitType.Thrall, 1), new UnitStack(UnitType.Spearman, 9) };
        var fleet = new[] { new UnitStack(UnitType.Snekkja, 2), new UnitStack(UnitType.Karve, 1), new UnitStack(UnitType.Axeman, 5) };

        Assert.Equal(3, FogVisionRadii.ArmyVisionRadius(mixed));
        Assert.Equal(6, FogVisionRadii.ArmyVisionRadius(fleet));
    }

    [Fact]
    public void An_emptied_stack_does_not_count_towards_the_armys_vision_radius()
    {
        var stacks = new[] { new UnitStack(UnitType.Thrall, 0), new UnitStack(UnitType.Ram, 2) };

        Assert.Equal(1, FogVisionRadii.ArmyVisionRadius(stacks));
    }

    [Fact]
    public void Odins_ravens_add_their_rings_on_top_of_the_highest_unit_vision()
    {
        var catapults = new[] { new UnitStack(UnitType.Catapult, 3) };

        Assert.Equal(1 + 10, FogVisionRadii.ArmyVisionRadius(catapults, bonusRings: 10));
        Assert.Equal(1, FogVisionRadii.ArmyVisionRadius(catapults, bonusRings: -4));
    }

    [Fact]
    public void An_army_without_units_sees_only_the_ravens_rings()
    {
        Assert.Equal(0, FogVisionRadii.ArmyVisionRadius([]));
        Assert.Equal(4, FogVisionRadii.ArmyVisionRadius([], bonusRings: 4));
    }

    [Fact]
    public void A_settlement_whose_longhouse_is_destroyed_has_no_centre_vision_source()
    {
        Assert.Null(FogVisionRadii.ToVisionSource(new HexCoord(4, -1), longhouseLevel: 0));
        Assert.Null(FogVisionRadii.ToVisionSource(new HexCoord(4, -1), longhouseLevel: 0, bonusRings: 10));
    }

    [Fact]
    public void A_standing_longhouse_has_a_centre_vision_source_exactly_when_it_has_a_claim_disc()
    {
        for (var level = 0; level <= 10; level++)
        {
            Assert.Equal(
                Settlement.LonghouseDisc(HexCoord.Origin, level) is not null,
                FogVisionRadii.ToVisionSource(HexCoord.Origin, level) is not null);
        }
    }

    // The rival-data gate (docs/design/map-fog-v2.md section 1h) reads these; the frontend files below must equal them:
    //   fogRamp.ts FOG_MIST_OPAQUE_AT_RAMP = 0.8; FogMaskLayer.ts ARMY_FOG_WHITE_OFFSET = 0.75 and ARMY_FOG_WHITE_MARGIN = 6;
    //   the unknown ramp's width (FogMaskOptions.UnknownMarginHexes, FOG_RAMP_MARGIN_HEXES) = 14.
    [Fact]
    public void The_fog_opacity_constants_the_rival_gate_reads_are_pinned()
    {
        Assert.Equal(0.8, FogVisionRadii.MistOpaqueAtRamp);
        Assert.Equal(14, FogMaskOptions.DefaultUnknownMarginHexes);
        Assert.Equal(14, new FogMaskOptions().UnknownMarginHexes);
        Assert.Equal(0.75, FogVisionRadii.ArmyFogWhiteOffsetHexes);
        Assert.Equal(6, FogVisionRadii.ArmyFogWhiteMarginHexes);
        Assert.Equal(11.2, FogVisionRadii.SourceMistOpaqueMargin, 9);
        Assert.Equal(5.55, FogVisionRadii.ArmyMistOpaqueMargin, 9);
    }
}
