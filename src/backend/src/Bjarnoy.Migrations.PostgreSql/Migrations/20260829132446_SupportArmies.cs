using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class SupportArmies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsSupporting",
                table: "armies",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateIndex(
                name: "IX_armies_TargetSettlementId_IsSupporting",
                table: "armies",
                columns: new[] { "TargetSettlementId", "IsSupporting" });

            migrationBuilder.AddForeignKey(
                name: "FK_armies_settlements_TargetSettlementId",
                table: "armies",
                column: "TargetSettlementId",
                principalTable: "settlements",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_armies_settlements_TargetSettlementId",
                table: "armies");

            migrationBuilder.DropIndex(
                name: "IX_armies_TargetSettlementId_IsSupporting",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "IsSupporting",
                table: "armies");
        }
    }
}
