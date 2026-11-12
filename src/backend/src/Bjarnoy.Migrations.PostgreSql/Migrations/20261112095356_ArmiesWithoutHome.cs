using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.PostgreSql.Migrations
{
    /// <inheritdoc />
    public partial class ArmiesWithoutHome : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "SettlementId",
                table: "armies",
                type: "uuid",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AddColumn<string>(
                name: "OwnerId",
                table: "armies",
                type: "character varying(200)",
                maxLength: 200,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "UserId",
                table: "armies",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<Guid>(
                name: "WorldId",
                table: "armies",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            // Backfill: every army takes its world and owner from its home settlement (every army has one until now).
            migrationBuilder.Sql(@"UPDATE armies SET
                ""WorldId"" = (SELECT s.""WorldId"" FROM settlements s WHERE s.""Id"" = armies.""SettlementId""),
                ""OwnerId"" = (SELECT s.""OwnerId"" FROM settlements s WHERE s.""Id"" = armies.""SettlementId""),
                ""UserId"" = (SELECT s.""UserId"" FROM settlements s WHERE s.""Id"" = armies.""SettlementId"")
                WHERE EXISTS (SELECT 1 FROM settlements s WHERE s.""Id"" = armies.""SettlementId"")");

            migrationBuilder.CreateIndex(
                name: "IX_armies_WorldId_OwnerId",
                table: "armies",
                columns: new[] { "WorldId", "OwnerId" });

            migrationBuilder.AddForeignKey(
                name: "FK_armies_worlds_WorldId",
                table: "armies",
                column: "WorldId",
                principalTable: "worlds",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The old schema has no army without a home: those rows cannot go back.
            migrationBuilder.Sql(@"DELETE FROM army_unit_stacks WHERE ""ArmyId"" IN (SELECT ""Id"" FROM armies WHERE ""SettlementId"" IS NULL)");
            migrationBuilder.Sql(@"DELETE FROM armies WHERE ""SettlementId"" IS NULL");

            migrationBuilder.DropForeignKey(
                name: "FK_armies_worlds_WorldId",
                table: "armies");

            migrationBuilder.DropIndex(
                name: "IX_armies_WorldId_OwnerId",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "OwnerId",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "UserId",
                table: "armies");

            migrationBuilder.DropColumn(
                name: "WorldId",
                table: "armies");

            migrationBuilder.AlterColumn<Guid>(
                name: "SettlementId",
                table: "armies",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);
        }
    }
}
