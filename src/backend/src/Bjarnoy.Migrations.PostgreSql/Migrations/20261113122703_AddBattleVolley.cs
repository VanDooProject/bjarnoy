using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddBattleVolley : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "SideAVolleyPower",
                table: "field_battle_reports",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "SideBVolleyPower",
                table: "field_battle_reports",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<int>(
                name: "VolleyCount",
                table: "field_battle_report_lines",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<double>(
                name: "ArmyVolleyPower",
                table: "camp_reports",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<int>(
                name: "VolleyLost",
                table: "camp_report_beast_lines",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<double>(
                name: "AttackerVolleyPower",
                table: "battle_reports",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "DefenderVolleyPower",
                table: "battle_reports",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<int>(
                name: "VolleyLost",
                table: "battle_report_defender_lines",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "VolleyLost",
                table: "battle_report_attacker_lines",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SideAVolleyPower",
                table: "field_battle_reports");

            migrationBuilder.DropColumn(
                name: "SideBVolleyPower",
                table: "field_battle_reports");

            migrationBuilder.DropColumn(
                name: "VolleyCount",
                table: "field_battle_report_lines");

            migrationBuilder.DropColumn(
                name: "ArmyVolleyPower",
                table: "camp_reports");

            migrationBuilder.DropColumn(
                name: "VolleyLost",
                table: "camp_report_beast_lines");

            migrationBuilder.DropColumn(
                name: "AttackerVolleyPower",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "DefenderVolleyPower",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "VolleyLost",
                table: "battle_report_defender_lines");

            migrationBuilder.DropColumn(
                name: "VolleyLost",
                table: "battle_report_attacker_lines");
        }
    }
}
