using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class ArmyFieldBattleImmuneUntil : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RetreatImmune",
                table: "armies");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "FieldBattleImmuneUntil",
                table: "armies",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FieldBattleImmuneUntil",
                table: "armies");

            migrationBuilder.AddColumn<bool>(
                name: "RetreatImmune",
                table: "armies",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }
    }
}
