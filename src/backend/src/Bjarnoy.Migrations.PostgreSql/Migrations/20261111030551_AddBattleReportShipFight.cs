using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddBattleReportShipFight : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FireShipsBurned",
                table: "battle_reports",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "FireSiegeLevelAfter",
                table: "battle_reports",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FireSiegeLevelBefore",
                table: "battle_reports",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "FireSiegeSettlementRazed",
                table: "battle_reports",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FireSiegeTargetQ",
                table: "battle_reports",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FireSiegeTargetR",
                table: "battle_reports",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FireSiegeTargetType",
                table: "battle_reports",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "ShipFightAttackPower",
                table: "battle_reports",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "ShipFightDefensePower",
                table: "battle_reports",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ShipFightWinner",
                table: "battle_reports",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Fight",
                table: "battle_report_defender_lines",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "Fight",
                table: "battle_report_attacker_lines",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FireShipsBurned",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "FireSiegeLevelAfter",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "FireSiegeLevelBefore",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "FireSiegeSettlementRazed",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "FireSiegeTargetQ",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "FireSiegeTargetR",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "FireSiegeTargetType",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "ShipFightAttackPower",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "ShipFightDefensePower",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "ShipFightWinner",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "Fight",
                table: "battle_report_defender_lines");

            migrationBuilder.DropColumn(
                name: "Fight",
                table: "battle_report_attacker_lines");
        }
    }
}
