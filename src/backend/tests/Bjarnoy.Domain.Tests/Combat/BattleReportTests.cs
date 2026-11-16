using Bjarnoy.Domain.Buildings;
using Bjarnoy.Domain.Combat;
using Bjarnoy.Domain.Economy;
using Bjarnoy.Domain.Units;
using Bjarnoy.Domain.World;

namespace Bjarnoy.Domain.Tests.Combat;

/// <summary>A report of an attack records both fights of a fleet (<see cref="BattleReport.From"/>).</summary>
public class BattleReportTests
{
    private static readonly HexCoord SeaHex = new(5, 0);
    private static readonly ResourceAmounts Stock = new(10_000, 10_000, 10_000, 10_000);

    private static Terrain Strait(HexCoord c) => c.Q is >= 3 and <= 8 ? Terrain.Sea : Terrain.Grass;

    private static (UnitStack[] Sent, AttackPlan Plan) Fight(
        UnitStack[] sent, UnitStack[]? home = null, PlacedBuilding[]? extra = null, HexCoord? target = null, bool raid = false)
    {
        PlacedBuilding[] buildings = [new(new HexCoord(0, 0), BuildingType.Longhouse, 10), .. extra ?? []];
        var plan = AttackResolver.Resolve(
            sent, home ?? [], [], 0, Stock, seed: 1, raid, 0, 0, target, buildings, Strait, double.PositiveInfinity);
        return (sent, plan);
    }

    private static BattleReport ReportOf(UnitStack[] sent, AttackPlan plan, bool raid = false) =>
        BattleReport.From(Guid.NewGuid(), DateTimeOffset.UnixEpoch, Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), sent, plan, seed: 1, raid);

    [Fact]
    public void A_land_armys_report_is_its_one_fight_as_before_with_no_ship_fight()
    {
        var (sent, plan) = Fight([new(UnitType.Axeman, 20)], home: [new(UnitType.Spearman, 10), new(UnitType.Snekkja, 3)]);

        var report = ReportOf(sent, plan);

        Assert.Null(report.ShipFight);
        Assert.Empty(report.Drowned);
        Assert.Equal(0, report.FireShipsBurned);
        Assert.Null(report.FireSiege);
        Assert.Equal(350, report.DefensePower);
        Assert.Equal(BattleWinner.Attacker, report.Winner);
        var line = Assert.Single(report.AttackerLines);
        Assert.Equal(new BattleReportAttackerLine(UnitType.Axeman, 20, line.Lost, 20 - line.Lost), line);
        Assert.Equal(plan.Loot, report.LootTaken);
    }

    [Fact]
    public void A_fleets_report_has_a_ship_section_and_the_land_fight_of_the_passengers_still_aboard()
    {
        // 2 Longships against 2: one ship is lost, 20 of the 40 spearmen drown, the other 20 fight on land.
        var (sent, plan) = Fight([new(UnitType.Snekkja, 2), new(UnitType.Spearman, 40)], home: [new(UnitType.Snekkja, 2)]);

        var report = ReportOf(sent, plan);

        var ship = report.ShipFight!;
        Assert.Equal(120, ship.AttackPower);
        Assert.Equal(80, ship.DefensePower);
        Assert.Equal(BattleWinner.Attacker, ship.Winner);
        var shipLine = Assert.Single(ship.AttackerLines);
        Assert.Equal(new BattleReportAttackerLine(UnitType.Snekkja, 2, 1, 1), shipLine);
        Assert.Equal(UnitType.Snekkja, Assert.Single(ship.DefenderLines).Type);

        Assert.Equal(new UnitStack(UnitType.Spearman, 20), Assert.Single(report.Drowned));
        // The land fight's line covers the 20 that were still aboard, not the 40 sent.
        Assert.Equal(20, Assert.Single(report.AttackerLines).Sent);
    }

    [Fact]
    public void A_fire_ship_attack_records_the_ships_burned_and_the_fire_siege_and_no_land_fight()
    {
        var harbour = new PlacedBuilding(SeaHex, BuildingType.Harbour, 3);
        var (sent, plan) = Fight([new(UnitType.FireHulk, 25)], extra: [harbour], target: SeaHex);

        var report = ReportOf(sent, plan);

        Assert.Equal(20, report.FireShipsBurned);
        var fire = report.FireSiege!;
        Assert.Equal(SeaHex, fire.TargetCoord);
        Assert.Equal(BuildingType.Harbour, fire.TargetType);
        Assert.Equal((3, 1), (fire.LevelBefore, fire.LevelAfter));
        Assert.Null(report.ShipFight);
        Assert.Empty(report.AttackerLines);
        Assert.Null(report.Siege);
        Assert.Equal(BattleWinner.Attacker, report.Winner);
    }

    [Fact]
    public void A_lost_ship_fight_is_the_reports_winner_and_has_no_land_fight()
    {
        var (sent, plan) = Fight([new(UnitType.Karve, 5), new(UnitType.Spearman, 10)], home: [new(UnitType.Snekkja, 100)]);

        var report = ReportOf(sent, plan);

        Assert.Equal(BattleWinner.Defender, report.Winner);
        Assert.Equal(BattleWinner.Defender, report.ShipFight!.Winner);
        Assert.Empty(report.AttackerLines);
        Assert.Equal(new UnitStack(UnitType.Spearman, 10), Assert.Single(report.Drowned));
        Assert.Equal(ResourceAmounts.Zero, report.LootTaken);
    }
}
