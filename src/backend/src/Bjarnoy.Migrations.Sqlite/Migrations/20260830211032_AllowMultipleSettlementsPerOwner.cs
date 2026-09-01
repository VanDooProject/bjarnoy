using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AllowMultipleSettlementsPerOwner : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_settlements_WorldId_OwnerId",
                table: "settlements");

            migrationBuilder.CreateIndex(
                name: "IX_settlements_WorldId_OwnerId",
                table: "settlements",
                columns: new[] { "WorldId", "OwnerId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_settlements_WorldId_OwnerId",
                table: "settlements");

            migrationBuilder.CreateIndex(
                name: "IX_settlements_WorldId_OwnerId",
                table: "settlements",
                columns: new[] { "WorldId", "OwnerId" },
                unique: true);
        }
    }
}
