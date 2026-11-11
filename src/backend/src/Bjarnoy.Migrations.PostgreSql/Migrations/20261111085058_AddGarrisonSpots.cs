using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddGarrisonSpots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_unit_stacks_SettlementId_UnitType",
                table: "unit_stacks");

            migrationBuilder.AddColumn<int>(
                name: "SpotQ",
                table: "unit_stacks",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "SpotR",
                table: "unit_stacks",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "HomeSpotQ",
                table: "armies",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "HomeSpotR",
                table: "armies",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // Existing garrisons stand at the settlement's centre, ships at the Dockyard nearest the centre (by hex distance,
            // ties by Q, then R), else the centre; an army's home spot and a guest's spot follow the same rule.
            migrationBuilder.Sql("UPDATE unit_stacks SET \"SpotQ\" = (SELECT s.\"CentreQ\" FROM settlements s WHERE s.\"Id\" = unit_stacks.\"SettlementId\"), \"SpotR\" = (SELECT s.\"CentreR\" FROM settlements s WHERE s.\"Id\" = unit_stacks.\"SettlementId\")");

            migrationBuilder.Sql("UPDATE unit_stacks SET \"SpotQ\" = COALESCE((SELECT b.\"Q\" FROM placed_buildings b JOIN settlements s ON s.\"Id\" = b.\"SettlementId\" WHERE b.\"SettlementId\" = unit_stacks.\"SettlementId\" AND b.\"Type\" = 13 ORDER BY (ABS(b.\"Q\" - s.\"CentreQ\") + ABS(b.\"R\" - s.\"CentreR\") + ABS((b.\"Q\" - s.\"CentreQ\") + (b.\"R\" - s.\"CentreR\"))) / 2, b.\"Q\", b.\"R\" LIMIT 1), \"SpotQ\"), \"SpotR\" = COALESCE((SELECT b.\"R\" FROM placed_buildings b JOIN settlements s ON s.\"Id\" = b.\"SettlementId\" WHERE b.\"SettlementId\" = unit_stacks.\"SettlementId\" AND b.\"Type\" = 13 ORDER BY (ABS(b.\"Q\" - s.\"CentreQ\") + ABS(b.\"R\" - s.\"CentreR\") + ABS((b.\"Q\" - s.\"CentreQ\") + (b.\"R\" - s.\"CentreR\"))) / 2, b.\"Q\", b.\"R\" LIMIT 1), \"SpotR\") WHERE \"UnitType\" IN (7, 8)");

            migrationBuilder.Sql("UPDATE armies SET \"HomeSpotQ\" = (SELECT s.\"CentreQ\" FROM settlements s WHERE s.\"Id\" = armies.\"SettlementId\"), \"HomeSpotR\" = (SELECT s.\"CentreR\" FROM settlements s WHERE s.\"Id\" = armies.\"SettlementId\")");

            migrationBuilder.Sql("UPDATE armies SET \"HomeSpotQ\" = COALESCE((SELECT b.\"Q\" FROM placed_buildings b JOIN settlements s ON s.\"Id\" = b.\"SettlementId\" WHERE b.\"SettlementId\" = armies.\"SettlementId\" AND b.\"Type\" = 13 ORDER BY (ABS(b.\"Q\" - s.\"CentreQ\") + ABS(b.\"R\" - s.\"CentreR\") + ABS((b.\"Q\" - s.\"CentreQ\") + (b.\"R\" - s.\"CentreR\"))) / 2, b.\"Q\", b.\"R\" LIMIT 1), \"HomeSpotQ\"), \"HomeSpotR\" = COALESCE((SELECT b.\"R\" FROM placed_buildings b JOIN settlements s ON s.\"Id\" = b.\"SettlementId\" WHERE b.\"SettlementId\" = armies.\"SettlementId\" AND b.\"Type\" = 13 ORDER BY (ABS(b.\"Q\" - s.\"CentreQ\") + ABS(b.\"R\" - s.\"CentreR\") + ABS((b.\"Q\" - s.\"CentreQ\") + (b.\"R\" - s.\"CentreR\"))) / 2, b.\"Q\", b.\"R\" LIMIT 1), \"HomeSpotR\") WHERE EXISTS (SELECT 1 FROM army_unit_stacks a WHERE a.\"ArmyId\" = armies.\"Id\" AND a.\"UnitType\" IN (7, 8))");

            migrationBuilder.Sql("UPDATE armies SET \"TargetBuildingQ\" = (SELECT s.\"CentreQ\" FROM settlements s WHERE s.\"Id\" = armies.\"TargetSettlementId\"), \"TargetBuildingR\" = (SELECT s.\"CentreR\" FROM settlements s WHERE s.\"Id\" = armies.\"TargetSettlementId\") WHERE \"IsSupporting\" = TRUE");

            migrationBuilder.Sql("UPDATE armies SET \"TargetBuildingQ\" = COALESCE((SELECT b.\"Q\" FROM placed_buildings b JOIN settlements s ON s.\"Id\" = b.\"SettlementId\" WHERE b.\"SettlementId\" = armies.\"TargetSettlementId\" AND b.\"Type\" = 13 ORDER BY (ABS(b.\"Q\" - s.\"CentreQ\") + ABS(b.\"R\" - s.\"CentreR\") + ABS((b.\"Q\" - s.\"CentreQ\") + (b.\"R\" - s.\"CentreR\"))) / 2, b.\"Q\", b.\"R\" LIMIT 1), \"TargetBuildingQ\"), \"TargetBuildingR\" = COALESCE((SELECT b.\"R\" FROM placed_buildings b JOIN settlements s ON s.\"Id\" = b.\"SettlementId\" WHERE b.\"SettlementId\" = armies.\"TargetSettlementId\" AND b.\"Type\" = 13 ORDER BY (ABS(b.\"Q\" - s.\"CentreQ\") + ABS(b.\"R\" - s.\"CentreR\") + ABS((b.\"Q\" - s.\"CentreQ\") + (b.\"R\" - s.\"CentreR\"))) / 2, b.\"Q\", b.\"R\" LIMIT 1), \"TargetBuildingR\") WHERE \"IsSupporting\" = TRUE AND EXISTS (SELECT 1 FROM army_unit_stacks a WHERE a.\"ArmyId\" = armies.\"Id\" AND a.\"UnitType\" IN (7, 8))");

            migrationBuilder.CreateIndex(
                name: "IX_unit_stacks_SettlementId_SpotQ_SpotR_UnitType",
                table: "unit_stacks",
                columns: new[] { "SettlementId", "SpotQ", "SpotR", "UnitType" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_unit_stacks_SettlementId_SpotQ_SpotR_UnitType",
                table: "unit_stacks");

            migrationBuilder.DropColumn(
                name: "SpotQ",
                table: "unit_stacks");

            migrationBuilder.DropColumn(
                name: "SpotR",
                table: "unit_stacks");

            migrationBuilder.DropColumn(
                name: "HomeSpotQ",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "HomeSpotR",
                table: "armies");

            migrationBuilder.CreateIndex(
                name: "IX_unit_stacks_SettlementId_UnitType",
                table: "unit_stacks",
                columns: new[] { "SettlementId", "UnitType" },
                unique: true);
        }
    }
}
