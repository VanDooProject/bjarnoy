using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Shrines;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests;

public class ShrineCatalogueTests
{
    [Theory]
    [InlineData(1, 0.10)]
    [InlineData(2, 0.13)]
    [InlineData(5, 0.22)]
    [InlineData(10, 0.22)] // Levels past MaxEffectLevel keep the level-5 favour.
    public void Favour_scales_with_level_and_caps_at_MaxEffectLevel(int level, double expectedBonus)
    {
        var favour = ShrineCatalogue.Favour(GodType.Thor, level);

        Assert.Equal(expectedBonus, favour.ProductionBonus.Wood, 6);
        Assert.Equal(expectedBonus, favour.ProductionBonus.Stone, 6);
        Assert.Equal(0, favour.ProductionBonus.Food, 6);
        Assert.Equal(0, favour.StorageBonus, 6);
    }

    [Fact]
    public void Freyja_boosts_food_only()
    {
        var favour = ShrineCatalogue.Favour(GodType.Freyja, 1);

        Assert.Equal(0.10, favour.ProductionBonus.Food, 6);
        Assert.Equal(0, favour.ProductionBonus.Wood, 6);
        Assert.Equal(0, favour.ProductionBonus.Stone, 6);
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(2, 1)]
    [InlineData(3, 2)]
    [InlineData(4, 2)]
    [InlineData(5, 3)]
    [InlineData(10, 3)]
    public void Slots_open_at_levels_1_3_and_5(int level, int expectedSlots)
    {
        Assert.Equal(expectedSlots, ShrineCatalogue.Slots(level));
    }
}

public class RuneCatalogueTests
{
    [Theory]
    [InlineData(RuneRarity.Carved, 0.05)]
    [InlineData(RuneRarity.Bound, 0.08)]
    [InlineData(RuneRarity.Blooded, 0.12)]
    public void Fehu_boosts_every_resource(RuneRarity rarity, double expectedBonus)
    {
        var effect = RuneCatalogue.Effect(RuneType.Fehu, rarity);

        Assert.Equal(expectedBonus, effect.ProductionBonus.Wood, 6);
        Assert.Equal(expectedBonus, effect.ProductionBonus.Stone, 6);
        Assert.Equal(expectedBonus, effect.ProductionBonus.Food, 6);
        Assert.Equal(expectedBonus, effect.ProductionBonus.Iron, 6);
        Assert.Equal(0, effect.StorageBonus, 6);
    }

    [Fact]
    public void Othala_boosts_storage_only()
    {
        var effect = RuneCatalogue.Effect(RuneType.Othala, RuneRarity.Bound);

        Assert.Equal(0.15, effect.StorageBonus, 6);
        Assert.True(effect.ProductionBonus == ResourceAmounts.Zero);
    }
}

public class SettlementShrineTests
{
    private static readonly DateTimeOffset T0 = new(2026, 1, 1, 12, 0, 0, TimeSpan.Zero);
    private static readonly HexCoord Centre = new(0, 0);
    private static readonly HexCoord ShrineHex = new(1, 0);

    /// <summary>A settlement with a Longhouse (Lv 3, so a shrine may stand) and a placed shrine.</summary>
    private static Settlement FoundWithShrine(BuildingType shrineType, int shrineLevel, double stock = 100_000)
    {
        var placed = new[] { (BuildingType.Longhouse, 3), (shrineType, shrineLevel) };
        var (production, capacity) = BuildingCatalogue.Totals(placed);

        return new Settlement
        {
            Id = Guid.CreateVersion7(),
            Name = "Bjornstad",
            Centre = Centre,
            Buildings =
            [
                new PlacedBuilding(Centre, BuildingType.Longhouse, 3),
                new PlacedBuilding(ShrineHex, shrineType, shrineLevel),
            ],
            Resources = ResourcePool.Create(ResourceAmounts.Uniform(stock), production, capacity, T0),
        };
    }

    private static RuneInstance NewRune(RuneType type, RuneRarity rarity) =>
        new() { Id = Guid.CreateVersion7(), Type = type, Rarity = rarity };

