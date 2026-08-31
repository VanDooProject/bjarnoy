using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Combat;

/// <summary>Catapult building-destruction math (issue #40 phase 5).</summary>
public class SiegeResolverTests
{
    private static readonly HexCoord Longhouse = new(0, 0);
    private static readonly HexCoord FarmHex = new(1, 0);
    private static readonly HexCoord TowerHex = new(2, 0);

    private static List<PlacedBuilding> Buildings(int longhouseLevel = 5, int farmLevel = 3, int towerLevel = 2) =>
    [
        new(Longhouse, BuildingType.Longhouse, longhouseLevel),
        new(FarmHex, BuildingType.Farm, farmLevel),
        new(TowerHex, BuildingType.Tower, towerLevel),
    ];

    [Theory]
    [InlineData(0, 0)]
    [InlineData(40, 4)] // sqrt(20) = 4.47 -> floor 4
    [InlineData(200, 10)] // sqrt(100) = 10
    [InlineData(800, 20)] // sqrt(400) = 20
    public void LevelsDestroyed_matches_the_documented_formula(long survivingSiegePower, int expected)
    {
        Assert.Equal(expected, SiegeResolver.LevelsDestroyed(survivingSiegePower));
    }

    [Fact]
    public void Any_positive_siege_power_destroys_at_least_one_level()
    {
        // sqrt(0.5) floors to 0, but the formula's max(1, ...) guarantees a
        // single surviving catapult still does something.
        Assert.Equal(1, SiegeResolver.LevelsDestroyed(1));
    }

    [Fact]
    public void Zero_surviving_catapults_does_zero_damage()
    {
        var survivors = new[] { new UnitStack(UnitType.Axeman, 50) }; // no catapults at all

        var outcome = SiegeResolver.Resolve(survivors, Buildings(), requestedTargetCoord: null, seed: 1);

        Assert.False(outcome.Applied);
        Assert.Null(outcome.UpdatedBuildings);
    }

    [Fact]
    public void Catapults_wiped_out_despite_the_attacker_winning_does_zero_damage()
    {
        // The design doc's edge case: a 100%-catapult army that won by a hair
        // could still lose every catapult it brought.
        IReadOnlyList<UnitStack> survivors = [];

        var outcome = SiegeResolver.Resolve(survivors, Buildings(), requestedTargetCoord: null, seed: 1);

        Assert.False(outcome.Applied);
    }

    [Fact]
    public void No_buildings_at_all_is_handled_defensively()
    {
        var survivors = new[] { new UnitStack(UnitType.Catapult, 10) };

        var outcome = SiegeResolver.Resolve(survivors, [], requestedTargetCoord: null, seed: 1);

        Assert.False(outcome.Applied);
    }

    [Fact]
    public void An_explicit_target_that_still_exists_is_used()
    {
        var survivors = new[] { new UnitStack(UnitType.Catapult, 10) }; // 400 siege power -> 14 levels

        var outcome = SiegeResolver.Resolve(survivors, Buildings(), requestedTargetCoord: FarmHex, seed: 1);

        Assert.True(outcome.Applied);
        Assert.Equal(FarmHex, outcome.TargetCoord);
        Assert.Equal(BuildingType.Farm, outcome.TargetType);
    }

    [Fact]
    public void An_explicit_target_that_no_longer_exists_falls_back_to_a_random_pick_deterministically()
    {
        var survivors = new[] { new UnitStack(UnitType.Catapult, 10) };
        var missingCoord = new HexCoord(99, 99); // not one of Buildings()'s coords

        var first = SiegeResolver.Resolve(survivors, Buildings(), requestedTargetCoord: missingCoord, seed: 7);
        var second = SiegeResolver.Resolve(survivors, Buildings(), requestedTargetCoord: missingCoord, seed: 7);

        Assert.True(first.Applied);
        Assert.Equal(first.TargetCoord, second.TargetCoord);

        // Same seed with no target requested at all picks exactly the same
        // building the missing-target fallback did — both go through the
        // identical random-pick path.
        var noTarget = SiegeResolver.Resolve(survivors, Buildings(), requestedTargetCoord: null, seed: 7);
        Assert.Equal(noTarget.TargetCoord, first.TargetCoord);
    }

    [Fact]
    public void No_target_specified_picks_randomly_but_deterministically_for_a_given_seed()
    {
        var survivors = new[] { new UnitStack(UnitType.Catapult, 10) };

        var first = SiegeResolver.Resolve(survivors, Buildings(), requestedTargetCoord: null, seed: 42);
        var second = SiegeResolver.Resolve(survivors, Buildings(), requestedTargetCoord: null, seed: 42);

        Assert.Equal(first.TargetCoord, second.TargetCoord);
        Assert.Equal(first.TargetType, second.TargetType);
    }

    [Fact]
    public void The_longhouse_is_a_valid_random_pick_and_reducing_it_to_zero_razes_the_settlement()
    {
        // A single Longhouse-only building list forces the random pick to
        // land on it regardless of seed.
        var buildings = new List<PlacedBuilding> { new(Longhouse, BuildingType.Longhouse, 3) };
        var survivors = new[] { new UnitStack(UnitType.Catapult, 20) }; // 800 siege power -> 20 levels, well past 3

        var outcome = SiegeResolver.Resolve(survivors, buildings, requestedTargetCoord: null, seed: 1);

        Assert.True(outcome.Applied);
        Assert.Equal(BuildingType.Longhouse, outcome.TargetType);
        Assert.Equal(0, outcome.LevelAfter);
        Assert.True(outcome.SettlementRazed);
        Assert.Empty(outcome.UpdatedBuildings!);
    }

    [Fact]
    public void A_non_longhouse_building_reduced_to_zero_is_removed_and_its_hex_freed()
    {
        var survivors = new[] { new UnitStack(UnitType.Catapult, 20) }; // 800 siege power -> way past the Farm's level

        var outcome = SiegeResolver.Resolve(survivors, Buildings(farmLevel: 2), requestedTargetCoord: FarmHex, seed: 1);

        Assert.True(outcome.Applied);
        Assert.Equal(0, outcome.LevelAfter);
        Assert.False(outcome.SettlementRazed); // not the Longhouse
        Assert.DoesNotContain(outcome.UpdatedBuildings!, b => b.Coord == FarmHex);
        Assert.Contains(outcome.UpdatedBuildings!, b => b.Type == BuildingType.Longhouse); // everything else untouched
    }

    [Fact]
    public void A_building_that_survives_partial_damage_keeps_its_reduced_level_and_its_hex()
    {
        var survivors = new[] { new UnitStack(UnitType.Catapult, 3) }; // 120 siege power -> sqrt(60)=7 floor -> 7 levels

        var outcome = SiegeResolver.Resolve(survivors, Buildings(towerLevel: 9), requestedTargetCoord: TowerHex, seed: 1);

        Assert.True(outcome.Applied);
        Assert.Equal(9, outcome.LevelBefore);
        Assert.Equal(2, outcome.LevelAfter);
        Assert.Contains(outcome.UpdatedBuildings!, b => b.Coord == TowerHex && b.Level == 2);
    }
}
