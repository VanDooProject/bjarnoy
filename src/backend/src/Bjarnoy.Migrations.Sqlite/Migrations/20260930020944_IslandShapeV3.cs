using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <summary>
    /// Island shape v3: replaces the lobe-chain columns with the spine/width/coast-noise
    /// knobs. Existing worlds are reset to the new defaults — their old islands do not
    /// survive the shape change (see docs/design/river-generation.md), so there is no
    /// data-preserving mapping to write; a reseed is the way to get a world that
    /// matches its new generation constants.
    /// </summary>
    /// <inheritdoc />
    public partial class IslandShapeV3 : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IslandMinRadius",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMaxRadius",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMinLobes",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMaxLobes",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandBendiness",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandLobeBlend",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandLobeMinScale",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandLobeMaxScale",
                table: "worlds");

            migrationBuilder.AddColumn<double>(
                name: "IslandMinWidth",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 21.0);

            migrationBuilder.AddColumn<double>(
                name: "IslandMaxWidth",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 40.0);

            migrationBuilder.AddColumn<int>(
                name: "IslandMinSegments",
                table: "worlds",
                type: "INTEGER",
                nullable: false,
                defaultValue: 5);

            migrationBuilder.AddColumn<int>(
                name: "IslandMaxSegments",
                table: "worlds",
                type: "INTEGER",
                nullable: false,
                defaultValue: 9);

            migrationBuilder.AddColumn<double>(
                name: "IslandMinElongation",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 5.0);

            migrationBuilder.AddColumn<double>(
                name: "IslandMinBend",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.12);

            migrationBuilder.AddColumn<double>(
                name: "IslandMaxBend",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.35);

            migrationBuilder.AddColumn<double>(
                name: "IslandCoastNoise",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 1.0);

            migrationBuilder.AddColumn<double>(
                name: "IslandCoastNoiseScale",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 49.0);

            migrationBuilder.AddColumn<double>(
                name: "IslandSmallShare",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.3);

            migrationBuilder.AddColumn<double>(
                name: "IslandLargeShare",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.12);

            migrationBuilder.Sql("UPDATE worlds SET \"IslandCellSize\" = 260, \"IslandChance\" = 0.8, \"IslandMaxElongation\" = 8.0, \"IslandCoastWarp\" = 9.5, \"IslandCoastWarpScale\" = 42.0, \"BeachThreshold\" = 0.9");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IslandMinWidth",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMaxWidth",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMinSegments",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMaxSegments",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMinElongation",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMinBend",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMaxBend",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandCoastNoise",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandCoastNoiseScale",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandSmallShare",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandLargeShare",
                table: "worlds");

            migrationBuilder.AddColumn<double>(
                name: "IslandMinRadius",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 5.0);

            migrationBuilder.AddColumn<double>(
                name: "IslandMaxRadius",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 11.5);

            migrationBuilder.AddColumn<int>(
                name: "IslandMinLobes",
                table: "worlds",
                type: "INTEGER",
                nullable: false,
                defaultValue: 3);

            migrationBuilder.AddColumn<int>(
                name: "IslandMaxLobes",
                table: "worlds",
                type: "INTEGER",
                nullable: false,
                defaultValue: 6);

            migrationBuilder.AddColumn<double>(
                name: "IslandBendiness",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 2.8);

            migrationBuilder.AddColumn<double>(
                name: "IslandLobeBlend",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.12);

            migrationBuilder.AddColumn<double>(
                name: "IslandLobeMinScale",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.32);

            migrationBuilder.AddColumn<double>(
                name: "IslandLobeMaxScale",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.98);

            migrationBuilder.Sql("UPDATE worlds SET \"IslandCellSize\" = 36, \"IslandChance\" = 0.45, \"IslandMaxElongation\" = 2.0, \"IslandCoastWarp\" = 2.8, \"IslandCoastWarpScale\" = 4.5, \"BeachThreshold\" = 0.82");
        }
    }
}
