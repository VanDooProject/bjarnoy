using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <summary>
    /// Island density: <c>IslandMaxReach</c> and <c>IslandMinGap</c>. Existing worlds get 0 for
    /// both, the legacy rule (one-ring reach budget, no min gap), so their terrain is unchanged;
    /// new worlds get <c>WorldGenerationOptions</c>' defaults.
    /// </summary>
    /// <inheritdoc />
    public partial class AddIslandDensitySettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "IslandMaxReach",
                table: "worlds",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<double>(
                name: "IslandMinGap",
                table: "worlds",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IslandMaxReach",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "IslandMinGap",
                table: "worlds");
        }
    }
}
