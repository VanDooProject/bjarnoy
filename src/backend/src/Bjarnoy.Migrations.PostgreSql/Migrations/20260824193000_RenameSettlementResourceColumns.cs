using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class RenameSettlementResourceColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "StockGrain",
                table: "settlements",
                newName: "StockFood");

            migrationBuilder.RenameColumn(
                name: "StockSilver",
                table: "settlements",
                newName: "StockIron");

            migrationBuilder.RenameColumn(
                name: "RateGrain",
                table: "settlements",
                newName: "RateFood");

            migrationBuilder.RenameColumn(
                name: "RateSilver",
                table: "settlements",
                newName: "RateIron");

            migrationBuilder.RenameColumn(
                name: "CapacityGrain",
                table: "settlements",
                newName: "CapacityFood");

            migrationBuilder.RenameColumn(
                name: "CapacitySilver",
                table: "settlements",
                newName: "CapacityIron");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "StockFood",
                table: "settlements",
                newName: "StockGrain");

            migrationBuilder.RenameColumn(
                name: "StockIron",
                table: "settlements",
                newName: "StockSilver");

            migrationBuilder.RenameColumn(
                name: "RateFood",
                table: "settlements",
                newName: "RateGrain");

            migrationBuilder.RenameColumn(
                name: "RateIron",
                table: "settlements",
                newName: "RateSilver");

            migrationBuilder.RenameColumn(
                name: "CapacityFood",
                table: "settlements",
                newName: "CapacityGrain");

            migrationBuilder.RenameColumn(
                name: "CapacityIron",
                table: "settlements",
                newName: "CapacitySilver");
        }
    }
}