    [Fact]
    public void A_shrines_own_favour_boosts_totals_with_no_rune_slotted()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfThor, 1);
        var (baseProduction, _) = BuildingCatalogue.Totals(
        [
            (BuildingType.Longhouse, 3),
            (BuildingType.ShrineOfThor, 1),
        ]);
        var favour = ShrineCatalogue.Favour(GodType.Thor, 1);

        var (production, _) = settlement.CurrentTotals();

        Assert.Equal(baseProduction.Wood * (1 + favour.ProductionBonus.Wood), production.Wood, 6);
        Assert.Equal(baseProduction.Stone * (1 + favour.ProductionBonus.Stone), production.Stone, 6);
        // Food is not in Thor's domain — untouched by the shrine.
        Assert.Equal(baseProduction.Food, production.Food, 6);
    }

    [Fact]
    public void Slotting_a_rune_adds_its_effect_on_top_of_the_shrines_own_favour()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfThor, 1);
        var rune = NewRune(RuneType.Fehu, RuneRarity.Carved);
        settlement = settlement.GrantRune(rune);

        var result = settlement.SlotRune(rune.Id, ShrineHex, T0);
        Assert.True(result.Accepted);

        var (baseProduction, _) = BuildingCatalogue.Totals(
        [
            (BuildingType.Longhouse, 3),
            (BuildingType.ShrineOfThor, 1),
        ]);
        var favour = ShrineCatalogue.Favour(GodType.Thor, 1);
        var runeEffect = RuneCatalogue.Effect(RuneType.Fehu, RuneRarity.Carved);

        var (production, _) = result.Settlement!.CurrentTotals();

        Assert.Equal(
            baseProduction.Wood * (1 + favour.ProductionBonus.Wood + runeEffect.ProductionBonus.Wood),
            production.Wood,
            6);
    }

    [Fact]
    public void Unslotting_a_rune_removes_its_effect_and_returns_it_to_storage()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfThor, 1);
        var rune = NewRune(RuneType.Fehu, RuneRarity.Carved);
        settlement = settlement.GrantRune(rune).SlotRune(rune.Id, ShrineHex, T0).Settlement!;

        var result = settlement.UnslotRune(rune.Id, T0);
        Assert.True(result.Accepted);

        var unslotted = result.Settlement!;
        Assert.Null(unslotted.Runes.Single(r => r.Id == rune.Id).SlottedAt);

        var (withoutRune, _) = unslotted.CurrentTotals();
        var (withShrineOnly, _) = FoundWithShrine(BuildingType.ShrineOfThor, 1).CurrentTotals();
        Assert.Equal(withShrineOnly.Wood, withoutRune.Wood, 6);
    }

    [Fact]
    public void Slotting_an_unknown_rune_is_rejected()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfThor, 1);

        var result = settlement.SlotRune(Guid.NewGuid(), ShrineHex, T0);

        Assert.False(result.Accepted);
        Assert.Equal(SlotRuneRejection.RuneNotFound, result.Rejection);
    }

    [Fact]
    public void Slotting_an_already_slotted_rune_is_rejected()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfThor, 1);
        var rune = NewRune(RuneType.Fehu, RuneRarity.Carved);
        settlement = settlement.GrantRune(rune).SlotRune(rune.Id, ShrineHex, T0).Settlement!;

        var result = settlement.SlotRune(rune.Id, ShrineHex, T0);

        Assert.False(result.Accepted);
        Assert.Equal(SlotRuneRejection.RuneAlreadySlotted, result.Rejection);
    }

    [Fact]
    public void Slotting_into_a_hex_without_a_shrine_is_rejected()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfThor, 1);
        var granted = settlement.GrantRune(NewRune(RuneType.Fehu, RuneRarity.Carved));
        var runeId = granted.Runes[0].Id;

        // The Longhouse's hex holds a building, but not a shrine.
        var onLonghouse = granted.SlotRune(runeId, Centre, T0);
        Assert.Equal(SlotRuneRejection.NoShrineOnHex, onLonghouse.Rejection);

        // An empty hex holds no building at all.
        var onEmptyHex = granted.SlotRune(runeId, new HexCoord(9, 9), T0);
        Assert.Equal(SlotRuneRejection.NoShrineOnHex, onEmptyHex.Rejection);
    }

    [Fact]
    public void Slotting_past_a_shrines_slot_count_is_rejected()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfThor, 1); // level 1 => 1 slot
        var first = NewRune(RuneType.Fehu, RuneRarity.Carved);
        var second = NewRune(RuneType.Fehu, RuneRarity.Carved);
        settlement = settlement.GrantRune(first).GrantRune(second);
        settlement = settlement.SlotRune(first.Id, ShrineHex, T0).Settlement!;

        var result = settlement.SlotRune(second.Id, ShrineHex, T0);

        Assert.False(result.Accepted);
        Assert.Equal(SlotRuneRejection.ShrineSlotsFull, result.Rejection);
    }

    [Fact]
    public void Unslotting_an_unknown_rune_is_rejected()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfThor, 1);

        var result = settlement.UnslotRune(Guid.NewGuid(), T0);

        Assert.Equal(UnslotRuneRejection.RuneNotFound, result.Rejection);
    }

    [Fact]
    public void Unslotting_a_rune_already_in_storage_is_rejected()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfThor, 1);
        var rune = NewRune(RuneType.Fehu, RuneRarity.Carved);
        settlement = settlement.GrantRune(rune);

        var result = settlement.UnslotRune(rune.Id, T0);

        Assert.Equal(UnslotRuneRejection.RuneNotSlotted, result.Rejection);
    }

    [Fact]
    public void Stacked_bonuses_are_capped_at_MaxEffectBonus()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfThor, 5); // 3 slots, +22% favour
        var runes = new[]
        {
            NewRune(RuneType.Fehu, RuneRarity.Blooded), // +12%
            NewRune(RuneType.Fehu, RuneRarity.Blooded), // +12%
            NewRune(RuneType.Fehu, RuneRarity.Blooded), // +12% -> uncapped total 22% + 36% = 58%
        };

        foreach (var rune in runes)
        {
            settlement = settlement.GrantRune(rune);
        }

        foreach (var rune in runes)
        {
            var result = settlement.SlotRune(rune.Id, ShrineHex, T0);
            Assert.True(result.Accepted, $"expected accept, got {result.Rejection}");
            settlement = result.Settlement!;
        }

        var (baseProduction, _) = BuildingCatalogue.Totals(
        [
            (BuildingType.Longhouse, 3),
            (BuildingType.ShrineOfThor, 5),
        ]);

        var (production, _) = settlement.CurrentTotals();

        Assert.Equal(baseProduction.Wood * (1 + Settlement.MaxEffectBonus), production.Wood, 6);
    }

    [Fact]
    public void An_Othala_rune_boosts_storage_capacity_not_production()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfFreyja, 1);
        var rune = NewRune(RuneType.Othala, RuneRarity.Carved);
        settlement = settlement.GrantRune(rune).SlotRune(rune.Id, ShrineHex, T0).Settlement!;

        var (baseProduction, baseCapacity) = BuildingCatalogue.Totals(
        [
            (BuildingType.Longhouse, 3),
            (BuildingType.ShrineOfFreyja, 1),
        ]);
        var runeEffect = RuneCatalogue.Effect(RuneType.Othala, RuneRarity.Carved);

        var (production, capacity) = settlement.CurrentTotals();

        Assert.Equal(baseCapacity.Wood * (1 + runeEffect.StorageBonus), capacity.Wood, 6);
        var favour = ShrineCatalogue.Favour(GodType.Freyja, 1);
        Assert.Equal(baseProduction.Food * (1 + favour.ProductionBonus.Food), production.Food, 6);
    }

    [Fact]
    public void Granting_a_rune_ignores_any_incoming_slot_and_stores_it_unslotted()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfThor, 1);
        var rune = NewRune(RuneType.Fehu, RuneRarity.Carved) with { SlottedAt = ShrineHex };

        settlement = settlement.GrantRune(rune);

        Assert.Null(settlement.Runes.Single(r => r.Id == rune.Id).SlottedAt);
    }

    [Fact]
    public void SettleTo_carries_shrine_favour_into_the_persisted_rate()
    {
        var settlement = FoundWithShrine(BuildingType.ShrineOfThor, 1);
        var order = settlement.PlanBuild(BuildingType.Lumberjack, new HexCoord(2, 0), Terrain.Forest, T0, Guid.CreateVersion7());
        Assert.True(order.Accepted);
        var queued = settlement.Enqueue(order.Order!, T0);

        var settled = queued.SettleTo(order.Order!.CompletesAt).Settlement;

        var (expectedProduction, _) = settled.CurrentTotals();
        Assert.Equal(expectedProduction.Wood, settled.Resources.RatePerHour.Wood, 6);
    }
}
