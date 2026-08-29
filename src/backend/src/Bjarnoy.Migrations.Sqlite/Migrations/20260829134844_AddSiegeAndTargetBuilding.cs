using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddSiegeAndTargetBuilding : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "SiegeLevelAfter",
                table: "battle_reports",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SiegeLevelBefore",
                table: "battle_reports",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "SiegeSettlementRazed",
                table: "battle_reports",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SiegeTargetQ",
                table: "battle_reports",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SiegeTargetR",
                table: "battle_reports",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SiegeTargetType",
                table: "battle_reports",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetBuildingQ",
                table: "armies",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetBuildingR",
                table: "armies",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SiegeLevelAfter",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "SiegeLevelBefore",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "SiegeSettlementRazed",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "SiegeTargetQ",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "SiegeTargetR",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "SiegeTargetType",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "TargetBuildingQ",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "TargetBuildingR",
                table: "armies");
        }
    }
}
