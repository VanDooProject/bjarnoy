using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class AddArmySiegeTarget : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "WasWallSiege",
                table: "battle_reports",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "TargetWallQ",
                table: "armies",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "TargetWallR",
                table: "armies",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "WasWallSiege",
                table: "battle_reports");

            migrationBuilder.DropColumn(
                name: "TargetWallQ",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "TargetWallR",
                table: "armies");
        }
    }
}
