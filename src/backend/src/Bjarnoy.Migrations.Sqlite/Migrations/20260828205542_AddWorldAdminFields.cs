using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Bjarnoy.Migrations.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddWorldAdminFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EndbossAt",
                table: "worlds",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "EndbossTriggeredAt",
                table: "worlds",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "JoinsClosed",
                table: "worlds",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<double>(
                name: "SpeedFactor",
                table: "worlds",
                type: "REAL",
                nullable: false,
                defaultValue: 1.0);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "StartsAt",
                table: "worlds",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "EndbossAt",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "EndbossTriggeredAt",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "JoinsClosed",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "SpeedFactor",
                table: "worlds");

            migrationBuilder.DropColumn(
                name: "StartsAt",
                table: "worlds");
        }
    }
}
