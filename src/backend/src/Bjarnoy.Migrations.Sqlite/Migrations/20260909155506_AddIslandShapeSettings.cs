using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddIslandShapeSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "IslandBendiness",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "IslandCoastWarp",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "IslandCoastWarpScale",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "IslandLobeBlend",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "IslandLobeMaxScale",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "IslandLobeMinScale",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "IslandMaxElongation",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<int>(
                name: "IslandMaxLobes",
                table: "worlds",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "IslandMinLobes",
                table: "worlds",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IslandBendiness",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandCoastWarp",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandCoastWarpScale",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandLobeBlend",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandLobeMaxScale",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandLobeMinScale",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMaxElongation",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMaxLobes",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMinLobes",
                table: "worlds");
        }
    }
}
