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

    [Theory]
    [InlineData(BuildingType.Palisade)]
    [InlineData(BuildingType.PalisadeGate)]
    [InlineData(BuildingType.Bridge)]
    public void A_wall_hex_or_a_bridge_loses_one_level_per_won_siege_however_strong_the_siege(BuildingType type)
    {
        var wallHex = new HexCoord(3, 0);
        List<PlacedBuilding> buildings = [.. Buildings(), new(wallHex, type, 3)];
        // 400 siege power: 14 levels off any other building. Walls fall to rams only, a bridge to catapults only.
        var survivors = new[] { new UnitStack(type == BuildingType.Bridge ? UnitType.Catapult : UnitType.Ram, 10) };

        var outcome = SiegeResolver.Resolve(survivors, buildings, requestedTargetCoord: wallHex, seed: 1);

        Assert.True(outcome.Applied);
        Assert.Equal(3, outcome.LevelBefore);
        Assert.Equal(2, outcome.LevelAfter);
        Assert.Contains(outcome.UpdatedBuildings!, b => b.Coord == wallHex && b.Type == type && b.Level == 2);
    }

    [Fact]
    public void A_level_1_wall_hex_is_breached_by_one_won_siege()
    {
        var wallHex = new HexCoord(3, 0);
        List<PlacedBuilding> buildings = [.. Buildings(), new(wallHex, BuildingType.Palisade, 1)];

        var outcome = SiegeResolver.Resolve([new UnitStack(UnitType.Ram, 1)], buildings, requestedTargetCoord: wallHex, seed: 1);

        Assert.Equal(0, outcome.LevelAfter);
        Assert.DoesNotContain(outcome.UpdatedBuildings!, b => b.Coord == wallHex);
    }

    // --- Engine x target split (docs/design/economy.md section 5) ---

    private static readonly HexCoord WallHex = new(3, 0);
    private static readonly HexCoord BridgeHex = new(4, 0);

    private static List<PlacedBuilding> WithWallAndBridge() =>
    [
        .. Buildings(),
        new(WallHex, BuildingType.Palisade, 3),
        new(BridgeHex, BuildingType.Bridge, 4),
    ];

    private static UnitStack[] Rams(int n = 5) => [new UnitStack(UnitType.Ram, n)];

    private static UnitStack[] Catapults(int n = 5) => [new UnitStack(UnitType.Catapult, n)];

    [Theory]
    [InlineData(BuildingType.Palisade, SiegeTargets.Walls)]
    [InlineData(BuildingType.PalisadeGate, SiegeTargets.Walls)]
    [InlineData(BuildingType.Tower, SiegeTargets.Towers)]
    [InlineData(BuildingType.Bridge, SiegeTargets.Buildings)]
    [InlineData(BuildingType.Longhouse, SiegeTargets.Buildings)]
    [InlineData(BuildingType.Farm, SiegeTargets.Buildings)]
    [InlineData(BuildingType.SiegeWorkshop, SiegeTargets.Buildings)]
    public void KindOf_sorts_buildings_into_walls_towers_and_the_rest(BuildingType type, SiegeTargets expected)
    {
        Assert.Equal(expected, SiegeResolver.KindOf(type));
    }

    [Theory]
    [InlineData(UnitType.Ram, BuildingType.Palisade, true)]
    [InlineData(UnitType.Ram, BuildingType.PalisadeGate, true)]
    [InlineData(UnitType.Ram, BuildingType.Tower, true)]
    [InlineData(UnitType.Ram, BuildingType.Bridge, false)]
    [InlineData(UnitType.Ram, BuildingType.Longhouse, false)]
    [InlineData(UnitType.Catapult, BuildingType.Palisade, false)]
    [InlineData(UnitType.Catapult, BuildingType.PalisadeGate, false)]
    [InlineData(UnitType.Catapult, BuildingType.Tower, true)]
    [InlineData(UnitType.Catapult, BuildingType.Bridge, true)]
    [InlineData(UnitType.Catapult, BuildingType.Longhouse, true)]
    [InlineData(UnitType.Axeman, BuildingType.Longhouse, false)]
    [InlineData(UnitType.Axeman, BuildingType.Palisade, false)]
    public void CanDamage_follows_the_engines_siege_targets(UnitType engine, BuildingType target, bool expected)
    {
        Assert.Equal(expected, SiegeResolver.CanDamage(UnitCatalogue.Get(engine), target));
    }

    [Fact]
    public void Siege_power_against_a_type_counts_only_the_engines_that_can_damage_it()
    {
        IReadOnlyList<UnitStack> mixed = [new UnitStack(UnitType.Catapult, 2), new UnitStack(UnitType.Ram, 3), new UnitStack(UnitType.Axeman, 9)];

        Assert.Equal(120, SiegeResolver.SiegePowerAgainst(mixed, BuildingType.Palisade)); // rams only
        Assert.Equal(200, SiegeResolver.SiegePowerAgainst(mixed, BuildingType.Tower)); // both
        Assert.Equal(80, SiegeResolver.SiegePowerAgainst(mixed, BuildingType.Farm)); // catapults only
        Assert.Equal(80, SiegeResolver.SiegePowerAgainst(mixed, BuildingType.Bridge));
    }

    [Fact]
    public void Rams_take_exactly_one_level_off_a_named_wall()
    {
        var outcome = SiegeResolver.Resolve(Rams(50), WithWallAndBridge(), WallHex, seed: 1);

        Assert.True(outcome.Applied);
        Assert.Equal(BuildingType.Palisade, outcome.TargetType);
        Assert.Equal(3, outcome.LevelBefore);
        Assert.Equal(2, outcome.LevelAfter);
    }

    [Fact]
    public void Catapults_cannot_damage_a_named_wall()
    {
        var outcome = SiegeResolver.Resolve(Catapults(50), WithWallAndBridge(), WallHex, seed: 1);

        Assert.False(outcome.Applied);
        Assert.Null(outcome.UpdatedBuildings);
    }

    [Fact]
    public void Rams_hit_a_named_tower_with_the_full_levels_destroyed()
    {
        var outcome = SiegeResolver.Resolve(Rams(5), Buildings(towerLevel: 20), TowerHex, seed: 1);

        Assert.True(outcome.Applied);
        Assert.Equal(BuildingType.Tower, outcome.TargetType);
        Assert.Equal(20 - SiegeResolver.LevelsDestroyed(200), outcome.LevelAfter);
    }

    [Fact]
    public void Catapults_hit_a_named_tower()
    {
        var outcome = SiegeResolver.Resolve(Catapults(5), Buildings(towerLevel: 20), TowerHex, seed: 1);

        Assert.True(outcome.Applied);
        Assert.Equal(BuildingType.Tower, outcome.TargetType);
        Assert.Equal(20 - SiegeResolver.LevelsDestroyed(200), outcome.LevelAfter);
    }

    [Fact]
    public void Rams_cannot_damage_an_ordinary_building_or_a_bridge()
    {
        Assert.False(SiegeResolver.Resolve(Rams(50), WithWallAndBridge(), FarmHex, seed: 1).Applied);
        Assert.False(SiegeResolver.Resolve(Rams(50), WithWallAndBridge(), BridgeHex, seed: 1).Applied);
        Assert.False(SiegeResolver.Resolve(Rams(50), WithWallAndBridge(), Longhouse, seed: 1).Applied);
    }

    [Fact]
    public void Catapults_burn_one_level_of_a_named_bridge_and_the_full_damage_of_an_ordinary_building()
    {
        var bridge = SiegeResolver.Resolve(Catapults(50), WithWallAndBridge(), BridgeHex, seed: 1);
        Assert.True(bridge.Applied);
        Assert.Equal(3, bridge.LevelAfter);

        var farm = SiegeResolver.Resolve(Catapults(50), WithWallAndBridge(), FarmHex, seed: 1);
        Assert.True(farm.Applied);
        Assert.Equal(0, farm.LevelAfter);
    }

    [Fact]
    public void A_mixed_army_hits_a_wall_with_its_rams_alone()
    {
        // The catapults add nothing against a wall: the damage is still the single level a wall loses, and a ram-less army does none.
        IReadOnlyList<UnitStack> mixed = [new UnitStack(UnitType.Catapult, 20), new UnitStack(UnitType.Ram, 1)];

        var outcome = SiegeResolver.Resolve(mixed, WithWallAndBridge(), WallHex, seed: 1);

        Assert.True(outcome.Applied);
        Assert.Equal(2, outcome.LevelAfter);
    }

    [Fact]
    public void A_missing_named_target_falls_back_to_a_random_pick_among_what_rams_can_damage()
    {
        // Only the wall and the tower are ram targets; no seed ever picks the Longhouse, the farm or the bridge.
        for (var seed = 0; seed < 60; seed++)
        {
            var outcome = SiegeResolver.Resolve(Rams(1), WithWallAndBridge(), new HexCoord(99, 99), seed);

            Assert.True(outcome.Applied);
            Assert.Contains(outcome.TargetType, new BuildingType?[] { BuildingType.Palisade, BuildingType.Tower });
        }
    }

    [Fact]
    public void An_unnamed_catapult_siege_never_picks_a_wall()
    {
        for (var seed = 0; seed < 60; seed++)
        {
            var outcome = SiegeResolver.Resolve(Catapults(1), WithWallAndBridge(), requestedTargetCoord: null, seed);

            Assert.True(outcome.Applied);
            Assert.NotEqual(BuildingType.Palisade, outcome.TargetType);
        }
    }

    [Fact]
    public void The_random_pick_is_deterministic_for_a_seed()
    {
        var first = SiegeResolver.Resolve(Catapults(3), WithWallAndBridge(), requestedTargetCoord: null, seed: 7);
        var second = SiegeResolver.Resolve(Catapults(3), WithWallAndBridge(), requestedTargetCoord: null, seed: 7);

        Assert.Equal(first.TargetCoord, second.TargetCoord);
    }

    [Fact]
    public void No_siege_when_nothing_standing_can_be_damaged_by_the_surviving_engines()
    {
        // Rams against a settlement with neither walls nor towers.
        IReadOnlyList<PlacedBuilding> plain = [new(Longhouse, BuildingType.Longhouse, 5), new(FarmHex, BuildingType.Farm, 3)];

        var outcome = SiegeResolver.Resolve(Rams(10), plain, requestedTargetCoord: null, seed: 1);

        Assert.False(outcome.Applied);
        Assert.Null(outcome.UpdatedBuildings);
    }
}
